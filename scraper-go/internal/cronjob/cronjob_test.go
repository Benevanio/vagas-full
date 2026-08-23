package cronjob

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/cache"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/jobstore"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/keywords"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/pipeline"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/runlock"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type blockingAdapter struct {
	started chan struct{}
	release chan struct{}
	calls   atomic.Int32
}

type shutdownBlockingAdapter struct {
	started  chan struct{}
	canceled chan struct{}
	finish   chan struct{}
}

func (a *blockingAdapter) SourceName() string {
	return "blocking"
}

func (a *blockingAdapter) Search(ctx context.Context, _ string, _ domain.ScrapeRequest) ([]domain.Job, error) {
	if a.calls.Add(1) == 1 {
		close(a.started)
	}
	select {
	case <-a.release:
		return []domain.Job{schedulerTestJob()}, nil
	case <-ctx.Done():
		return []domain.Job{schedulerTestJob()}, nil
	}
}

func (a *shutdownBlockingAdapter) SourceName() string {
	return "shutdown-blocking"
}

func (a *shutdownBlockingAdapter) Search(
	ctx context.Context,
	_ string,
	_ domain.ScrapeRequest,
) ([]domain.Job, error) {
	close(a.started)
	<-ctx.Done()
	close(a.canceled)
	<-a.finish
	return nil, context.Cause(ctx)
}

func schedulerTestJob() domain.Job {
	return domain.Job{
		Title:       "Backend Engineer",
		Company:     "Candidate",
		Location:    "Remote",
		URL:         "https://example.com/backend-engineer",
		Source:      "test",
		Description: "Backend engineer building Go APIs and distributed systems.",
	}
}

func TestDefaultConfigUsesSafeMaxConcurrency(t *testing.T) {
	cfg := DefaultConfig()

	assert.Equal(t, 12, cfg.MaxConcurrency)
}

func TestSchedulerSearchConfigReceivesGlobalMaxConcurrency(t *testing.T) {
	cfg := DefaultConfig()
	cfg.MaxConcurrency = 9

	scheduler := New(cfg, nil, nil, nil, nil, nil)
	searchConfig := scheduler.searchConfig([]string{"go"})

	assert.Equal(t, 9, searchConfig.MaxConcurrency)
	assert.Equal(t, []string{"go"}, searchConfig.Keywords)
}

func TestAdminManualSharesSchedulerConfig(t *testing.T) {
	cfg := DefaultConfig()
	cfg.MaxConcurrency = 7

	scheduler := New(cfg, nil, nil, nil, nil, nil)

	assert.Equal(t, 7, scheduler.cfg.MaxConcurrency)
}

func TestTwoManualExecutionsStartOnlyOneAdapter(t *testing.T) {
	scheduler, adapter, _ := newConcurrentTestScheduler(t)

	require.NoError(t, scheduler.RunNow(context.Background()))
	waitForAdapterStart(t, adapter)

	err := scheduler.RunNow(context.Background())

	require.ErrorIs(t, err, ErrAlreadyRunning)
	assert.Equal(t, int32(1), adapter.calls.Load())
	close(adapter.release)
	require.Eventually(t, func() bool { return !scheduler.IsRunning() }, time.Second, 10*time.Millisecond)
}

func TestCronSkipsWhileManualExecutionHoldsLock(t *testing.T) {
	scheduler, adapter, _ := newConcurrentTestScheduler(t)

	require.NoError(t, scheduler.RunNow(context.Background()))
	waitForAdapterStart(t, adapter)
	scheduler.runCron(context.Background())

	assert.Equal(t, int32(1), adapter.calls.Load())
	close(adapter.release)
	require.Eventually(t, func() bool { return !scheduler.IsRunning() }, time.Second, 10*time.Millisecond)
}

func TestManualIsRejectedWhileCronExecutionHoldsLock(t *testing.T) {
	scheduler, adapter, _ := newConcurrentTestScheduler(t)

	go scheduler.runCron(context.Background())
	waitForAdapterStart(t, adapter)

	err := scheduler.RunNow(context.Background())

	require.ErrorIs(t, err, ErrAlreadyRunning)
	assert.Equal(t, int32(1), adapter.calls.Load())
	close(adapter.release)
	require.Eventually(t, func() bool { return !scheduler.IsRunning() }, time.Second, 10*time.Millisecond)
}

func TestSecondCronExecutionDoesNotStartAdapters(t *testing.T) {
	scheduler, adapter, _ := newConcurrentTestScheduler(t)

	go scheduler.runCron(context.Background())
	waitForAdapterStart(t, adapter)
	scheduler.runCron(context.Background())

	assert.Equal(t, int32(1), adapter.calls.Load())
	close(adapter.release)
	require.Eventually(t, func() bool { return !scheduler.IsRunning() }, time.Second, 10*time.Millisecond)
}

func TestManualExecutionReleasesLockWhenApplicationContextIsCanceled(t *testing.T) {
	scheduler, adapter, client := newConcurrentTestScheduler(t)
	ctx, cancel := context.WithCancel(context.Background())

	require.NoError(t, scheduler.RunNow(ctx))
	waitForAdapterStart(t, adapter)
	cancel()

	require.Eventually(t, func() bool { return !scheduler.IsRunning() }, time.Second, 10*time.Millisecond)
	assert.Equal(t, int64(0), client.Exists(context.Background(), runlock.LockKey).Val())
}

func TestShutdownWaitsForActiveExecutionToReleaseLock(t *testing.T) {
	scheduler, _, client := newConcurrentTestScheduler(t)
	adapter := &shutdownBlockingAdapter{
		started:  make(chan struct{}),
		canceled: make(chan struct{}),
		finish:   make(chan struct{}),
	}
	scheduler.adapterList = []ports.JobSource{adapter}
	runCtx, cancelRun := context.WithCancel(context.Background())

	require.NoError(t, scheduler.RunNow(runCtx))
	select {
	case <-adapter.started:
	case <-time.After(time.Second):
		t.Fatal("adapter did not start")
	}
	cancelRun()
	select {
	case <-adapter.canceled:
	case <-time.After(time.Second):
		t.Fatal("adapter context was not canceled")
	}

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), time.Second)
	defer cancelShutdown()
	shutdownDone := make(chan error, 1)
	go func() {
		shutdownDone <- scheduler.Shutdown(shutdownCtx)
	}()

	select {
	case err := <-shutdownDone:
		t.Fatalf("shutdown returned before active execution finished: %v", err)
	case <-time.After(50 * time.Millisecond):
	}

	close(adapter.finish)
	require.NoError(t, <-shutdownDone)
	assert.False(t, scheduler.IsRunning())
	assert.Equal(t, int64(0), client.Exists(context.Background(), runlock.LockKey).Val())
	require.ErrorIs(t, scheduler.RunNow(context.Background()), ErrLockUnavailable)
}

func TestSchedulerAndPublicSearchShareLockWithoutStartingOrPersistingSecondRun(t *testing.T) {
	scheduler, adapter, client := newConcurrentTestScheduler(t)

	require.NoError(t, scheduler.RunNow(context.Background()))
	waitForAdapterStart(t, adapter)

	_, err := pipeline.SearchJobs(
		context.Background(),
		cache.NewMemoryCache(),
		pipeline.SearchConfig{Keywords: []string{"go"}, MaxConcurrency: 1},
		scheduler.adapterList,
		time.Minute,
		client,
		scheduler.runLock,
		"public_endpoint",
	)

	require.ErrorIs(t, err, runlock.ErrAlreadyHeld)
	assert.Equal(t, int32(1), adapter.calls.Load())
	assert.Equal(t, int64(0), client.Exists(context.Background(), "scraper:jobs:index").Val())
	close(adapter.release)
	require.Eventually(t, func() bool { return !scheduler.IsRunning() }, time.Second, 10*time.Millisecond)
}

func TestConfirmedLockLossPreventsSchedulerPersistenceAndIndexing(t *testing.T) {
	scheduler, adapter, client := newConcurrentTestScheduler(t)

	require.NoError(t, scheduler.RunNow(context.Background()))
	waitForAdapterStart(t, adapter)
	require.NoError(t, client.Set(
		context.Background(),
		runlock.LockKey,
		"new-owner",
		time.Second,
	).Err())

	require.Eventually(t, func() bool { return !scheduler.IsRunning() }, 2*time.Second, 10*time.Millisecond)

	job := schedulerTestJob()
	jobID := jobstore.StableID(&job)
	assert.Equal(t, int64(0), client.Exists(context.Background(), "scraper:job:"+jobID).Val())
	assert.Equal(t, int64(0), client.Exists(context.Background(), "scraper:jobs:index").Val())
	assert.Equal(t, "new-owner", client.Get(context.Background(), runlock.LockKey).Val())
}

func newConcurrentTestScheduler(t *testing.T) (*Scheduler, *blockingAdapter, *redis.Client) {
	t.Helper()

	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })

	lockManager, err := runlock.New(runlock.NewValkeyStore(client), runlock.Config{
		TTL:           2 * time.Second,
		RenewInterval: 500 * time.Millisecond,
	})
	require.NoError(t, err)

	keywordStore := keywords.NewStore(cache.NewRedisCache(client))
	require.NoError(t, keywordStore.Save(context.Background(), []string{"go"}))

	adapter := &blockingAdapter{
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	cfg := DefaultConfig()
	cfg.ScrapeTimeout = 2 * time.Second
	cfg.MaxConcurrency = 1

	return New(
		cfg,
		keywordStore,
		jobstore.New(client),
		[]ports.JobSource{adapter},
		client,
		lockManager,
	), adapter, client
}

func waitForAdapterStart(t *testing.T, adapter *blockingAdapter) {
	t.Helper()
	select {
	case <-adapter.started:
	case <-time.After(time.Second):
		t.Fatal("adapter did not start")
	}
}
