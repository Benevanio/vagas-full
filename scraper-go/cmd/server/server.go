package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/cache"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/config"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/cronjob"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/jobstore"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/keywords"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/runlock"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
)

func run(adapterList []ports.JobSource, runtimeCfg config.RuntimeConfig) {
	addr := os.Getenv("GO_SCRAPER_ADDR")
	if addr == "" {
		addr = ":8081"
	}

	c, err := cache.NewCache()
	if err != nil {
		slog.Error("falha ao conectar ao Valkey", "error", err)
		os.Exit(1)
	}
	slog.Info("cache inicializado", "provider", c.Status().Provider)

	rdb, err := newRedisClient()
	if err != nil {
		slog.Error("falha ao conectar cliente Redis/Valkey", "error", err)
		os.Exit(1)
	}

	// ── Módulos ──
	kwStore := keywords.NewStore(c)
	jobStore := jobstore.New(rdb)
	runLock, err := runlock.New(runlock.NewValkeyStore(rdb), runlock.Config{
		TTL:           runtimeCfg.RunLockTTL,
		RenewInterval: runtimeCfg.RunLockRenewInterval,
	})
	if err != nil {
		slog.Error("configuração inválida do lock distribuído", "error", err)
		os.Exit(1)
	}

	// ── Scheduler (cronjob) ──
	schedulerCfg := cronjob.DefaultConfig()
	schedulerCfg.MaxConcurrency = runtimeCfg.MaxConcurrency
	scheduler := cronjob.New(schedulerCfg, kwStore, jobStore, adapterList, rdb, runLock)

	scheduler.OnComplete = func(kws []string, scraped, saved int, duration time.Duration) {
		printSummary(len(adapterList), kws, scraped, duration)
	}

	bgCtx, bgCancel := context.WithCancel(context.Background())
	defer bgCancel()

	// ── Rotas ──
	mux := http.NewServeMux()

	// Públicas
	mux.Handle("POST /scrape", handleScrape(adapterList, kwStore, c, rdb, runLock, runtimeCfg))
	mux.Handle("GET /health", handleHealth(c))
	mux.Handle("GET /metrics", promhttp.Handler())
	mux.Handle("GET /api/keywords", handleGetKeywords(kwStore))
	mux.Handle("POST /api/keywords", handleSaveKeywords(kwStore))

	// Administrativas
	mux.Handle("POST /admin/scrape", handleTriggerScrape(scheduler, bgCtx))
	mux.Handle("GET /admin/scrape/status", handleScraperStatus(scheduler))
	mux.Handle("GET /admin/jobs", handleGetJobs(jobStore))
	mux.Handle("GET /admin/jobs/count", handleJobsCount(jobStore))

	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 20 * time.Minute,
		IdleTimeout:  60 * time.Second,
	}

	// ── Background: inicia o scheduler ──
	scheduler.Start(bgCtx)

	// ── Graceful shutdown ──
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		slog.Info("go-scraper em execução", "addr", addr)
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			slog.Error("falha crítica no servidor", "error", err)
			os.Exit(1)
		}
	}()

	<-stop
	slog.Info("sinal de interrupção recebido, desligando...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	bgCancel()
	if err := scheduler.Shutdown(shutdownCtx); err != nil {
		slog.Error("erro ao aguardar liberação do lock no shutdown", "error", err)
	}

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("erro durante o shutdown", "error", err)
	}

	slog.Info("servidor encerrado com sucesso")
}

func newRedisClient() (*redis.Client, error) {
	url := os.Getenv("VALKEY_URL")
	if url == "" {
		url = "redis://localhost:6379"
	}

	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}

	rdb := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := waitForRedisPing(ctx, rdb); err != nil {
		_ = rdb.Close()
		return nil, err
	}

	return rdb, nil
}

func waitForRedisPing(ctx context.Context, rdb *redis.Client) error {
	var lastErr error
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		if err := rdb.Ping(ctx).Err(); err == nil {
			return nil
		} else {
			lastErr = err
		}

		select {
		case <-ctx.Done():
			return lastErr
		case <-ticker.C:
		}
	}
}
