package main

import (
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/config"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/pipeline"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/stretchr/testify/assert"
)

func TestSearchConfigFromRequestUsesGlobalLimitWhenRequestMissing(t *testing.T) {
	cfg := searchConfigFromRequest(domain.ScrapeRequest{}, 12)

	assert.Equal(t, 12, cfg.MaxConcurrency)
}

func TestSearchConfigFromRequestUsesGlobalLimitWhenRequestIsNotPositive(t *testing.T) {
	assert.Equal(t, 12, searchConfigFromRequest(domain.ScrapeRequest{MaxConcurrency: 0}, 12).MaxConcurrency)
	assert.Equal(t, 12, searchConfigFromRequest(domain.ScrapeRequest{MaxConcurrency: -1}, 12).MaxConcurrency)
}

func TestSearchConfigFromRequestPreservesRequestBelowLimit(t *testing.T) {
	cfg := searchConfigFromRequest(domain.ScrapeRequest{MaxConcurrency: 8}, 12)

	assert.Equal(t, 8, cfg.MaxConcurrency)
}

func TestSearchConfigFromRequestCapsRequestAboveLimitBeforeCacheKey(t *testing.T) {
	req := domain.ScrapeRequest{
		Keywords:       []string{"go"},
		SearchLocation: "Brasil",
		MaxConcurrency: 40,
	}

	cfg := searchConfigFromRequest(req, 12)

	assert.Equal(t, 12, cfg.MaxConcurrency)
	assert.Contains(t, pipeline.BuildCacheKey(cfg), ":12")
}

func TestSearchConfigFromRequestUsesSameCacheKeyForRequestsAboveLimit(t *testing.T) {
	base := domain.ScrapeRequest{
		Keywords:       []string{"go"},
		SearchLocation: "Brasil",
	}

	req40 := base
	req40.MaxConcurrency = 40
	req100 := base
	req100.MaxConcurrency = 100

	key40 := pipeline.BuildCacheKey(searchConfigFromRequest(req40, 12))
	key100 := pipeline.BuildCacheKey(searchConfigFromRequest(req100, 12))

	assert.Equal(t, key40, key100)
}

func TestSearchConfigFromRuntimePropagatesProviderLimits(t *testing.T) {
	cfg := searchConfigFromRuntime(
		domain.ScrapeRequest{MaxConcurrency: 4},
		config.RuntimeConfig{
			MaxConcurrency:               12,
			ProviderMaxConcurrency:       3,
			ProviderConcurrencyOverrides: map[ports.ProviderID]int{ports.ProviderGupy: 8},
		},
	)

	assert.Equal(t, 4, cfg.MaxConcurrency)
	assert.Equal(t, 3, cfg.ProviderMaxConcurrency)
	assert.Equal(t, 8, cfg.ProviderConcurrencyOverrides[ports.ProviderGupy])
}
