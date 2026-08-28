package pipeline

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/runlock"
)

type taskOutcome int

const (
	taskOutcomeSuccess taskOutcome = iota
	taskOutcomeCancelled
	taskOutcomeTimeout
	taskOutcomeLockLost
	taskOutcomeProviderError
)

type providerErrorSample struct {
	Provider ports.ProviderID
	Source   string
	Mode     ports.DiscoveryMode
	Error    string
}

type providerRunStats struct {
	mu        sync.Mutex
	budget    *concurrencyBudget
	providers map[ports.ProviderID]*providerRunSummary
}

type providerRunSummary struct {
	Provider                ports.ProviderID
	Mode                    ports.DiscoveryMode
	Produced                int
	Completed               int
	Cancelled               int
	Errors                  int
	Timeouts                int
	Duration                time.Duration
	MaxConcurrencyEffective int
	StopCause               string
	ErrorSample             *providerErrorSample
}

func newProviderRunStats(adapterList []ports.JobSource, budget *concurrencyBudget) *providerRunStats {
	stats := &providerRunStats{
		budget:    budget,
		providers: make(map[ports.ProviderID]*providerRunSummary),
	}
	for _, adapter := range adapterList {
		capabilities := ports.CapabilitiesOf(adapter)
		if _, exists := stats.providers[capabilities.Provider]; !exists {
			stats.providers[capabilities.Provider] = newProviderRunSummary(capabilities.Provider, capabilities.Mode, budget)
		}
	}
	return stats
}

func newProviderRunSummary(
	provider ports.ProviderID,
	mode ports.DiscoveryMode,
	budget *concurrencyBudget,
) *providerRunSummary {
	summary := &providerRunSummary{
		Provider: provider,
		Mode:     mode,
	}
	if budget != nil {
		summary.MaxConcurrencyEffective = budget.providerLimit(provider)
	}
	return summary
}

func (s *providerRunStats) recordProduced(task adapterTask) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.summary(task).Produced++
}

func (s *providerRunStats) recordCompleted(ctx context.Context, task adapterTask, err error, duration time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	summary := s.summary(task)
	summary.Completed++
	summary.Duration += duration

	switch classifyTaskOutcome(ctx, err) {
	case taskOutcomeLockLost, taskOutcomeCancelled:
		summary.Cancelled++
		if summary.StopCause == "" {
			summary.StopCause = outcomeReason(ctx, err)
		}
	case taskOutcomeTimeout:
		summary.Timeouts++
		if summary.StopCause == "" {
			summary.StopCause = outcomeReason(ctx, err)
		}
	case taskOutcomeProviderError:
		summary.Errors++
		if summary.ErrorSample == nil {
			summary.ErrorSample = &providerErrorSample{
				Provider: task.provider,
				Source:   taskSourceName(task),
				Mode:     task.mode,
				Error:    err.Error(),
			}
		}
	}
}

func (s *providerRunStats) summary(task adapterTask) *providerRunSummary {
	summary, exists := s.providers[task.provider]
	if !exists {
		summary = newProviderRunSummary(task.provider, task.mode, s.budget)
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
		if summary.ErrorSample != nil {
			sample := *summary.ErrorSample
			snapshot.ErrorSample = &sample
		}
		snapshots = append(snapshots, snapshot)
	}
	sort.Slice(snapshots, func(i, j int) bool {
		return snapshots[i].Provider < snapshots[j].Provider
	})
	return snapshots
}

func classifyTaskOutcome(ctx context.Context, err error) taskOutcome {
	if err == nil {
		return taskOutcomeSuccess
	}

	cause := context.Cause(ctx)
	if errors.Is(err, runlock.ErrLost) || errors.Is(cause, runlock.ErrLost) {
		return taskOutcomeLockLost
	}
	if errors.Is(err, context.DeadlineExceeded) ||
		errors.Is(cause, context.DeadlineExceeded) ||
		errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return taskOutcomeTimeout
	}
	if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
		return taskOutcomeCancelled
	}
	return taskOutcomeProviderError
}

func outcomeReason(ctx context.Context, err error) string {
	if err != nil {
		return err.Error()
	}
	if cause := context.Cause(ctx); cause != nil {
		return cause.Error()
	}
	if ctx.Err() != nil {
		return ctx.Err().Error()
	}
	return ""
}

func taskSourceName(task adapterTask) string {
	if task.adapter == nil {
		return ""
	}
	return task.adapter.SourceName()
}
