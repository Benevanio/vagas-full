package pipeline

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
)

type providerRunStats struct {
	mu        sync.Mutex
	providers map[ports.ProviderID]*providerRunSummary
}

type providerRunSummary struct {
	Provider  ports.ProviderID
	Mode      ports.DiscoveryMode
	Produced  int
	Completed int
	Cancelled int
	Errors    int
	Timeouts  int
	Duration  time.Duration
}

func newProviderRunStats(adapterList []ports.JobSource) *providerRunStats {
	stats := &providerRunStats{
		providers: make(map[ports.ProviderID]*providerRunSummary),
	}
	for _, adapter := range adapterList {
		capabilities := ports.CapabilitiesOf(adapter)
		if _, exists := stats.providers[capabilities.Provider]; !exists {
			stats.providers[capabilities.Provider] = &providerRunSummary{
				Provider: capabilities.Provider,
				Mode:     capabilities.Mode,
			}
		}
	}
	return stats
}

func (s *providerRunStats) recordProduced(task adapterTask) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.summary(task).Produced++
}

func (s *providerRunStats) recordCompleted(task adapterTask, err error, duration time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	summary := s.summary(task)
	summary.Completed++
	summary.Duration += duration
	if errors.Is(err, context.Canceled) {
		summary.Cancelled++
	} else if err != nil {
		summary.Errors++
	}
	if errors.Is(err, context.DeadlineExceeded) {
		summary.Timeouts++
	}
}

func (s *providerRunStats) summary(task adapterTask) *providerRunSummary {
	summary, exists := s.providers[task.provider]
	if !exists {
		summary = &providerRunSummary{
			Provider: task.provider,
			Mode:     task.mode,
		}
		s.providers[task.provider] = summary
	}
	return summary
}

func (s *providerRunStats) snapshots() []providerRunSummary {
	s.mu.Lock()
	defer s.mu.Unlock()

	snapshots := make([]providerRunSummary, 0, len(s.providers))
	for _, summary := range s.providers {
		snapshot := *summary
		snapshot.Cancelled += max(0, snapshot.Produced-snapshot.Completed)
		snapshots = append(snapshots, snapshot)
	}
	sort.Slice(snapshots, func(i, j int) bool {
		return snapshots[i].Provider < snapshots[j].Provider
	})
	return snapshots
}
