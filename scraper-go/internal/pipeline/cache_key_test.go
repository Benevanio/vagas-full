package pipeline

import (
	"strings"
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
)

func TestBuildCacheKeyNormalizesAndDeduplicatesKeywords(t *testing.T) {
	a := BuildCacheKey(SearchConfig{
		Keywords:       []string{" Go ", "go", "", "Node"},
		SearchLocation: " Brasil ",
	})
	b := BuildCacheKey(SearchConfig{
		Keywords:       []string{"node", "GO"},
		SearchLocation: "brasil",
	})

	if a != b {
		t.Fatalf("expected equivalent normalized cache keys, got %q and %q", a, b)
	}
}

func TestBuildCacheKeyIncludesResultAndExecutionConfig(t *testing.T) {
	base := SearchConfig{
		Keywords:              []string{"go"},
		SearchLocation:        "Brasil",
		SearchGeoID:           "106057199",
		SearchLanguage:        "pt",
		JobTypes:              "C,F",
		TimeFilter:            "r604800",
		RemoteOnly:            true,
		Sources:               []string{"LinkedIn", "Adzuna"},
		ResultsPerPage:        20,
		MaxPagesPerKeyword:    3,
		WaitBetweenSearchesMs: 1000,
		PageTimeoutMs:         15000,
		MaxConcurrency:        10,
	}

	cases := []struct {
		name   string
		mutate func(*SearchConfig)
	}{
		{name: "search geo id", mutate: func(c *SearchConfig) { c.SearchGeoID = "92000000" }},
		{name: "search language", mutate: func(c *SearchConfig) { c.SearchLanguage = "en" }},
		{name: "remote only", mutate: func(c *SearchConfig) { c.RemoteOnly = false }},
		{name: "sources", mutate: func(c *SearchConfig) { c.Sources = []string{"LinkedIn"} }},
		{name: "results per page", mutate: func(c *SearchConfig) { c.ResultsPerPage = 50 }},
		{name: "max pages per keyword", mutate: func(c *SearchConfig) { c.MaxPagesPerKeyword = 10 }},
		{name: "wait between searches", mutate: func(c *SearchConfig) { c.WaitBetweenSearchesMs = 2000 }},
		{name: "page timeout", mutate: func(c *SearchConfig) { c.PageTimeoutMs = 30000 }},
		{name: "max concurrency", mutate: func(c *SearchConfig) { c.MaxConcurrency = 25 }},
	}

	baseKey := BuildCacheKey(base)
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			changed := base
			changed.Sources = append([]string(nil), base.Sources...)
			tc.mutate(&changed)

			if key := BuildCacheKey(changed); key == baseKey {
				t.Fatalf("expected cache key to change for %s", tc.name)
			}
		})
	}
}

func TestBuildCacheKeyNormalizesSourcesOrder(t *testing.T) {
	a := BuildCacheKey(SearchConfig{
		Keywords: []string{"go"},
		Sources:  []string{" LinkedIn ", "adzuna", "linkedin"},
	})
	b := BuildCacheKey(SearchConfig{
		Keywords: []string{"go"},
		Sources:  []string{"ADZUNA", "linkedin"},
	})

	if a != b {
		t.Fatalf("expected equivalent source sets to share cache key, got %q and %q", a, b)
	}
}

func TestBuildCacheKeyUsesEffectiveMaxConcurrency(t *testing.T) {
	key := BuildCacheKey(SearchConfig{
		Keywords:       []string{"go"},
		SearchLocation: "Brasil",
		MaxConcurrency: 12,
	})

	if !strings.HasSuffix(key, ":12") {
		t.Fatalf("expected cache key to contain effective max concurrency, got %q", key)
	}
}

func TestBuildCacheKeyDoesNotChangeForProviderConcurrencyLimits(t *testing.T) {
	base := SearchConfig{
		Keywords:       []string{"go"},
		SearchLocation: "Brasil",
		MaxConcurrency: 12,
	}
	withProviderLimits := base
	withProviderLimits.ProviderMaxConcurrency = 3
	withProviderLimits.ProviderConcurrencyOverrides = map[ports.ProviderID]int{
		ports.ProviderGupy: 5,
	}

	if got, want := BuildCacheKey(withProviderLimits), BuildCacheKey(base); got != want {
		t.Fatalf("provider execution limits changed cache key: got %q want %q", got, want)
	}
}

func TestBuildCacheKeyDoesNotChangeForBatchSizes(t *testing.T) {
	base := SearchConfig{
		Keywords:       []string{"go"},
		SearchLocation: "Brasil",
		MaxConcurrency: 12,
	}
	withBatches := base
	withBatches.RunID = "run-1"
	withBatches.ClassificationBatchSize = 10
	withBatches.PersistBatchSize = 20
	withBatches.IndexBatchSize = 30

	if got, want := BuildCacheKey(withBatches), BuildCacheKey(base); got != want {
		t.Fatalf("batch sizes changed cache key: got %q want %q", got, want)
	}
}
