package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadRuntimeConfigUsesDefaultWhenEnvMissing(t *testing.T) {
	cfg, err := LoadRuntimeConfigFromLookup(func(string) (string, bool) {
		return "", false
	})

	require.NoError(t, err)
	assert.Equal(t, 12, cfg.MaxConcurrency)
	assert.Equal(t, SourceInternalDefault, cfg.MaxConcurrencySource)
	assert.Equal(t, 2, cfg.ProviderMaxConcurrency)
	assert.Equal(t, SourceInternalDefault, cfg.ProviderMaxConcurrencySource)
	assert.Empty(t, cfg.ProviderConcurrencyOverrides)
	assert.Equal(t, 120*time.Second, cfg.RunLockTTL)
	assert.Equal(t, 30*time.Second, cfg.RunLockRenewInterval)
}

func TestLoadRuntimeConfigUsesEnvValue(t *testing.T) {
	cfg, err := LoadRuntimeConfigFromLookup(func(key string) (string, bool) {
		if key == ScraperMaxConcurrencyEnv {
			return "8", true
		}
		return "", false
	})

	require.NoError(t, err)
	assert.Equal(t, 8, cfg.MaxConcurrency)
	assert.Equal(t, SourceEnvironment, cfg.MaxConcurrencySource)
}

func TestLoadRuntimeConfigRejectsInvalidEnvValues(t *testing.T) {
	cases := []struct {
		name  string
		value string
	}{
		{name: "empty", value: ""},
		{name: "blank", value: "   "},
		{name: "zero", value: "0"},
		{name: "negative", value: "-1"},
		{name: "not numeric", value: "abc"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := LoadRuntimeConfigFromLookup(func(string) (string, bool) {
				return tc.value, true
			})

			require.Error(t, err)
		})
	}
}

func TestResolveEffectiveConcurrency(t *testing.T) {
	assert.Equal(t, 12, ResolveEffectiveConcurrency(0, 12))
	assert.Equal(t, 12, ResolveEffectiveConcurrency(-1, 12))
	assert.Equal(t, 8, ResolveEffectiveConcurrency(8, 12))
	assert.Equal(t, 12, ResolveEffectiveConcurrency(40, 12))
}

func TestLoadRuntimeConfigUsesProviderConcurrencyFromEnvironment(t *testing.T) {
	values := map[string]string{
		ScraperMaxConcurrencyEnv:               "12",
		ScraperProviderMaxConcurrencyEnv:       "3",
		ScraperProviderConcurrencyOverridesEnv: "gupy=4, greenhouse=2,lever=1",
	}

	cfg, err := LoadRuntimeConfigFromLookup(func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	})

	require.NoError(t, err)
	assert.Equal(t, 3, cfg.ProviderMaxConcurrency)
	assert.Equal(t, SourceEnvironment, cfg.ProviderMaxConcurrencySource)
	assert.Equal(t, map[ports.ProviderID]int{
		ports.ProviderGupy:       4,
		ports.ProviderGreenhouse: 2,
		ports.ProviderLever:      1,
	}, cfg.ProviderConcurrencyOverrides)
}

func TestLoadRuntimeConfigClampsInternalProviderDefaultToGlobalLimit(t *testing.T) {
	cfg, err := LoadRuntimeConfigFromLookup(func(key string) (string, bool) {
		if key == ScraperMaxConcurrencyEnv {
			return "1", true
		}
		return "", false
	})

	require.NoError(t, err)
	assert.Equal(t, 1, cfg.ProviderMaxConcurrency)
	assert.Equal(t, SourceInternalDefault, cfg.ProviderMaxConcurrencySource)
}

func TestLoadRuntimeConfigRejectsInvalidProviderMaxConcurrency(t *testing.T) {
	cases := []struct {
		name  string
		value string
	}{
		{name: "empty", value: ""},
		{name: "blank", value: "   "},
		{name: "zero", value: "0"},
		{name: "negative", value: "-1"},
		{name: "not numeric", value: "abc"},
		{name: "greater than global", value: "13"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := LoadRuntimeConfigFromLookup(func(key string) (string, bool) {
				switch key {
				case ScraperMaxConcurrencyEnv:
					return "12", true
				case ScraperProviderMaxConcurrencyEnv:
					return tc.value, true
				default:
					return "", false
				}
			})

			require.Error(t, err)
		})
	}
}

func TestLoadRuntimeConfigRejectsInvalidProviderOverrides(t *testing.T) {
	cases := []struct {
		name  string
		value string
	}{
		{name: "missing equals", value: "gupy"},
		{name: "empty provider", value: "=2"},
		{name: "empty limit", value: "gupy="},
		{name: "empty entry", value: "gupy=2,"},
		{name: "duplicate provider", value: "gupy=2,GUPY=3"},
		{name: "unknown provider", value: "unknown=2"},
		{name: "zero", value: "gupy=0"},
		{name: "negative", value: "gupy=-1"},
		{name: "not numeric", value: "gupy=abc"},
		{name: "greater than global", value: "gupy=13"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := LoadRuntimeConfigFromLookup(func(key string) (string, bool) {
				switch key {
				case ScraperMaxConcurrencyEnv:
					return "12", true
				case ScraperProviderConcurrencyOverridesEnv:
					return tc.value, true
				default:
					return "", false
				}
			})

			require.Error(t, err)
		})
	}
}

func TestLoadRuntimeConfigUsesRunLockDurationsFromEnvironment(t *testing.T) {
	values := map[string]string{
		ScraperRunLockTTLEnv:           "3m",
		ScraperRunLockRenewIntervalEnv: "45s",
	}

	cfg, err := LoadRuntimeConfigFromLookup(func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	})

	require.NoError(t, err)
	assert.Equal(t, 3*time.Minute, cfg.RunLockTTL)
	assert.Equal(t, 45*time.Second, cfg.RunLockRenewInterval)
}

func TestLoadRuntimeConfigRejectsInvalidRunLockDurations(t *testing.T) {
	cases := []struct {
		name   string
		values map[string]string
	}{
		{
			name:   "empty ttl",
			values: map[string]string{ScraperRunLockTTLEnv: ""},
		},
		{
			name:   "blank ttl",
			values: map[string]string{ScraperRunLockTTLEnv: "   "},
		},
		{
			name:   "empty renewal interval",
			values: map[string]string{ScraperRunLockRenewIntervalEnv: ""},
		},
		{
			name:   "blank renewal interval",
			values: map[string]string{ScraperRunLockRenewIntervalEnv: "   "},
		},
		{
			name:   "invalid ttl",
			values: map[string]string{ScraperRunLockTTLEnv: "invalid"},
		},
		{
			name:   "zero ttl",
			values: map[string]string{ScraperRunLockTTLEnv: "0s"},
		},
		{
			name:   "negative renewal interval",
			values: map[string]string{ScraperRunLockRenewIntervalEnv: "-1s"},
		},
		{
			name: "renewal equals ttl",
			values: map[string]string{
				ScraperRunLockTTLEnv:           "30s",
				ScraperRunLockRenewIntervalEnv: "30s",
			},
		},
		{
			name: "renewal exceeds ttl",
			values: map[string]string{
				ScraperRunLockTTLEnv:           "30s",
				ScraperRunLockRenewIntervalEnv: "31s",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := LoadRuntimeConfigFromLookup(func(key string) (string, bool) {
				value, ok := tc.values[key]
				return value, ok
			})

			require.Error(t, err)
		})
	}
}

func TestDockerComposeUsesUnsetOnlyDefaultsForRunLock(t *testing.T) {
	composePath, ok := findMonorepoFile(t, "docker-compose.yml")
	if !ok {
		t.Skip("docker-compose.yml not available outside the monorepo checkout")
	}

	content, err := os.ReadFile(composePath)
	require.NoError(t, err)

	compose := string(content)
	assert.Contains(t, compose, "SCRAPER_MAX_CONCURRENCY=${SCRAPER_MAX_CONCURRENCY-12}")
	assert.Contains(t, compose, "SCRAPER_PROVIDER_MAX_CONCURRENCY=${SCRAPER_PROVIDER_MAX_CONCURRENCY-2}")
	assert.Contains(t, compose, "SCRAPER_PROVIDER_CONCURRENCY_OVERRIDES=${SCRAPER_PROVIDER_CONCURRENCY_OVERRIDES-}")
	assert.Contains(t, compose, "SCRAPER_RUN_LOCK_TTL=${SCRAPER_RUN_LOCK_TTL-120s}")
	assert.Contains(t, compose, "SCRAPER_RUN_LOCK_RENEW_INTERVAL=${SCRAPER_RUN_LOCK_RENEW_INTERVAL-30s}")
	assert.NotContains(t, compose, "SCRAPER_PROVIDER_MAX_CONCURRENCY=${SCRAPER_PROVIDER_MAX_CONCURRENCY:-2}")
	assert.NotContains(t, compose, "INHIRE_DETAILS_CONCURRENCY")
	assert.NotContains(t, compose, "SCRAPER_RUN_LOCK_TTL=${SCRAPER_RUN_LOCK_TTL:-120s}")
	assert.NotContains(t, compose, "SCRAPER_RUN_LOCK_RENEW_INTERVAL=${SCRAPER_RUN_LOCK_RENEW_INTERVAL:-30s}")
}

func findMonorepoFile(t *testing.T, name string) (string, bool) {
	t.Helper()

	dir, err := os.Getwd()
	require.NoError(t, err)

	for {
		candidate := filepath.Join(dir, name)
		scraperMod := filepath.Join(dir, "scraper-go", "go.mod")
		if _, err := os.Stat(candidate); err == nil {
			if _, err := os.Stat(scraperMod); err == nil {
				return candidate, true
			}
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}
