package main

import (
	"log/slog"
	"os"
	"runtime"
	"runtime/debug"
	"strconv"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/config"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	loadEnv()

	runtimeCfg, err := config.LoadRuntimeConfig()
	if err != nil {
		slog.Error("configuração inválida do scraper", "error", err)
		os.Exit(1)
	}
	logRuntimeConfig(runtimeCfg)

	// newRedisClient() está em server.go — usa ParseURL corretamente
	// e valida a conexão com Ping antes de retornar.
	rdb, err := newRedisClient()
	if err != nil {
		slog.Warn("valkey indisponível, Jooble vai operar sem controle de cota", "error", err)
		rdb = nil
	}
	if rdb != nil {
		defer rdb.Close()
	}

	adapterList := buildAdapters(rdb)
	slog.Info("servidor inicializado", "adapters_total", len(adapterList))

	run(adapterList, runtimeCfg)
}

func logRuntimeConfig(cfg config.RuntimeConfig) {
	_, gomaxprocsSet := os.LookupEnv("GOMAXPROCS")
	_, gomemlimitSet := os.LookupEnv("GOMEMLIMIT")

	memLimit := debug.SetMemoryLimit(-1)

	slog.Info("scraper runtime configurado",
		"max_concurrency", cfg.MaxConcurrency,
		"max_concurrency_source", cfg.MaxConcurrencySource,
		"run_lock_ttl", cfg.RunLockTTL,
		"run_lock_renew_interval", cfg.RunLockRenewInterval,
		"gomaxprocs_effective", runtime.GOMAXPROCS(0),
		"gomaxprocs_source", envSource(gomaxprocsSet),
		"gomemlimit_effective_bytes", memLimit,
		"gomemlimit_effective", formatBytes(memLimit),
		"gomemlimit_source", envSource(gomemlimitSet),
	)
}

func envSource(set bool) string {
	if set {
		return "environment"
	}
	return "go_runtime_default"
}

func formatBytes(value int64) string {
	if value < 0 {
		return "unlimited"
	}
	const mib = 1024 * 1024
	if value%mib == 0 {
		return strconv.FormatInt(value/mib, 10) + "MiB"
	}
	return strconv.FormatInt(value, 10) + "B"
}
