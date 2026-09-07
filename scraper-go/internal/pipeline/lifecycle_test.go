package pipeline

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/runlock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/goleak"
)

func TestRunExecutesMultipleTasksSequentiallyWhenGlobalLimitIsOne(t *testing.T) {
	defer goleak.VerifyNone(t, goleak.IgnoreCurrent())

	var current atomic.Int32
	var peak atomic.Int32
	var completed atomic.Int32
	adapter := schedulerTestAdapter{
		provider: ports.ProviderGupy,
		search: func(context.Context, string) ([]domain.Job, error) {
			n := current.Add(1)
			updatePeak(&peak, n)
			time.Sleep(15 * time.Millisecond)
			current.Add(-1)
			completed.Add(1)
			return nil, nil
		},
	}

	_, err := runWithConcurrency(
		context.Background(),
		[]ports.JobSource{adapter},
		domain.ScrapeRequest{
			Keywords:       []string{"go", "java", "python", "rust"},
			MaxConcurrency: 1,
		},
		1,
		nil,
		defaultProcessConfig(),
	)

	require.NoError(t, err)
	assert.Equal(t, int32(1), peak.Load())
	assert.Equal(t, int32(4), completed.Load())
}

func TestRunReleasesPermitsAfterSuccessErrorAndCancellation(t *testing.T) {
	defer goleak.VerifyNone(t, goleak.IgnoreCurrent())

	t.Run("success then adapter error", func(t *testing.T) {
		var calls atomic.Int32
		adapter := schedulerTestAdapter{
			provider: ports.ProviderAdzuna,
			search: func(_ context.Context, keyword string) ([]domain.Job, error) {
				calls.Add(1)
				if keyword == "fail" {
					return nil, errors.New("adapter failed")
				}
				return nil, nil
			},
		}

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_, err := runWithConcurrency(
			ctx,
			[]ports.JobSource{adapter},
			domain.ScrapeRequest{
				Keywords:       []string{"ok", "fail"},
				MaxConcurrency: 1,
			},
			1,
			nil,
			defaultProcessConfig(),
		)

		require.NoError(t, err)
		assert.Equal(t, int32(2), calls.Load())
	})

	t.Run("cancel during execution", func(t *testing.T) {
		started := make(chan struct{})
		adapter := schedulerTestAdapter{
			provider: ports.ProviderGupy,
			search: func(ctx context.Context, _ string) ([]domain.Job, error) {
				close(started)
				<-ctx.Done()
				return nil, context.Cause(ctx)
			},
		}
		ctx, cancel := context.WithCancelCause(context.Background())
		done := make(chan error, 1)
		go func() {
			_, err := runWithConcurrency(
				ctx,
				[]ports.JobSource{adapter},
				domain.ScrapeRequest{
					Keywords:       []string{"go", "java"},
					MaxConcurrency: 1,
				},
				1,
				nil,
				defaultProcessConfig(),
			)
			done <- err
		}()

		select {
		case <-started:
		case <-time.After(time.Second):
			t.Fatal("task did not start")
		}
		cancel(runlock.ErrLost)

		select {
		case err := <-done:
			require.ErrorIs(t, err, runlock.ErrLost)
		case <-time.After(time.Second):
			t.Fatal("run did not return after cancellation")
		}
	})
}

func TestRunWaitsForProducerAndWorkersAfterSuccessErrorAndCancellation(t *testing.T) {
	defer goleak.VerifyNone(t, goleak.IgnoreCurrent())

	cases := []struct {
		name   string
		search func(context.Context, string) ([]domain.Job, error)
		cancel bool
	}{
		{
			name: "success",
			search: func(context.Context, string) ([]domain.Job, error) {
				return nil, nil
			},
		},
		{
			name: "adapter error",
			search: func(context.Context, string) ([]domain.Job, error) {
				return nil, errors.New("adapter failed")
			},
		},
		{
			name: "cancellation",
			search: func(ctx context.Context, _ string) ([]domain.Job, error) {
				<-ctx.Done()
				return nil, context.Cause(ctx)
			},
			cancel: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			adapter := schedulerTestAdapter{
				provider: ports.ProviderGupy,
				search:   tc.search,
			}
			ctx, cancel := context.WithCancelCause(context.Background())
			defer cancel(nil)
			if tc.cancel {
				cancel(runlock.ErrLost)
			}

			_, err := runWithConcurrency(
				ctx,
				[]ports.JobSource{adapter},
				domain.ScrapeRequest{
					Keywords:       []string{"go", "java"},
					MaxConcurrency: 2,
				},
				1,
				nil,
				defaultProcessConfig(),
			)
			if tc.cancel {
				require.ErrorIs(t, err, runlock.ErrLost)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestRunCancelsProducerBlockedByBackpressureWithoutStartingNewTasks(t *testing.T) {
	defer goleak.VerifyNone(t, goleak.IgnoreCurrent())

	started := make(chan struct{})
	var startedCount atomic.Int32
	var mu sync.Mutex
	adapter := schedulerTestAdapter{
		provider: ports.ProviderGupy,
		search: func(ctx context.Context, _ string) ([]domain.Job, error) {
			if startedCount.Add(1) == 1 {
				close(started)
			}
			select {
			case <-ctx.Done():
				return nil, context.Cause(ctx)
			case <-time.After(time.Minute):
				mu.Lock()
				defer mu.Unlock()
				return nil, nil
			}
		},
	}
	ctx, cancel := context.WithCancelCause(context.Background())
	done := make(chan error, 1)
	go func() {
		_, err := runWithConcurrency(
			ctx,
			[]ports.JobSource{adapter},
			domain.ScrapeRequest{
				Keywords:       []string{"go", "java", "python", "rust", "node", "php"},
				MaxConcurrency: 1,
			},
			1,
			nil,
			defaultProcessConfig(),
		)
		done <- err
	}()

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first task did not start")
	}
	require.Eventually(t, func() bool {
		return startedCount.Load() == 1
	}, time.Second, time.Millisecond)
	time.Sleep(30 * time.Millisecond)
	cancel(runlock.ErrLost)

	select {
	case err := <-done:
		require.ErrorIs(t, err, runlock.ErrLost)
	case <-time.After(time.Second):
		t.Fatal("run did not return after producer backpressure cancellation")
	}
	assert.Equal(t, int32(1), startedCount.Load())
}
