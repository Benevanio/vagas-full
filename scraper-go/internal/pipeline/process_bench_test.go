package pipeline

import (
	"context"
	"fmt"
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/jobstore"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func benchJobs(n int) []domain.Job {
	jobs := make([]domain.Job, n)
	for i := 0; i < n; i++ {
		jobs[i] = domain.Job{
			Title:       "Backend Engineer",
			Company:     fmt.Sprintf("Acme-%d", i),
			Location:    "Brasil",
			Description: "Golang go APIs microservices postgresql redis kafka",
			Source:      "gupy",
			Keyword:     "go",
		}
	}
	return jobs
}

func newBenchRedis(b *testing.B) (*redis.Client, *jobstore.Store) {
	b.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		b.Fatal(err)
	}
	b.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	b.Cleanup(func() { _ = rdb.Close() })
	return rdb, jobstore.New(rdb)
}

func BenchmarkPersistIndividual(b *testing.B) {
	_, store := newBenchRedis(b)
	jobs := benchJobs(200)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		b.StopTimer()
		ctx := context.Background()
		b.StartTimer()
		for _, job := range jobs {
			if _, err := store.SaveBatch(ctx, []domain.Job{job}); err != nil {
				b.Fatal(err)
			}
		}
	}
}

func BenchmarkPersistBatched(b *testing.B) {
	_, store := newBenchRedis(b)
	jobs := benchJobs(200)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := store.SaveBatch(context.Background(), jobs); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkIndexIndividual(b *testing.B) {
	rdb, _ := newBenchRedis(b)
	jobs := benchJobs(200)
	for i := range jobs {
		jobs[i].ID = jobstore.StableID(&jobs[i])
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, job := range jobs {
			if _, err := IndexJobsInValkeyBatched(context.Background(), rdb, []domain.Job{job}, []string{"go"}, 1); err != nil {
				b.Fatal(err)
			}
		}
	}
}

func BenchmarkIndexBatched(b *testing.B) {
	rdb, _ := newBenchRedis(b)
	jobs := benchJobs(200)
	for i := range jobs {
		jobs[i].ID = jobstore.StableID(&jobs[i])
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := IndexJobsInValkeyBatched(context.Background(), rdb, jobs, []string{"go"}, 250); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkProcessIncomingIndividual(b *testing.B) {
	jobs := benchJobs(200)
	cfg := processConfig{ClassificationBatchSize: 1, PersistBatchSize: 1, IndexBatchSize: 1}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, _, err := processIncomingJobs(context.Background(), feedJobs(jobs...), cfg); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkProcessIncomingBatched(b *testing.B) {
	jobs := benchJobs(200)
	cfg := processConfig{ClassificationBatchSize: 100, PersistBatchSize: 100, IndexBatchSize: 250}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, _, err := processIncomingJobs(context.Background(), feedJobs(jobs...), cfg); err != nil {
			b.Fatal(err)
		}
	}
}
