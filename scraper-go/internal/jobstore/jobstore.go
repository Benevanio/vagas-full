package jobstore

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"
	"unicode"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/adapterutil"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/redis/go-redis/v9"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

const (
	jobTTL               = 9 * 24 * time.Hour
	indexKey             = "scraper:jobs:index"
	jobKeyPrefix         = "scraper:job:"
	maxTransientAttempts = 3
)

type Store struct {
	rdb *redis.Client
}

func New(rdb *redis.Client) *Store {
	return &Store{rdb: rdb}
}

// SaveResult is the outcome of one persist batch.
// Conflict strategy: existing IDs are upserted in a single MULTI/EXEC.
// Allowed updates: description, URL, salary, postedAt, modality, location,
// classification, and merged sources/keywords. The stable ID is preserved.
type SaveResult struct {
	Inserted  int
	Updated   int
	Invalid   int
	Persisted []domain.Job
}

// SaveBatch persists a limited job batch with one Valkey transaction.
func (s *Store) SaveBatch(ctx context.Context, jobs []domain.Job) (SaveResult, error) {
	var result SaveResult
	if len(jobs) == 0 {
		return result, nil
	}

	prepared := make([]domain.Job, 0, len(jobs))
	ids := make([]string, 0, len(jobs))
	for _, job := range jobs {
		if cause := context.Cause(ctx); cause != nil {
			return result, cause
		}
		id := StableID(&job)
		if id == "" {
			result.Invalid++
			continue
		}
		job.ID = id
		prepared = append(prepared, job)
		ids = append(ids, id)
	}
	if len(prepared) == 0 {
		return result, nil
	}
	prepared = collapseByID(prepared)
	ids = make([]string, len(prepared))
	for i := range prepared {
		ids[i] = prepared[i].ID
	}

	err := retryTransient(ctx, func() error {
		return s.savePrepared(ctx, prepared, ids, &result)
	})
	if err != nil {
		return SaveResult{Invalid: result.Invalid}, err
	}
	return result, nil
}

func (s *Store) savePrepared(ctx context.Context, prepared []domain.Job, ids []string, result *SaveResult) error {
	keys := make([]string, len(ids))
	for i, id := range ids {
		keys[i] = jobKeyPrefix + id
	}

	raws, err := s.rdb.MGet(ctx, keys...).Result()
	if err != nil {
		return fmt.Errorf("jobstore.SaveBatch: MGet: %w", err)
	}

	writes := make([]domain.Job, 0, len(prepared))
	inserted := 0
	updated := 0
	for i, job := range prepared {
		existing, found, err := decodeStoredJob(raws[i])
		if err != nil {
			slog.Warn("jobstore: payload inválido ignorado na leitura", "id", job.ID, "error", err)
			found = false
		}
		if found {
			job = mergeStored(existing, job)
			updated++
		} else {
			inserted++
		}
		writes = append(writes, job)
	}

	pipe := s.rdb.TxPipeline()
	for _, job := range writes {
		payload, err := json.Marshal(job)
		if err != nil {
			return fmt.Errorf("jobstore.SaveBatch: marshal %q: %w", job.ID, err)
		}
		pipe.Set(ctx, jobKeyPrefix+job.ID, payload, jobTTL)
		pipe.SAdd(ctx, indexKey, job.ID)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("jobstore.SaveBatch: exec: %w", err)
	}

	result.Inserted = inserted
	result.Updated = updated
	result.Persisted = writes
	return nil
}

func decodeStoredJob(raw any) (domain.Job, bool, error) {
	if raw == nil {
		return domain.Job{}, false, nil
	}
	text, ok := raw.(string)
	if !ok {
		bytes, ok := raw.([]byte)
		if !ok {
			return domain.Job{}, false, fmt.Errorf("unexpected stored type %T", raw)
		}
		text = string(bytes)
	}
	var job domain.Job
	if err := json.Unmarshal([]byte(text), &job); err != nil {
		return domain.Job{}, false, err
	}
	return job, true, nil
}

func mergeStored(existing, incoming domain.Job) domain.Job {
	merged := existing
	merged.ID = existing.ID
	if strings.TrimSpace(incoming.URL) != "" {
		merged.URL = incoming.URL
	}
	if strings.TrimSpace(incoming.Description) != "" {
		merged.Description = incoming.Description
	}
	if strings.TrimSpace(incoming.Salary) != "" {
		merged.Salary = incoming.Salary
	}
	if strings.TrimSpace(incoming.PostedAt) != "" {
		merged.PostedAt = incoming.PostedAt
	}
	if strings.TrimSpace(incoming.Modality) != "" {
		merged.Modality = incoming.Modality
	}
	if strings.TrimSpace(incoming.Location) != "" {
		merged.Location = incoming.Location
	}
	if incoming.Classification != nil {
		merged.Classification = incoming.Classification
	}
	merged.Sources = uniqueStrings(append(existing.Sources, incoming.Sources...))
	if len(merged.Sources) > 0 {
		merged.Source = strings.Join(merged.Sources, ", ")
	}
	merged.Keywords = uniqueStrings(append(existing.Keywords, incoming.Keywords...))
	if len(merged.Keywords) > 0 {
		merged.Keyword = merged.Keywords[0]
	}
	return merged
}

func collapseByID(jobs []domain.Job) []domain.Job {
	index := make(map[string]int, len(jobs))
	out := make([]domain.Job, 0, len(jobs))
	for _, job := range jobs {
		if i, ok := index[job.ID]; ok {
			out[i] = mergeStored(out[i], job)
			continue
		}
		index[job.ID] = len(out)
		out = append(out, job)
	}
	return out
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
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

func RetryTransient(ctx context.Context, fn func() error) error {
	return retryTransient(ctx, fn)
}

func retryTransient(ctx context.Context, fn func() error) error {
	var last error
	for attempt := 1; attempt <= maxTransientAttempts; attempt++ {
		if cause := context.Cause(ctx); cause != nil {
			return cause
		}
		last = fn()
		if last == nil {
			return nil
		}
		if !isTransient(last) {
			return last
		}
		if attempt == maxTransientAttempts {
			return last
		}
		if err := adapterutil.Wait(ctx, time.Duration(attempt)*50*time.Millisecond); err != nil {
			return err
		}
	}
	return last
}

func isTransient(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	if errors.Is(err, redis.Nil) {
		return false
	}
	message := strings.ToLower(err.Error())
	for _, token := range []string{
		"invalid",
		"marshal",
		"wrongtype",
		"noauth",
		"noperm",
		"unknown command",
		"syntax error",
	} {
		if strings.Contains(message, token) {
			return false
		}
	}
	return true
}

func (s *Store) GetByIDs(ctx context.Context, ids []string) ([]domain.Job, error) {
	if cause := context.Cause(ctx); cause != nil {
		return nil, cause
	}
	if len(ids) == 0 {
		return []domain.Job{}, nil
	}
	keys := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		keys = append(keys, jobKeyPrefix+id)
	}
	if len(keys) == 0 {
		return []domain.Job{}, nil
	}

	raws, err := s.rdb.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, fmt.Errorf("jobstore.GetByIDs: %w", err)
	}

	jobs := make([]domain.Job, 0, len(raws))
	for _, raw := range raws {
		job, found, err := decodeStoredJob(raw)
		if err != nil || !found {
			continue
		}
		jobs = append(jobs, job)
	}
	return jobs, nil
}

func (s *Store) GetAll(ctx context.Context) ([]domain.Job, error) {
	ids, err := s.rdb.SMembers(ctx, indexKey).Result()
	if err != nil {
		return nil, fmt.Errorf("jobstore.GetAll: SMembers: %w", err)
	}
	if len(ids) == 0 {
		return []domain.Job{}, nil
	}

	jobs := make([]domain.Job, 0, len(ids))

	for _, id := range ids {
		raw, err := s.rdb.Get(ctx, jobKeyPrefix+id).Result()
		if err == redis.Nil {
			s.rdb.SRem(ctx, indexKey, id)
			continue
		}
		if err != nil {
			slog.Warn("jobstore.GetAll: erro ao buscar vaga", "id", id, "error", err)
			continue
		}

		var job domain.Job
		if err := json.Unmarshal([]byte(raw), &job); err != nil {
			slog.Warn("jobstore.GetAll: erro ao deserializar", "id", id, "error", err)
			continue
		}

		jobs = append(jobs, job)
	}

	return jobs, nil
}

func (s *Store) GetSample(ctx context.Context, limit int) ([]domain.Job, error) {
	if limit <= 0 {
		return s.GetAll(ctx)
	}

	ids := make([]string, 0, limit)
	var cursor uint64

	for {
		batch, nextCursor, err := s.rdb.SScan(ctx, indexKey, cursor, "*", int64(limit)).Result()
		if err != nil {
			return nil, fmt.Errorf("jobstore.GetSample: SScan: %w", err)
		}

		remaining := limit - len(ids)
		if len(batch) > remaining {
			batch = batch[:remaining]
		}
		ids = append(ids, batch...)

		cursor = nextCursor
		if cursor == 0 || len(ids) >= limit {
			break
		}
	}

	if len(ids) == 0 {
		return []domain.Job{}, nil
	}

	jobs := make([]domain.Job, 0, len(ids))

	for _, id := range ids {
		raw, err := s.rdb.Get(ctx, jobKeyPrefix+id).Result()
		if err == redis.Nil {
			s.rdb.SRem(ctx, indexKey, id)
			continue
		}
		if err != nil {
			slog.Warn("jobstore.GetSample: erro ao buscar vaga", "id", id, "error", err)
			continue
		}

		var job domain.Job
		if err := json.Unmarshal([]byte(raw), &job); err != nil {
			slog.Warn("jobstore.GetSample: erro ao deserializar", "id", id, "error", err)
			continue
		}

		jobs = append(jobs, job)
	}

	return jobs, nil
}

func (s *Store) Count(ctx context.Context) (int64, error) {
	n, err := s.rdb.SCard(ctx, indexKey).Result()
	if err != nil {
		return 0, fmt.Errorf("jobstore.Count: %w", err)
	}
	return n, nil
}

func StableID(j *domain.Job) string {
	title := normalizeForID(j.Title)
	company := normalizeForID(j.Company)
	location := normalizeForID(j.Location)

	var key string
	if title != "" && company != "" {
		loc := location
		if loc == "" {
			loc = "sem-local"
		}
		key = title + "|" + company + "|" + loc
	} else if u := normalizeURL(j.URL); u != "" {
		key = u
	} else {
		return ""
	}

	h := sha256.Sum256([]byte(key))
	return fmt.Sprintf("%x", h[:12])
}

func normalizeForID(s string) string {
	t := transform.Chain(norm.NFD, transform.RemoveFunc(func(r rune) bool {
		return unicode.Is(unicode.Mn, r)
	}), norm.NFC)

	result, _, _ := transform.String(t, s)

	var b strings.Builder
	for _, r := range strings.ToLower(result) {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(r)
		} else {
			b.WriteRune(' ')
		}
	}

	return strings.Join(strings.Fields(b.String()), " ")
}

func normalizeURL(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return strings.TrimRight(raw, "/")
	}
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	u.RawQuery = ""
	u.Fragment = ""
	return strings.TrimRight(u.String(), "/")
}
