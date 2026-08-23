package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/cache"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/cronjob"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/jobstore"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/keywords"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/runlock"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type immediateAdapter struct{}

func (immediateAdapter) SourceName() string {
	return "immediate"
}

func (immediateAdapter) Search(context.Context, string, domain.ScrapeRequest) ([]domain.Job, error) {
	return nil, nil
}

func TestManualScrapeIsAcceptedWhenLockIsFree(t *testing.T) {
	scheduler, _, client, _ := newHandlerTestScheduler(t)
	recorder := httptest.NewRecorder()

	handleTriggerScrape(scheduler, context.Background()).ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodPost, "/admin/scrape", nil),
	)

	assert.Equal(t, http.StatusOK, recorder.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	assert.Equal(t, true, body["ok"])
	require.Eventually(t, func() bool {
		return client.Exists(context.Background(), runlock.LockKey).Val() == 0
	}, time.Second, 10*time.Millisecond)
}

func TestManualScrapeReturnsConflictWithoutStartingWhenLockIsHeld(t *testing.T) {
	scheduler, manager, _, _ := newHandlerTestScheduler(t)
	held, err := manager.Acquire(context.Background(), "cron")
	require.NoError(t, err)
	t.Cleanup(func() { _ = held.Release(context.Background()) })
	recorder := httptest.NewRecorder()

	handleTriggerScrape(scheduler, context.Background()).ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodPost, "/admin/scrape", nil),
	)

	assert.Equal(t, http.StatusConflict, recorder.Code)
	assertScraperError(t, recorder, "SCRAPER_ALREADY_RUNNING")
	assert.False(t, scheduler.IsRunning())
}

func TestManualScrapeFailsClosedWhenValkeyIsUnavailable(t *testing.T) {
	scheduler, _, _, server := newHandlerTestScheduler(t)
	server.Close()
	recorder := httptest.NewRecorder()

	handleTriggerScrape(scheduler, context.Background()).ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodPost, "/admin/scrape", nil),
	)

	assert.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	assertScraperError(t, recorder, "SCRAPER_RUN_LOCK_UNAVAILABLE")
	assert.False(t, scheduler.IsRunning())
}

func TestRunLockErrorsUseStableHTTPContract(t *testing.T) {
	cases := []struct {
		err    error
		status int
		code   string
	}{
		{runlock.ErrAlreadyHeld, http.StatusConflict, "SCRAPER_ALREADY_RUNNING"},
		{runlock.ErrUnavailable, http.StatusServiceUnavailable, "SCRAPER_RUN_LOCK_UNAVAILABLE"},
		{runlock.ErrLost, http.StatusServiceUnavailable, "SCRAPER_RUN_LOCK_LOST"},
	}

	for _, tc := range cases {
		t.Run(tc.code, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			require.True(t, mapRunLockError(recorder, tc.err))
			assert.Equal(t, tc.status, recorder.Code)
			assertScraperError(t, recorder, tc.code)
		})
	}
}

func newHandlerTestScheduler(
	t *testing.T,
) (*cronjob.Scheduler, *runlock.Manager, *redis.Client, *miniredis.Miniredis) {
	t.Helper()

	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })

	manager, err := runlock.New(runlock.NewValkeyStore(client), runlock.Config{
		TTL:           2 * time.Second,
		RenewInterval: 500 * time.Millisecond,
	})
	require.NoError(t, err)

	keywordStore := keywords.NewStore(cache.NewRedisCache(client))
	require.NoError(t, keywordStore.Save(context.Background(), []string{"go"}))

	cfg := cronjob.DefaultConfig()
	cfg.MaxConcurrency = 1
	cfg.ScrapeTimeout = time.Second
	scheduler := cronjob.New(
		cfg,
		keywordStore,
		jobstore.New(client),
		[]ports.JobSource{immediateAdapter{}},
		client,
		manager,
	)
	return scheduler, manager, client, server
}

func assertScraperError(t *testing.T, recorder *httptest.ResponseRecorder, code string) {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	assert.Equal(t, false, body["ok"])
	assert.Equal(t, code, body["code"])
	assert.NotEmpty(t, body["message"])
}
