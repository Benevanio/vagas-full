package pipeline

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/keywords"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/redis/go-redis/v9"
)

type SearchConfig struct {
	Keywords                     []string                 `json:"keywords"`
	SearchLocation               string                   `json:"searchLocation"`
	SearchGeoID                  string                   `json:"searchGeoId"`
	SearchLanguage               string                   `json:"searchLanguage"`
	JobTypes                     string                   `json:"jobTypes"`
	TimeFilter                   string                   `json:"timeFilter"`
	RemoteOnly                   bool                     `json:"remoteOnly"`
	Sources                      []string                 `json:"sources"`
	ResultsPerPage               int                      `json:"resultsPerPage"`
	MaxPagesPerKeyword           int                      `json:"maxPagesPerKeyword"`
	WaitBetweenSearchesMs        int                      `json:"waitBetweenSearchesMs"`
	PageTimeoutMs                int                      `json:"pageTimeoutMs"`
	MaxConcurrency               int                      `json:"maxConcurrency"`
	ProviderMaxConcurrency       int                      `json:"-"`
	ProviderConcurrencyOverrides map[ports.ProviderID]int `json:"-"`
}

func normalizeSearchConfig(config SearchConfig) SearchConfig {
	config.Keywords = keywords.GenerateSearchKeywords(config.Keywords)
	if config.ProviderMaxConcurrency <= 0 {
		config.ProviderMaxConcurrency = min(2, max(1, config.MaxConcurrency))
	}
	return config
}

func ScrapeAllSources(
	ctx context.Context,
	config SearchConfig,
	adapterList []ports.JobSource,
	rdb *redis.Client,
) ([]domain.Job, error) {
	config = normalizeSearchConfig(config)
	slog.Info("starting scrape", "keywords", config.Keywords)
	slog.Info("scraper concurrency budget",
		"global_limit", config.MaxConcurrency,
		"provider_default_limit", config.ProviderMaxConcurrency,
		"provider_overrides", formatProviderOverrides(config.ProviderConcurrencyOverrides),
	)

	adapterList = filterAdaptersByCadence(ctx, rdb, adapterList)

	req := domain.ScrapeRequest{
		Keywords:              config.Keywords,
		SearchLocation:        config.SearchLocation,
		SearchGeoID:           config.SearchGeoID,
		SearchLanguage:        config.SearchLanguage,
		JobTypes:              config.JobTypes,
		TimeFilter:            config.TimeFilter,
		RemoteOnly:            config.RemoteOnly,
		Sources:               config.Sources,
		ResultsPerPage:        config.ResultsPerPage,
		MaxPagesPerKeyword:    config.MaxPagesPerKeyword,
		WaitBetweenSearchesMs: config.WaitBetweenSearchesMs,
		PageTimeoutMs:         config.PageTimeoutMs,
		MaxConcurrency:        config.MaxConcurrency,
	}

	jobs, err := runWithConcurrency(
		ctx,
		adapterList,
		req,
		config.ProviderMaxConcurrency,
		config.ProviderConcurrencyOverrides,
	)
	if err != nil {
		return nil, err
	}

	slog.Info("scrape finished",
		"total_jobs", len(jobs),
		"keywords", len(config.Keywords),
		"adapters", len(adapterList),
	)

	return jobs, nil
}

func formatProviderOverrides(overrides map[ports.ProviderID]int) string {
	values := make([]string, 0, len(overrides))
	for provider, limit := range overrides {
		values = append(values, fmt.Sprintf("%s=%d", provider, limit))
	}
	sort.Strings(values)
	return strings.Join(values, ",")
}
