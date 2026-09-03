package pipeline

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/config"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/jobstore"
	"github.com/redis/go-redis/v9"
)

const (
	globalIndexKey = "scraper:jobs:index"
	indexTTL       = 9 * 24 * time.Hour
)

func IndexJobsInValkey(ctx context.Context, rdb *redis.Client, jobs []domain.Job, keywords []string) error {
	_, err := IndexJobsInValkeyBatched(ctx, rdb, jobs, keywords, config.DefaultIndexBatchSize)
	return err
}

// IndexJobsInValkeyBatched writes inverted indexes in limited pipelines.
// Each chunk uses MULTI/EXEC so a failed chunk does not leave a partial
// update. Existing keyword sets are preserved via incremental SADD; this
// replaces the previous whole-set RENAME, which would wipe earlier batches
// of the same run.
func IndexJobsInValkeyBatched(
	ctx context.Context,
	rdb *redis.Client,
	jobs []domain.Job,
	keywords []string,
	batchSize int,
) (int, error) {
	if rdb == nil || len(jobs) == 0 {
		return 0, nil
	}
	if cause := context.Cause(ctx); cause != nil {
		return 0, cause
	}
	if batchSize <= 0 {
		batchSize = config.DefaultIndexBatchSize
	}

	commands := 0
	for start := 0; start < len(jobs); start += batchSize {
		if cause := context.Cause(ctx); cause != nil {
			return commands, cause
		}
		end := min(start+batchSize, len(jobs))
		chunkCommands, err := indexJobChunk(ctx, rdb, jobs[start:end], keywords)
		commands += chunkCommands
		if err != nil {
			return commands, err
		}
	}
	return commands, nil
}

func indexJobChunk(ctx context.Context, rdb *redis.Client, jobs []domain.Job, keywords []string) (int, error) {
	additions := make(map[string][]string)

	for _, job := range jobs {
		if cause := context.Cause(ctx); cause != nil {
			return 0, cause
		}
		id := job.ID
		if id == "" {
			id = jobstore.StableID(&job)
		}
		if id == "" {
			continue
		}
		additions[globalIndexKey] = append(additions[globalIndexKey], id)

		searchText := keywordSearchText(job)
		for _, kw := range keywords {
			sanitizedKw := strings.ToLower(strings.TrimSpace(kw))
			if sanitizedKw == "" {
				continue
			}
			if keywordMatches(searchText, sanitizedKw) {
				for _, alias := range keywordIndexAliases(sanitizedKw) {
					fullKey := fmt.Sprintf("scraper:jobs:keyword:%s", alias)
					additions[fullKey] = append(additions[fullKey], id)
				}
			}
			for _, term := range keywordSubTerms(sanitizedKw) {
				if term == "" {
					continue
				}
				if containsTokenOrPhrase(searchText, term) {
					termKey := fmt.Sprintf("scraper:jobs:keyword:%s", term)
					additions[termKey] = append(additions[termKey], id)
				}
			}
		}
		for _, key := range structuredIndexKeys(job) {
			additions[key] = append(additions[key], id)
		}
		for _, key := range classificationIndexKeys(job) {
			additions[key] = append(additions[key], id)
		}
	}

	if len(additions) == 0 {
		return 0, nil
	}

	var commands int
	err := jobstore.RetryTransient(ctx, func() error {
		pipe := rdb.TxPipeline()
		commands = 0
		for key, members := range additions {
			unique := uniqueIndexMembers(members)
			if len(unique) == 0 {
				continue
			}
			args := make([]any, len(unique))
			for i, member := range unique {
				args[i] = member
			}
			pipe.SAdd(ctx, key, args...)
			commands++
			if key != globalIndexKey {
				pipe.Expire(ctx, key, indexTTL)
				commands++
			}
		}
		if commands == 0 {
			return nil
		}
		if _, err := pipe.Exec(ctx); err != nil {
			return fmt.Errorf("index chunk exec (%d commands): %w", commands, err)
		}
		return nil
	})
	return commands, err
}

func uniqueIndexMembers(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

// ReindexPersistedJobs reloads documents from the Valkey job store and
// rebuilds inverted indexes. It does not repeat external collection and is
// idempotent because indexing uses SADD.
func ReindexPersistedJobs(
	ctx context.Context,
	store *jobstore.Store,
	rdb *redis.Client,
	ids []string,
	keywords []string,
	batchSize int,
) error {
	if rdb == nil {
		return fmt.Errorf("reindex: valkey client is required")
	}
	if store == nil {
		return fmt.Errorf("reindex: persisted job store is required")
	}
	if len(ids) == 0 {
		return fmt.Errorf("reindex: no job ids")
	}
	jobs, err := store.GetByIDs(ctx, ids)
	if err != nil {
		return err
	}
	if len(jobs) == 0 {
		return fmt.Errorf("reindex: no persisted jobs found for %d ids", len(ids))
	}
	_, err = IndexJobsInValkeyBatched(ctx, rdb, jobs, keywords, batchSize)
	return err
}
