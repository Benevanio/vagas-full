package pipeline_test

import (
	"context"
	"sync/atomic"
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/jobstore"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/pipeline"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type pipelineCountHook struct {
	redis.Hook
	count atomic.Int32
}

func (h *pipelineCountHook) DialHook(next redis.DialHook) redis.DialHook {
	return next
}

func (h *pipelineCountHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return next
}

func (h *pipelineCountHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return func(ctx context.Context, cmds []redis.Cmder) error {
		h.count.Add(1)
		return next(ctx, cmds)
	}
}

func classifiedJob(i int) domain.Job {
	job := domain.Job{
		Title:          "Backend Engineer",
		Company:        "Acme",
		Location:       "Brasil",
		Description:    "Golang go APIs microservices",
		Classification: &domain.Classification{PrimaryFamily: "backend", InScope: true},
	}
	job.Company = job.Company + string(rune('A'+i))
	job.ID = jobstore.StableID(&job)
	return job
}

func TestIndexJobsInValkeyBatchedRespectsBatchSize(t *testing.T) {
	rdb, _ := newTestRedis(t)
	hook := &pipelineCountHook{}
	rdb.AddHook(hook)

	jobs := []domain.Job{classifiedJob(0), classifiedJob(1), classifiedJob(2), classifiedJob(3), classifiedJob(4)}
	commands, err := pipeline.IndexJobsInValkeyBatched(context.Background(), rdb, jobs, []string{"go"}, 2)
	require.NoError(t, err)
	assert.Greater(t, commands, 0)

	rdbSingle, _ := newTestRedis(t)
	singleHook := &pipelineCountHook{}
	rdbSingle.AddHook(singleHook)
	_, err = pipeline.IndexJobsInValkeyBatched(context.Background(), rdbSingle, jobs, []string{"go"}, 1)
	require.NoError(t, err)
	assert.Greater(t, singleHook.count.Load(), hook.count.Load())
}

func TestIndexJobsInValkeyCancelBeforeNextBatch(t *testing.T) {
	rdb, _ := newTestRedis(t)
	jobs := []domain.Job{classifiedJob(0), classifiedJob(1), classifiedJob(2)}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := pipeline.IndexJobsInValkeyBatched(ctx, rdb, jobs, []string{"go"}, 1)
	require.Error(t, err)
}

func TestReindexPersistedJobsIsIdempotent(t *testing.T) {
	rdb, _ := newTestRedis(t)
	store := jobstore.New(rdb)
	ctx := context.Background()
	job := classifiedJob(0)
	saved, err := store.SaveBatch(ctx, []domain.Job{job})
	require.NoError(t, err)
	require.Len(t, saved.Persisted, 1)

	require.NoError(t, pipeline.ReindexPersistedJobs(ctx, store, rdb, []string{saved.Persisted[0].ID}, []string{"go"}, 10))
	require.NoError(t, pipeline.ReindexPersistedJobs(ctx, store, rdb, []string{saved.Persisted[0].ID}, []string{"go"}, 10))

	members, err := rdb.SMembers(ctx, "scraper:jobs:keyword:go").Result()
	require.NoError(t, err)
	assert.Equal(t, []string{saved.Persisted[0].ID}, members)
}

func TestIndexJobsInValkeyKeepsExistingKeywordMembers(t *testing.T) {
	rdb, _ := newTestRedis(t)
	ctx := context.Background()
	first := []domain.Job{classifiedJob(0)}
	second := []domain.Job{classifiedJob(1)}

	require.NoError(t, pipeline.IndexJobsInValkey(ctx, rdb, first, []string{"go"}))
	require.NoError(t, pipeline.IndexJobsInValkey(ctx, rdb, second, []string{"go"}))

	members, err := rdb.SMembers(ctx, "scraper:jobs:keyword:go").Result()
	require.NoError(t, err)
	assert.Len(t, members, 2)
	nextExists, err := rdb.Exists(ctx, "scraper:jobs:keyword:go:next").Result()
	require.NoError(t, err)
	assert.Equal(t, int64(0), nextExists)
}
