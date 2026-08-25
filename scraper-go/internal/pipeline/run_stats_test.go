package pipeline

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProviderRunStatsAggregatesCompletionCancellationErrorsAndTimeouts(t *testing.T) {
	stats := newProviderRunStats(nil)
	gupyTask := adapterTask{
		provider: ports.ProviderGupy,
		mode:     ports.DiscoveryBatch,
	}
	theMuseTask := adapterTask{
		provider: ports.ProviderTheMuse,
		mode:     ports.DiscoveryCatalog,
	}

	stats.recordProduced(gupyTask)
	stats.recordProduced(gupyTask)
	stats.recordProduced(gupyTask)
	stats.recordProduced(theMuseTask)
	stats.recordCompleted(gupyTask, context.DeadlineExceeded, 2*time.Second)
	stats.recordCompleted(gupyTask, context.Canceled, time.Second)
	stats.recordCompleted(theMuseTask, errors.New("provider unavailable"), time.Second)

	snapshots := stats.snapshots()

	require.Len(t, snapshots, 2)
	assert.Equal(t, providerRunSummary{
		Provider:  ports.ProviderGupy,
		Mode:      ports.DiscoveryBatch,
		Produced:  3,
		Completed: 2,
		Cancelled: 2,
		Errors:    1,
		Timeouts:  1,
		Duration:  3 * time.Second,
	}, snapshots[0])
	assert.Equal(t, providerRunSummary{
		Provider:  ports.ProviderTheMuse,
		Mode:      ports.DiscoveryCatalog,
		Produced:  1,
		Completed: 1,
		Errors:    1,
		Duration:  time.Second,
	}, snapshots[1])
}
