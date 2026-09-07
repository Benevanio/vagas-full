package pipeline

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/classifier"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/jobstore"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/goleak"
)

func inScopeJob(i int) domain.Job {
	return domain.Job{
		Title:       "Backend Engineer",
		Company:     fmt.Sprintf("Acme-%d", i),
		Location:    "Brasil",
		Description: "Golang go APIs microservices postgresql redis",
		Source:      "gupy",
		Keyword:     "go",
	}
}

func feedJobs(jobs ...domain.Job) <-chan domain.Job {
	ch := make(chan domain.Job, len(jobs))
	for _, job := range jobs {
		ch <- job
	}
	close(ch)
	return ch
}

func TestProcessIncomingJobsDedupesSameAndCrossBatch(t *testing.T) {
	cfg := processConfig{
		RunID:                   "run-dedup",
		ClassificationBatchSize: 2,
		PersistBatchSize:        2,
		IndexBatchSize:          2,
	}

	jobs := []domain.Job{
		inScopeJob(1),
		inScopeJob(1), // same batch duplicate
		inScopeJob(2),
		inScopeJob(2), // next batch duplicate of previous identity after flush of 1+2 unique...
	}
	// With batch size 2: first unique is job1, second unique is job2 (dup of job1 counted).
	// After flush of [1,2], incoming dup of job2 is cross-batch.

	got, stats, err := processIncomingJobs(context.Background(), feedJobs(jobs...), cfg)
	require.NoError(t, err)
	assert.Equal(t, 4, stats.Received)
	assert.Equal(t, 2, stats.Duplicates)
	assert.Len(t, got, 2)
}

func TestProcessIncomingJobsEquivalentURLsAndSameTitleDifferentJobs(t *testing.T) {
	cfg := processConfig{ClassificationBatchSize: 10, PersistBatchSize: 10, IndexBatchSize: 10}
	jobs := []domain.Job{
		{
			Title:       "Backend Engineer",
			Company:     "URLCo",
			Location:    "Remote",
			URL:         "https://jobs.example.com/go?utm=1",
			Description: "Golang APIs microservices",
		},
		{
			Title:       "Backend Engineer",
			Company:     "URLCo",
			Location:    "Remote",
			URL:         "https://jobs.example.com/go/",
			Description: "Golang APIs microservices",
		},
		{
			Title:       "Backend Engineer",
			Company:     "OtherCo",
			Location:    "Brasil",
			URL:         "https://other.example.com/go",
			Description: "Golang APIs microservices",
		},
	}

	got, stats, err := processIncomingJobs(context.Background(), feedJobs(jobs...), cfg)
	require.NoError(t, err)
	assert.Equal(t, 1, stats.Duplicates)
	assert.Len(t, got, 2)
	assert.Equal(t, "Backend Engineer", got[0].Title)
}

func TestProcessIncomingJobsBatchOutputMatchesIndividualClassify(t *testing.T) {
	jobs := []domain.Job{inScopeJob(1), inScopeJob(2), inScopeJob(3), inScopeJob(4), inScopeJob(5)}
	cfg := processConfig{ClassificationBatchSize: 2, PersistBatchSize: 2, IndexBatchSize: 2}

	got, stats, err := processIncomingJobs(context.Background(), feedJobs(jobs...), cfg)
	require.NoError(t, err)
	assert.Equal(t, 5, stats.Classified)
	require.Len(t, got, 5)

	for i, job := range jobs {
		individual := classifier.Classify(job)
		require.NotNil(t, got[i].Classification)
		assert.Equal(t, individual.PrimaryFamily, got[i].Classification.PrimaryFamily)
		assert.Equal(t, individual.InScope, got[i].Classification.InScope)
		assert.Equal(t, individual.Confidence, got[i].Classification.Confidence)
	}
}

func TestProcessIncomingJobsLastBatchSmallerAndEmpty(t *testing.T) {
	t.Run("last batch smaller", func(t *testing.T) {
		var persistSizes []int
		cfg := processConfig{
			ClassificationBatchSize: 3,
			PersistBatchSize:        3,
			IndexBatchSize:          3,
			Persist: func(_ context.Context, jobs []domain.Job) (jobstore.SaveResult, error) {
				persistSizes = append(persistSizes, len(jobs))
				return jobstore.SaveResult{Inserted: len(jobs), Persisted: jobs}, nil
			},
		}
		jobs := []domain.Job{inScopeJob(1), inScopeJob(2), inScopeJob(3), inScopeJob(4), inScopeJob(5)}
		_, _, err := processIncomingJobs(context.Background(), feedJobs(jobs...), cfg)
		require.NoError(t, err)
		assert.Equal(t, []int{3, 2}, persistSizes)
	})

	t.Run("empty", func(t *testing.T) {
		got, stats, err := processIncomingJobs(context.Background(), feedJobs(), defaultProcessConfig())
		require.NoError(t, err)
		assert.Empty(t, got)
		assert.Equal(t, 0, stats.Received)
	})
}

func TestProcessIncomingJobsInvalidAndCancelBetweenBatches(t *testing.T) {
	t.Run("invalid isolated", func(t *testing.T) {
		cfg := processConfig{
			ClassificationBatchSize: 10,
			Persist: func(_ context.Context, jobs []domain.Job) (jobstore.SaveResult, error) {
				assert.Len(t, jobs, 1)
				return jobstore.SaveResult{Persisted: jobs}, nil
			},
		}
		_, stats, err := processIncomingJobs(context.Background(), feedJobs(
			domain.Job{Title: "sem identidade"},
			inScopeJob(1),
		), cfg)
		require.NoError(t, err)
		assert.Equal(t, 1, stats.Invalid)
		assert.Equal(t, 1, stats.Approved)
	})

	t.Run("cancel between batches", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		var persistCalls atomic.Int32
		cfg := processConfig{
			ClassificationBatchSize: 2,
			PersistBatchSize:        2,
			IndexBatchSize:          2,
			Persist: func(ctx context.Context, jobs []domain.Job) (jobstore.SaveResult, error) {
				n := persistCalls.Add(1)
				if n == 1 {
					cancel()
				}
				return jobstore.SaveResult{Persisted: append([]domain.Job(nil), jobs...)}, nil
			},
		}
		jobs := []domain.Job{inScopeJob(1), inScopeJob(2), inScopeJob(3), inScopeJob(4)}
		_, stats, err := processIncomingJobs(ctx, feedJobs(jobs...), cfg)
		require.Error(t, err)
		assert.Equal(t, int32(1), persistCalls.Load())
		assert.Equal(t, 2, stats.Approved)
	})
}

func TestProcessIncomingJobsDoesNotIndexFailedPersistBatch(t *testing.T) {
	indexed := false
	cfg := processConfig{
		ClassificationBatchSize: 10,
		Persist: func(context.Context, []domain.Job) (jobstore.SaveResult, error) {
			return jobstore.SaveResult{}, errors.New("persist failed")
		},
		Index: func(context.Context, []domain.Job) error {
			indexed = true
			return nil
		},
	}

	_, stats, err := processIncomingJobs(context.Background(), feedJobs(inScopeJob(1)), cfg)
	require.Error(t, err)
	assert.False(t, indexed)
	assert.Equal(t, 1, stats.Failed)
	assert.Equal(t, 0, stats.Indexed)
}

func TestProcessIncomingJobsIndexesOnlyPersistedIDs(t *testing.T) {
	var indexed []string
	persisted := inScopeJob(1)
	persisted.ID = "persisted-1"
	cfg := processConfig{
		ClassificationBatchSize: 10,
		PersistBatchSize:        10,
		IndexBatchSize:          10,
		Persist: func(_ context.Context, jobs []domain.Job) (jobstore.SaveResult, error) {
			return jobstore.SaveResult{Inserted: 1, Persisted: []domain.Job{persisted}}, nil
		},
		Index: func(_ context.Context, jobs []domain.Job) error {
			for _, job := range jobs {
				indexed = append(indexed, job.ID)
			}
			return nil
		},
	}

	got, stats, err := processIncomingJobs(context.Background(), feedJobs(inScopeJob(1), inScopeJob(2)), cfg)
	require.NoError(t, err)
	assert.Equal(t, []string{"persisted-1"}, indexed)
	require.Len(t, got, 1)
	assert.Equal(t, "persisted-1", got[0].ID)
	assert.Equal(t, 1, stats.Indexed)
}

func TestProcessIncomingJobsIndexPartialFailureReconciles(t *testing.T) {
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	store := jobstore.New(rdb)

	calls := 0
	cfg := processConfig{
		RunID:                   "run-index",
		Keywords:                []string{"go"},
		ClassificationBatchSize: 10,
		PersistBatchSize:        10,
		IndexBatchSize:          10,
		Store:                   store,
		RDB:                     rdb,
		Index: func(ctx context.Context, jobs []domain.Job) error {
			calls++
			if calls == 1 {
				return errors.New("partial index failure")
			}
			return nil
		},
	}

	_, stats, err := processIncomingJobs(context.Background(), feedJobs(inScopeJob(1)), cfg)
	require.NoError(t, err)
	assert.Equal(t, 1, stats.Failed)
	assert.Equal(t, 1, stats.Indexed)
	members, err := rdb.SMembers(context.Background(), "scraper:jobs:keyword:go").Result()
	require.NoError(t, err)
	assert.NotEmpty(t, members)
}

func TestProcessIncomingJobsRespectsIndexBatchSize(t *testing.T) {
	var sizes []int
	cfg := processConfig{
		ClassificationBatchSize: 10,
		PersistBatchSize:        10,
		IndexBatchSize:          2,
		Persist: func(_ context.Context, jobs []domain.Job) (jobstore.SaveResult, error) {
			out := make([]domain.Job, len(jobs))
			copy(out, jobs)
			for i := range out {
				out[i].ID = fmt.Sprintf("id-%d", i)
			}
			return jobstore.SaveResult{Inserted: len(out), Persisted: out}, nil
		},
		Index: func(_ context.Context, jobs []domain.Job) error {
			sizes = append(sizes, len(jobs))
			return nil
		},
	}

	jobs := []domain.Job{inScopeJob(1), inScopeJob(2), inScopeJob(3), inScopeJob(4), inScopeJob(5)}
	_, _, err := processIncomingJobs(context.Background(), feedJobs(jobs...), cfg)
	require.NoError(t, err)
	assert.Equal(t, []int{2, 2, 1}, sizes)
}

func TestProcessIncomingJobsCancelBeforeNextIndexBatch(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var indexCalls atomic.Int32
	cfg := processConfig{
		ClassificationBatchSize: 10,
		PersistBatchSize:        10,
		IndexBatchSize:          2,
		Persist: func(_ context.Context, jobs []domain.Job) (jobstore.SaveResult, error) {
			out := append([]domain.Job(nil), jobs...)
			for i := range out {
				out[i].ID = fmt.Sprintf("id-%d", i)
			}
			return jobstore.SaveResult{Persisted: out}, nil
		},
		Index: func(ctx context.Context, jobs []domain.Job) error {
			indexCalls.Add(1)
			cancel()
			return nil
		},
	}

	_, stats, err := processIncomingJobs(ctx, feedJobs(inScopeJob(1), inScopeJob(2), inScopeJob(3), inScopeJob(4)), cfg)
	require.Error(t, err)
	assert.Equal(t, int32(1), indexCalls.Load())
	assert.Equal(t, 2, stats.Indexed)
}

func TestStageQueueCapacityIsBounded(t *testing.T) {
	cfg := processConfig{ClassificationBatchSize: 100, PersistBatchSize: 100, IndexBatchSize: 250}
	assert.Equal(t, 500, stageQueueCapacity(cfg))
	cfg = processConfig{ClassificationBatchSize: 1, PersistBatchSize: 1, IndexBatchSize: 1}
	assert.Equal(t, 2, stageQueueCapacity(cfg))
}

func TestProcessIncomingJobsBackpressureSlowsProducer(t *testing.T) {
	cfg := processConfig{
		ClassificationBatchSize: 1,
		PersistBatchSize:        1,
		IndexBatchSize:          1,
		Persist: func(context.Context, []domain.Job) (jobstore.SaveResult, error) {
			time.Sleep(40 * time.Millisecond)
			return jobstore.SaveResult{Persisted: []domain.Job{inScopeJob(0)}}, nil
		},
	}
	incoming := make(chan domain.Job, stageQueueCapacity(cfg))
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _, _ = processIncomingJobs(context.Background(), incoming, cfg)
	}()

	started := time.Now()
	for i := 0; i < 6; i++ {
		incoming <- inScopeJob(i)
	}
	close(incoming)
	<-done
	assert.Greater(t, time.Since(started), 120*time.Millisecond)
}

func TestRunWithConcurrencyCancelUnblocksAndDoesNotLeak(t *testing.T) {
	defer goleak.VerifyNone(t, goleak.IgnoreCurrent())

	started := make(chan struct{})
	adapter := schedulerTestAdapter{
		provider: ports.ProviderGupy,
		search: func(ctx context.Context, _ string) ([]domain.Job, error) {
			select {
			case <-started:
			default:
				close(started)
			}
			jobs := make([]domain.Job, 0, 20)
			for i := 0; i < 20; i++ {
				jobs = append(jobs, inScopeJob(i))
			}
			return jobs, nil
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	cfg := processConfig{
		ClassificationBatchSize: 1,
		PersistBatchSize:        1,
		IndexBatchSize:          1,
		Persist: func(ctx context.Context, jobs []domain.Job) (jobstore.SaveResult, error) {
			select {
			case <-ctx.Done():
				return jobstore.SaveResult{}, context.Cause(ctx)
			case <-time.After(50 * time.Millisecond):
				return jobstore.SaveResult{Persisted: jobs}, nil
			}
		},
	}

	done := make(chan error, 1)
	go func() {
		_, err := runWithConcurrency(
			ctx,
			[]ports.JobSource{adapter},
			domain.ScrapeRequest{Keywords: []string{"go"}, MaxConcurrency: 1},
			1,
			nil,
			cfg,
		)
		done <- err
	}()

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("adapter did not start")
	}
	cancel()

	select {
	case err := <-done:
		require.Error(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("run did not return after cancel")
	}
}

func TestProcessIncomingJobsCancelUnblocksProducer(t *testing.T) {
	defer goleak.VerifyNone(t, goleak.IgnoreCurrent())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cfg := processConfig{
		ClassificationBatchSize: 1,
		PersistBatchSize:        1,
		IndexBatchSize:          1,
		Persist: func(ctx context.Context, jobs []domain.Job) (jobstore.SaveResult, error) {
			<-ctx.Done()
			return jobstore.SaveResult{}, context.Cause(ctx)
		},
	}
	incoming := make(chan domain.Job)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, _, _ = processIncomingJobs(ctx, incoming, cfg)
	}()

	incoming <- inScopeJob(1)
	time.Sleep(20 * time.Millisecond)
	cancel()

	sent := make(chan struct{})
	go func() {
		incoming <- inScopeJob(2)
		close(sent)
	}()

	select {
	case <-sent:
	case <-time.After(time.Second):
		t.Fatal("producer remained blocked after cancel")
	}
	close(incoming)
	wg.Wait()
}

func TestProcessIncomingJobsIndexesSuccessfulPersistBeforeLaterFailure(t *testing.T) {
	var indexed []string
	var persistCalls int
	cfg := processConfig{
		ClassificationBatchSize: 1,
		PersistBatchSize:        1,
		IndexBatchSize:          10,
		Persist: func(_ context.Context, jobs []domain.Job) (jobstore.SaveResult, error) {
			persistCalls++
			if persistCalls == 2 {
				return jobstore.SaveResult{}, errors.New("persist failed")
			}
			out := append([]domain.Job(nil), jobs...)
			out[0].ID = fmt.Sprintf("ok-%d", persistCalls)
			return jobstore.SaveResult{Inserted: 1, Persisted: out}, nil
		},
		Index: func(_ context.Context, jobs []domain.Job) error {
			for _, job := range jobs {
				indexed = append(indexed, job.ID)
			}
			return nil
		},
	}

	_, stats, err := processIncomingJobs(context.Background(), feedJobs(inScopeJob(1), inScopeJob(2), inScopeJob(3)), cfg)
	require.Error(t, err)
	assert.Equal(t, []string{"ok-1"}, indexed)
	assert.Equal(t, 1, stats.Indexed)
	assert.Equal(t, 1, stats.Failed)
	assert.NotContains(t, indexed, "")
}

func TestProcessIncomingJobsDoesNotReconcileWithoutPersistedIDs(t *testing.T) {
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	cfg := processConfig{
		ClassificationBatchSize: 10,
		PersistBatchSize:        10,
		IndexBatchSize:          10,
		Store:                   jobstore.New(rdb),
		RDB:                     rdb,
		Persist: func(_ context.Context, jobs []domain.Job) (jobstore.SaveResult, error) {
			out := append([]domain.Job(nil), jobs...)
			for i := range out {
				out[i].ID = ""
			}
			return jobstore.SaveResult{Persisted: out}, nil
		},
		Index: func(context.Context, []domain.Job) error {
			return errors.New("index failed")
		},
	}

	_, stats, err := processIncomingJobs(context.Background(), feedJobs(inScopeJob(1)), cfg)
	require.Error(t, err)
	assert.Equal(t, 1, stats.Failed)
	assert.Equal(t, 0, stats.Indexed)
}
