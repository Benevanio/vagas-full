package pipeline

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/cache"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/inflight"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/runlock"
)

type SearchResult struct {
	Jobs      []domain.Job `json:"jobs"`
	Total     int          `json:"total"`
	CachedAt  time.Time    `json:"cachedAt"`
	FromCache bool         `json:"fromCache"`
}

func SearchJobs(
	ctx context.Context,
	c cache.Cache,
	config SearchConfig,
	adapterList []ports.JobSource,
	ttl time.Duration,
	rdb *redis.Client,
	runLock *runlock.Manager,
	source string,
) (SearchResult, error) {
	config = normalizeSearchConfig(config)
	cacheKey := BuildCacheKey(config)

	if result, found, err := cache.GetAs[SearchResult](c, ctx, cacheKey); err != nil {
		return SearchResult{}, fmt.Errorf("pipeline.SearchJobs: cache read: %w", err)
	} else if found {
		result.FromCache = true
		return result, nil
	}

	return inflight.Do(cacheKey, func() (result SearchResult, resultErr error) {
		if result, found, err := cache.GetAs[SearchResult](c, ctx, cacheKey); err != nil {
			return SearchResult{}, fmt.Errorf("pipeline.SearchJobs: cache re-check: %w", err)
		} else if found {
			result.FromCache = true
			return result, nil
		}

		if runLock == nil {
			return SearchResult{}, fmt.Errorf("%w: lock service is not configured", runlock.ErrUnavailable)
		}
		lease, err := runLock.Acquire(ctx, source)
		if err != nil {
			return SearchResult{}, err
		}
		defer func() {
			releaseCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := lease.Release(releaseCtx); err != nil && resultErr == nil {
				resultErr = err
			}
		}()

		runCtx := lease.Context()
		jobs, err := ScrapeAllSources(runCtx, config, adapterList, rdb)
		if err != nil {
			return SearchResult{}, fmt.Errorf("pipeline.SearchJobs: scrape: %w", err)
		}
		if err := context.Cause(runCtx); err != nil {
			return SearchResult{}, err
		}

		IndexJobsInValkey(runCtx, rdb, jobs, config.Keywords)
		if err := context.Cause(runCtx); err != nil {
			return SearchResult{}, err
		}

		result = SearchResult{
			Jobs:      jobs,
			Total:     len(jobs),
			CachedAt:  time.Now(),
			FromCache: false,
		}

		if err := c.Set(runCtx, cacheKey, result, ttl); err != nil {
			slog.Error("pipeline.SearchJobs: cache write failed",
				"key", cacheKey,
				"error", err,
			)
		}

		return result, nil
	})
}
