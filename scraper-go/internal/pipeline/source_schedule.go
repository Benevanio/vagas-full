package pipeline

import (
	"context"
	"log/slog"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/redis/go-redis/v9"
)

const (
	joobleRunGateKey = "scraper:source:jooble:last_run"
	joobleRunCadence = 12 * time.Hour
)

func filterAdaptersByCadence(ctx context.Context, rdb *redis.Client, adapterList []ports.JobSource) []ports.JobSource {
	filtered := make([]ports.JobSource, 0, len(adapterList))

	for _, adapter := range adapterList {
		if ports.CapabilitiesOf(adapter).Provider != ports.ProviderJooble {
			filtered = append(filtered, adapter)
			continue
		}

		if shouldRunJooble(ctx, rdb) {
			filtered = append(filtered, adapter)
		}
	}

	return filtered
}

func shouldRunJooble(ctx context.Context, rdb *redis.Client) bool {
	if rdb == nil {
		slog.Warn("jooble: Valkey indisponível, cadência de 12h não será aplicada")
		return true
	}

	now := time.Now()
	ok, err := rdb.SetNX(ctx, joobleRunGateKey, now.Format(time.RFC3339), joobleRunCadence).Result()
	if err != nil {
		slog.Warn("jooble: falha ao verificar cadência de execução, adapter será liberado", "error", err)
		return true
	}
	if ok {
		slog.Info("jooble: execução liberada", "cadence", joobleRunCadence)
		return true
	}

	ttl, err := rdb.TTL(ctx, joobleRunGateKey).Result()
	if err != nil {
		slog.Info("jooble: execução ignorada pela cadência de 12h")
		return false
	}

	slog.Info("jooble: execução ignorada pela cadência de 12h", "next_available_in", ttl.Round(time.Minute))
	return false
}
