package pipeline

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/runlock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProviderRunStatsAggregatesCompletionCancellationErrorsAndTimeouts(t *testing.T) {
	stats := newProviderRunStats(nil, nil)
	gupyTask := adapterTask{
		provider: ports.ProviderGupy,
		mode:     ports.DiscoveryBatch,
	}
	theMuseTask := adapterTask{
		adapter: schedulerTestAdapter{
			name:     "The Muse",
			provider: ports.ProviderTheMuse,
			mode:     ports.DiscoveryCatalog,
		},
		provider: ports.ProviderTheMuse,
		mode:     ports.DiscoveryCatalog,
	}

	stats.recordProduced(gupyTask)
	stats.recordProduced(gupyTask)
	stats.recordProduced(gupyTask)
	stats.recordProduced(theMuseTask)
	stats.recordCompleted(context.Background(), gupyTask, context.DeadlineExceeded, 2*time.Second)
	stats.recordCompleted(context.Background(), gupyTask, context.Canceled, time.Second)
	stats.recordCompleted(context.Background(), theMuseTask, errors.New("provider unavailable"), time.Second)

	snapshots := stats.snapshots()

	require.Len(t, snapshots, 2)
	assert.Equal(t, providerRunSummary{
		Provider:  ports.ProviderGupy,
		Mode:      ports.DiscoveryBatch,
		Produced:  3,
		Completed: 2,
		Cancelled: 2,
		Timeouts:  1,
		Duration:  3 * time.Second,
		StopCause: context.DeadlineExceeded.Error(),
	}, snapshots[0])
	require.NotNil(t, snapshots[1].ErrorSample)
	assert.Equal(t, providerRunSummary{
		Provider:  ports.ProviderTheMuse,
		Mode:      ports.DiscoveryCatalog,
		Produced:  1,
		Completed: 1,
		Errors:    1,
		Duration:  time.Second,
		ErrorSample: &providerErrorSample{
			Provider: ports.ProviderTheMuse,
			Source:   "The Muse",
			Mode:     ports.DiscoveryCatalog,
			Error:    "provider unavailable",
		},
	}, snapshots[1])
}

func TestProviderRunStatsCountsCustomCancelCauseAsCancellation(t *testing.T) {
	stats := newProviderRunStats(nil, nil)
	task := adapterTask{
		adapter: schedulerTestAdapter{
			name:     "Greenhouse:acme",
			provider: ports.ProviderGreenhouse,
			mode:     ports.DiscoveryCatalog,
		},
		provider: ports.ProviderGreenhouse,
		mode:     ports.DiscoveryCatalog,
	}
	ctx, cancel := context.WithCancelCause(context.Background())
	cancel(runlock.ErrLost)

	stats.recordProduced(task)
	stats.recordCompleted(ctx, task, context.Cause(ctx), time.Second)

	snapshots := stats.snapshots()
	require.Len(t, snapshots, 1)
	assert.Equal(t, 1, snapshots[0].Cancelled)
	assert.Zero(t, snapshots[0].Errors)
	assert.Equal(t, runlock.ErrLost.Error(), snapshots[0].StopCause)
	assert.Nil(t, snapshots[0].ErrorSample)
}

func TestOutcomeReasonPrefersCustomContextCauseOverGenericCancellation(t *testing.T) {
	ctx, cancel := context.WithCancelCause(context.Background())
	cancel(runlock.ErrLost)

	assert.Equal(t, runlock.ErrLost.Error(), outcomeReason(ctx, context.Canceled))
}

func TestOutcomeReasonPreservesProviderErrorWithoutCancellation(t *testing.T) {
	providerErr := errors.New("provider unavailable")

	assert.Equal(t, providerErr.Error(), outcomeReason(context.Background(), providerErr))
}

func TestProviderRunStatsKeepsFirstErrorSampleAndEffectiveLimit(t *testing.T) {
	budget, err := newConcurrencyBudget(2, 4, map[ports.ProviderID]int{
		ports.ProviderGreenhouse: 3,
	})
	require.NoError(t, err)

	first := adapterTask{
		adapter: schedulerTestAdapter{
			name:     "Greenhouse:acme",
			provider: ports.ProviderGreenhouse,
			mode:     ports.DiscoveryCatalog,
		},
		provider: ports.ProviderGreenhouse,
		mode:     ports.DiscoveryCatalog,
	}
	second := adapterTask{
		adapter: schedulerTestAdapter{
			name:     "Greenhouse:other",
			provider: ports.ProviderGreenhouse,
			mode:     ports.DiscoveryCatalog,
		},
		provider: ports.ProviderGreenhouse,
		mode:     ports.DiscoveryCatalog,
	}
	stats := newProviderRunStats([]ports.JobSource{first.adapter, second.adapter}, budget)

	stats.recordCompleted(context.Background(), first, errors.New("board unavailable"), time.Second)
	stats.recordCompleted(context.Background(), second, errors.New("later failure"), time.Second)

	snapshots := stats.snapshots()
	require.Len(t, snapshots, 1)
	assert.Equal(t, 2, snapshots[0].MaxConcurrencyEffective)
	assert.Equal(t, 2, snapshots[0].Errors)
	require.NotNil(t, snapshots[0].ErrorSample)
	assert.Equal(t, providerErrorSample{
		Provider: ports.ProviderGreenhouse,
		Source:   "Greenhouse:acme",
		Mode:     ports.DiscoveryCatalog,
		Error:    "board unavailable",
	}, *snapshots[0].ErrorSample)
}
