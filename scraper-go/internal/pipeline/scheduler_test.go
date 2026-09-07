package pipeline

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type schedulerTestAdapter struct {
	name     string
	provider ports.ProviderID
	mode     ports.DiscoveryMode
	search   func(context.Context, string) ([]domain.Job, error)
}

func (a schedulerTestAdapter) SourceName() string {
	if a.name != "" {
		return a.name
	}
	return string(a.provider)
}

func (a schedulerTestAdapter) Capabilities() ports.SourceCapabilities {
	mode := a.mode
	if mode == "" {
		mode = ports.DiscoveryKeyword
	}
	return ports.SourceCapabilities{Provider: a.provider, Mode: mode}
}

func (a schedulerTestAdapter) Search(
	ctx context.Context,
	keyword string,
	_ domain.ScrapeRequest,
) ([]domain.Job, error) {
	if a.search == nil {
		return nil, nil
	}
	return a.search(ctx, keyword)
}

type schedulerCatalogAdapter struct {
	schedulerTestAdapter
	calls    int
	keywords []string
}

func (a *schedulerCatalogAdapter) SearchCatalog(
	_ context.Context,
	keywords []string,
	_ domain.ScrapeRequest,
) ([]domain.Job, error) {
	a.calls++
	a.keywords = append([]string(nil), keywords...)
	return nil, nil
}

func TestProduceTasksUsesRoundRobinOrder(t *testing.T) {
	queue := make(chan adapterTask, 6)
	adapters := []ports.JobSource{
		schedulerTestAdapter{provider: ports.ProviderGupy},
		schedulerTestAdapter{provider: ports.ProviderAdzuna},
	}

	produceTasks(
		context.Background(),
		queue,
		adapters,
		[]string{"go", "java", "python"},
		newProviderRunStats(adapters, nil),
	)

	var order []string
	for task := range queue {
		order = append(order, string(task.provider)+":"+task.keywords[0])
	}
	assert.Equal(t, []string{
		"gupy:go",
		"adzuna:go",
		"gupy:java",
		"adzuna:java",
		"gupy:python",
		"adzuna:python",
	}, order)
}

func TestProduceTasksBalancesProvidersWithDifferentInstanceCounts(t *testing.T) {
	gupyOne := &schedulerCatalogAdapter{schedulerTestAdapter: schedulerTestAdapter{
		provider: ports.ProviderGupy,
		mode:     ports.DiscoveryCatalog,
	}}
	gupyTwo := &schedulerCatalogAdapter{schedulerTestAdapter: schedulerTestAdapter{
		provider: ports.ProviderGupy,
		mode:     ports.DiscoveryCatalog,
	}}
	gupyThree := &schedulerCatalogAdapter{schedulerTestAdapter: schedulerTestAdapter{
		provider: ports.ProviderGupy,
		mode:     ports.DiscoveryCatalog,
	}}
	adapters := []ports.JobSource{
		gupyOne,
		gupyTwo,
		gupyThree,
		schedulerTestAdapter{provider: ports.ProviderAdzuna},
	}
	queue := make(chan adapterTask, 6)

	produceTasks(
		context.Background(),
		queue,
		adapters,
		[]string{"go", "java", "python"},
		newProviderRunStats(adapters, nil),
	)

	var order []ports.ProviderID
	for task := range queue {
		order = append(order, task.provider)
	}
	assert.Equal(t, []ports.ProviderID{
		ports.ProviderGupy,
		ports.ProviderAdzuna,
		ports.ProviderGupy,
		ports.ProviderAdzuna,
		ports.ProviderGupy,
		ports.ProviderAdzuna,
	}, order)
}

func TestProduceTasksAppliesBackpressureAtQueueCapacity(t *testing.T) {
	queue := make(chan adapterTask, 1)
	done := make(chan struct{})
	adapters := []ports.JobSource{schedulerTestAdapter{provider: ports.ProviderGupy}}
	go func() {
		produceTasks(
			context.Background(),
			queue,
			adapters,
			[]string{"go", "java", "python"},
			newProviderRunStats(adapters, nil),
		)
		close(done)
	}()

	require.Eventually(t, func() bool {
		return len(queue) == cap(queue)
	}, time.Second, time.Millisecond)
	select {
	case <-done:
		t.Fatal("producer completed while the bounded queue was full")
	case <-time.After(25 * time.Millisecond):
	}

	for range queue {
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("producer did not finish after queue consumers resumed")
	}
}

func TestProduceTasksStopsWhenCanceledDuringBackpressure(t *testing.T) {
	queue := make(chan adapterTask, 1)
	done := make(chan struct{})
	adapters := []ports.JobSource{schedulerTestAdapter{provider: ports.ProviderGupy}}
	ctx, cancel := context.WithCancelCause(context.Background())
	defer cancel(nil)

	go func() {
		produceTasks(
			ctx,
			queue,
			adapters,
			[]string{"go", "java", "python", "rust", "node"},
			newProviderRunStats(adapters, nil),
		)
		close(done)
	}()

	require.Eventually(t, func() bool {
		return len(queue) == cap(queue)
	}, time.Second, time.Millisecond)
	cancel(assert.AnError)

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("producer did not finish after cancellation during backpressure")
	}
}

func TestRunIsolatesAdapterErrors(t *testing.T) {
	failed := schedulerTestAdapter{
		provider: ports.ProviderGupy,
		search: func(context.Context, string) ([]domain.Job, error) {
			return nil, errors.New("provider unavailable")
		},
	}
	successful := schedulerTestAdapter{
		provider: ports.ProviderAdzuna,
		search: func(_ context.Context, keyword string) ([]domain.Job, error) {
			return []domain.Job{{
				Title:   "Backend Engineer",
				Company: "Acme",
				URL:     "https://example.com/job",
				Keyword: keyword,
			}}, nil
		},
	}

	jobs, err := Run(context.Background(), []ports.JobSource{failed, successful}, domain.ScrapeRequest{
		Keywords:       []string{"go"},
		MaxConcurrency: 2,
	})

	require.NoError(t, err)
	require.Len(t, jobs, 1)
	assert.Equal(t, "Backend Engineer", jobs[0].Title)
}

func TestRunExecutesCatalogOnceForAllKeywords(t *testing.T) {
	adapter := &schedulerCatalogAdapter{
		schedulerTestAdapter: schedulerTestAdapter{
			provider: ports.ProviderTheMuse,
			mode:     ports.DiscoveryCatalog,
		},
	}

	_, err := Run(context.Background(), []ports.JobSource{adapter}, domain.ScrapeRequest{
		Keywords:       []string{"go", "java", "python"},
		MaxConcurrency: 1,
	})

	require.NoError(t, err)
	assert.Equal(t, 1, adapter.calls)
	assert.Equal(t, []string{"go", "java", "python"}, adapter.keywords)
}

func TestRunRejectsModeWithoutRequiredInterfaceBeforeStartingWorkers(t *testing.T) {
	var calls int
	adapter := schedulerTestAdapter{
		provider: ports.ProviderGupy,
		mode:     ports.DiscoveryBatch,
		search: func(context.Context, string) ([]domain.Job, error) {
			calls++
			return nil, nil
		},
	}

	_, err := Run(context.Background(), []ports.JobSource{adapter}, domain.ScrapeRequest{
		Keywords:       []string{"go"},
		MaxConcurrency: 1,
	})

	require.Error(t, err)
	assert.ErrorContains(t, err, "batch")
	assert.Equal(t, 0, calls)
}

func TestRunUsesFixedWorkersWithoutExceedingConcurrency(t *testing.T) {
	var active int
	var peak int
	var mu sync.Mutex
	release := make(chan struct{})
	started := make(chan struct{}, 4)
	adapter := schedulerTestAdapter{
		provider: ports.ProviderGupy,
		search: func(context.Context, string) ([]domain.Job, error) {
			mu.Lock()
			active++
			if active > peak {
				peak = active
			}
			mu.Unlock()
			started <- struct{}{}
			<-release
			mu.Lock()
			active--
			mu.Unlock()
			return nil, nil
		},
	}
	done := make(chan error, 1)
	go func() {
		_, err := runWithConcurrency(
			context.Background(),
			[]ports.JobSource{adapter},
			domain.ScrapeRequest{
				Keywords:       []string{"go", "java", "python", "rust"},
				MaxConcurrency: 3,
			},
			2,
			nil,
		)
		done <- err
	}()

	for range 2 {
		select {
		case <-started:
		case <-time.After(time.Second):
			t.Fatal("provider tasks did not reach configured concurrency")
		}
	}
	select {
	case <-started:
		t.Fatal("provider exceeded its configured concurrency")
	case <-time.After(25 * time.Millisecond):
	}
	close(release)
	require.NoError(t, <-done)
	assert.Equal(t, 2, peak)
}
