package pipeline

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/cache"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/runlock"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type searchLockAdapter struct {
	calls atomic.Int32
}

type blockingSearchLockAdapter struct {
	started chan struct{}
}

func (a *blockingSearchLockAdapter) SourceName() string {
	return "blocking-search-lock"
}

func (a *blockingSearchLockAdapter) Search(ctx context.Context, _ string, _ domain.ScrapeRequest) ([]domain.Job, error) {
	select {
	case <-a.started:
	default:
		close(a.started)
	}
	<-ctx.Done()
	return nil, context.Cause(ctx)
}

func (a *searchLockAdapter) SourceName() string {
	return "search-lock"
}

func (a *searchLockAdapter) Search(context.Context, string, domain.ScrapeRequest) ([]domain.Job, error) {
	panic("batch path expected")
}

func (a *searchLockAdapter) SearchBatch(context.Context, []string, domain.ScrapeRequest) ([]domain.Job, error) {
	a.calls.Add(1)
	return []domain.Job{{
		Title:    "Go Developer",
		Company:  "Candidate",
		Location: "Remote",
		URL:      "https://example.com/jobs/1",
		Source:   "test",
	}}, nil
}

func TestSearchJobsDoesNotStartAdapterWhenAnotherOriginOwnsLock(t *testing.T) {
	manager, client, _ := newSearchLockManager(t)
	held, err := manager.Acquire(context.Background(), "cron")
	require.NoError(t, err)
	t.Cleanup(func() { _ = held.Release(context.Background()) })
	adapter := &searchLockAdapter{}

	_, err = SearchJobs(
		context.Background(),
		cache.NewMemoryCache(),
		SearchConfig{Keywords: []string{"go"}, MaxConcurrency: 1},
		[]ports.JobSource{adapter},
		time.Minute,
		client,
		manager,
		"public_endpoint",
	)

	require.ErrorIs(t, err, runlock.ErrAlreadyHeld)
	assert.Equal(t, int32(0), adapter.calls.Load())
	assert.Equal(t, int64(0), client.Exists(context.Background(), "scraper:jobs:index").Val())
}

func TestSearchJobsFailsClosedWhenValkeyIsUnavailable(t *testing.T) {
	manager, client, server := newSearchLockManager(t)
	server.Close()
	adapter := &searchLockAdapter{}

	_, err := SearchJobs(
		context.Background(),
		cache.NewMemoryCache(),
		SearchConfig{Keywords: []string{"go"}, MaxConcurrency: 1},
		[]ports.JobSource{adapter},
		time.Minute,
		client,
		manager,
		"public_endpoint",
	)

	require.ErrorIs(t, err, runlock.ErrUnavailable)
	assert.Equal(t, int32(0), adapter.calls.Load())
}

func TestSearchJobsRunsAndReleasesLockWhenItIsFree(t *testing.T) {
	manager, client, _ := newSearchLockManager(t)
	adapter := &searchLockAdapter{}

	result, err := SearchJobs(
		context.Background(),
		cache.NewMemoryCache(),
		SearchConfig{Keywords: []string{"go"}, MaxConcurrency: 1},
		[]ports.JobSource{adapter},
		time.Minute,
		client,
		manager,
		"public_endpoint",
	)

	require.NoError(t, err)
	assert.Equal(t, 0, result.Total)
	assert.Equal(t, int32(1), adapter.calls.Load())
	assert.Equal(t, int64(0), client.Exists(context.Background(), runlock.LockKey).Val())
}

func TestSearchJobsCancelsWithoutIndexingAfterConfirmedLockLoss(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	manager, err := runlock.New(runlock.NewValkeyStore(client), runlock.Config{
		TTL:           200 * time.Millisecond,
		RenewInterval: 25 * time.Millisecond,
	})
	require.NoError(t, err)
	adapter := &blockingSearchLockAdapter{started: make(chan struct{})}
	result := make(chan error, 1)

	go func() {
		_, searchErr := SearchJobs(
			context.Background(),
			cache.NewMemoryCache(),
			SearchConfig{Keywords: []string{"go"}, MaxConcurrency: 1},
			[]ports.JobSource{adapter},
			time.Minute,
			client,
			manager,
			"public_endpoint",
		)
		result <- searchErr
	}()

	select {
	case <-adapter.started:
	case <-time.After(time.Second):
		t.Fatal("adapter did not start")
	}
	require.NoError(t, client.Set(context.Background(), runlock.LockKey, "new-owner", time.Second).Err())

	select {
	case err := <-result:
		require.ErrorIs(t, err, runlock.ErrLost)
	case <-time.After(time.Second):
		t.Fatal("search did not stop after lock loss")
	}
	assert.Equal(t, int64(0), client.Exists(context.Background(), "scraper:jobs:index").Val())
	assert.Equal(t, "new-owner", client.Get(context.Background(), runlock.LockKey).Val())
}

func TestPipelineErrorIsNotMaskedByReleaseFailure(t *testing.T) {
	manager, err := runlock.New(releaseFailingStore{}, runlock.Config{
		TTL:           time.Second,
		RenewInterval: 250 * time.Millisecond,
	})
	require.NoError(t, err)

	_, err = SearchJobs(
		context.Background(),
		cache.NewMemoryCache(),
		SearchConfig{Keywords: []string{"go"}, MaxConcurrency: 0},
		[]ports.JobSource{&searchLockAdapter{}},
		time.Minute,
		nil,
		manager,
		"public_endpoint",
	)

	require.ErrorContains(t, err, "max concurrency")
	assert.NotContains(t, err.Error(), "release failed")
}

func newSearchLockManager(
	t *testing.T,
) (*runlock.Manager, *redis.Client, *miniredis.Miniredis) {
	t.Helper()

	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })

	manager, err := runlock.New(runlock.NewValkeyStore(client), runlock.Config{
		TTL:           2 * time.Second,
		RenewInterval: 500 * time.Millisecond,
	})
	require.NoError(t, err)
	return manager, client, server
}

type releaseFailingStore struct{}

func (releaseFailingStore) TryAcquire(context.Context, string, time.Duration) (bool, error) {
	return true, nil
}

func (releaseFailingStore) WriteState(context.Context, string, runlock.State, time.Duration) (bool, error) {
	return true, nil
}

func (releaseFailingStore) Renew(context.Context, string, runlock.State, time.Duration) (bool, error) {
	return true, nil
}

func (releaseFailingStore) Release(context.Context, string, string) (bool, error) {
	return false, errors.New("release failed")
}
