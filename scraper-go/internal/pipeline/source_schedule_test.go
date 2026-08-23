package pipeline

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type sourceScheduleTestAdapter struct {
	source string
}

func (a sourceScheduleTestAdapter) SourceName() string {
	return a.source
}

func (a sourceScheduleTestAdapter) Search(context.Context, string, domain.ScrapeRequest) ([]domain.Job, error) {
	return nil, nil
}

type batchRunTestAdapter struct {
	searchCalls int
	batchCalls  int
	keywords    []string
}

type cancelAwareAdapter struct {
	started chan struct{}
	calls   atomic.Int32
}

func (a *cancelAwareAdapter) SourceName() string {
	return "Cancel Test"
}

func (a *cancelAwareAdapter) Search(ctx context.Context, _ string, _ domain.ScrapeRequest) ([]domain.Job, error) {
	if a.calls.Add(1) == 1 {
		close(a.started)
	}
	<-ctx.Done()
	return nil, context.Cause(ctx)
}

func (a *batchRunTestAdapter) SourceName() string {
	return "Batch Test"
}

func (a *batchRunTestAdapter) Search(context.Context, string, domain.ScrapeRequest) ([]domain.Job, error) {
	a.searchCalls++
	return nil, nil
}

func (a *batchRunTestAdapter) SearchBatch(_ context.Context, keywords []string, _ domain.ScrapeRequest) ([]domain.Job, error) {
	a.batchCalls++
	a.keywords = append([]string(nil), keywords...)
	return nil, nil
}

func TestFilterAdaptersByCadenceAllowsJoobleTwicePerDay(t *testing.T) {
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	ctx := context.Background()
	adapterList := []adapters.Adapter{
		sourceScheduleTestAdapter{source: "Jooble"},
		sourceScheduleTestAdapter{source: "The Muse"},
	}

	firstRun := filterAdaptersByCadence(ctx, rdb, []adapters.Adapter{
		adapterList[0],
		adapterList[1],
	})
	require.Len(t, firstRun, 2)

	secondRun := filterAdaptersByCadence(ctx, rdb, []adapters.Adapter{
		adapterList[0],
		adapterList[1],
	})
	require.Len(t, secondRun, 1)
	assert.Equal(t, "The Muse", secondRun[0].SourceName())

	mr.FastForward(12*time.Hour + time.Second)

	thirdRun := filterAdaptersByCadence(ctx, rdb, []adapters.Adapter{
		adapterList[0],
		adapterList[1],
	})
	require.Len(t, thirdRun, 2)
}

func TestShouldRunJoobleAllowsWhenRedisUnavailable(t *testing.T) {
	assert.True(t, shouldRunJooble(context.Background(), nil))
}

func TestRunUsesBatchAdapterOnceForAllKeywords(t *testing.T) {
	adapter := &batchRunTestAdapter{}

	_, err := Run(context.Background(), []adapters.Adapter{adapter}, domain.ScrapeRequest{
		Keywords:       []string{"go", "java", "python"},
		MaxConcurrency: 1,
	})
	require.NoError(t, err)

	assert.Equal(t, 0, adapter.searchCalls)
	assert.Equal(t, 1, adapter.batchCalls)
	assert.Equal(t, []string{"go", "java", "python"}, adapter.keywords)
}

func TestRunRejectsInvalidMaxConcurrency(t *testing.T) {
	_, err := Run(context.Background(), []adapters.Adapter{&batchRunTestAdapter{}}, domain.ScrapeRequest{
		Keywords: []string{"go"},
	})

	require.Error(t, err)
	assert.ErrorContains(t, err, "max concurrency")
}

func TestRunExecutesWithValidMaxConcurrency(t *testing.T) {
	adapter := &batchRunTestAdapter{}

	jobs, err := Run(context.Background(), []adapters.Adapter{adapter}, domain.ScrapeRequest{
		Keywords:       []string{"go"},
		MaxConcurrency: 1,
	})

	require.NoError(t, err)
	assert.Empty(t, jobs)
	assert.Equal(t, 1, adapter.batchCalls)
}

func TestRunStopsSchedulingAdaptersAfterContextCancellation(t *testing.T) {
	adapter := &cancelAwareAdapter{started: make(chan struct{})}
	ctx, cancel := context.WithCancelCause(context.Background())
	result := make(chan error, 1)

	go func() {
		_, err := Run(ctx, []adapters.Adapter{adapter}, domain.ScrapeRequest{
			Keywords:       []string{"go", "java", "python"},
			MaxConcurrency: 1,
		})
		result <- err
	}()

	select {
	case <-adapter.started:
	case <-time.After(time.Second):
		t.Fatal("first adapter did not start")
	}
	lostErr := assert.AnError
	cancel(lostErr)

	require.ErrorIs(t, <-result, lostErr)
	assert.Equal(t, int32(1), adapter.calls.Load())
}
