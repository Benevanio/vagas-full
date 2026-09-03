package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
)

const (
	DefaultMaxConcurrency          = 12
	DefaultProviderMaxConcurrency  = 2
	DefaultRunLockTTL              = 120 * time.Second
	DefaultRunLockRenewInterval    = 30 * time.Second
	DefaultClassificationBatchSize = 100
	DefaultPersistBatchSize        = 100
	DefaultIndexBatchSize          = 250
	MaxClassificationBatchSize     = 1000
	MaxPersistBatchSize            = 1000
	MaxIndexBatchSize              = 2500

	SourceEnvironment     = "environment"
	SourceInternalDefault = "internal_default"

	ScraperMaxConcurrencyEnv               = "SCRAPER_MAX_CONCURRENCY"
	ScraperProviderMaxConcurrencyEnv       = "SCRAPER_PROVIDER_MAX_CONCURRENCY"
	ScraperProviderConcurrencyOverridesEnv = "SCRAPER_PROVIDER_CONCURRENCY_OVERRIDES"
	ScraperRunLockTTLEnv                   = "SCRAPER_RUN_LOCK_TTL"
	ScraperRunLockRenewIntervalEnv         = "SCRAPER_RUN_LOCK_RENEW_INTERVAL"
	ScraperClassificationBatchSizeEnv      = "SCRAPER_CLASSIFICATION_BATCH_SIZE"
	ScraperPersistBatchSizeEnv             = "SCRAPER_PERSIST_BATCH_SIZE"
	ScraperIndexBatchSizeEnv               = "SCRAPER_INDEX_BATCH_SIZE"
)

type RuntimeConfig struct {
	MaxConcurrency               int
	MaxConcurrencySource         string
	ProviderMaxConcurrency       int
	ProviderMaxConcurrencySource string
	ProviderConcurrencyOverrides map[ports.ProviderID]int
	RunLockTTL                   time.Duration
	RunLockRenewInterval         time.Duration
	ClassificationBatchSize      int
	PersistBatchSize             int
	IndexBatchSize               int
}

func LoadRuntimeConfig() (RuntimeConfig, error) {
	return LoadRuntimeConfigFromLookup(os.LookupEnv)
}

func LoadRuntimeConfigFromLookup(lookup func(string) (string, bool)) (RuntimeConfig, error) {
	cfg := RuntimeConfig{
		MaxConcurrency:               DefaultMaxConcurrency,
		MaxConcurrencySource:         SourceInternalDefault,
		ProviderMaxConcurrency:       DefaultProviderMaxConcurrency,
		ProviderMaxConcurrencySource: SourceInternalDefault,
		ProviderConcurrencyOverrides: make(map[ports.ProviderID]int),
		RunLockTTL:                   DefaultRunLockTTL,
		RunLockRenewInterval:         DefaultRunLockRenewInterval,
		ClassificationBatchSize:      DefaultClassificationBatchSize,
		PersistBatchSize:             DefaultPersistBatchSize,
		IndexBatchSize:               DefaultIndexBatchSize,
	}

	if value, ok := lookup(ScraperMaxConcurrencyEnv); ok {
		parsed, err := positiveInt(ScraperMaxConcurrencyEnv, value)
		if err != nil {
			return RuntimeConfig{}, err
		}
		cfg.MaxConcurrency = parsed
		cfg.MaxConcurrencySource = SourceEnvironment
	}

	if value, ok := lookup(ScraperProviderMaxConcurrencyEnv); ok {
		parsed, err := positiveInt(ScraperProviderMaxConcurrencyEnv, value)
		if err != nil {
			return RuntimeConfig{}, err
		}
		if parsed > cfg.MaxConcurrency {
			return RuntimeConfig{}, fmt.Errorf(
				"%s must not exceed %s",
				ScraperProviderMaxConcurrencyEnv,
				ScraperMaxConcurrencyEnv,
			)
		}
		cfg.ProviderMaxConcurrency = parsed
		cfg.ProviderMaxConcurrencySource = SourceEnvironment
	} else if cfg.ProviderMaxConcurrency > cfg.MaxConcurrency {
		cfg.ProviderMaxConcurrency = cfg.MaxConcurrency
	}

	if value, ok := lookup(ScraperProviderConcurrencyOverridesEnv); ok {
		overrides, err := parseProviderConcurrencyOverrides(value, cfg.MaxConcurrency)
		if err != nil {
			return RuntimeConfig{}, err
		}
		cfg.ProviderConcurrencyOverrides = overrides
	}

	var err error
	cfg.RunLockTTL, err = durationFromLookup(lookup, ScraperRunLockTTLEnv, DefaultRunLockTTL)
	if err != nil {
		return RuntimeConfig{}, err
	}
	cfg.RunLockRenewInterval, err = durationFromLookup(lookup, ScraperRunLockRenewIntervalEnv, DefaultRunLockRenewInterval)
	if err != nil {
		return RuntimeConfig{}, err
	}
	if cfg.RunLockRenewInterval >= cfg.RunLockTTL {
		return RuntimeConfig{}, fmt.Errorf(
			"%s must be shorter than %s",
			ScraperRunLockRenewIntervalEnv,
			ScraperRunLockTTLEnv,
		)
	}

	cfg.ClassificationBatchSize, err = boundedPositiveIntFromLookup(
		lookup,
		ScraperClassificationBatchSizeEnv,
		DefaultClassificationBatchSize,
		MaxClassificationBatchSize,
	)
	if err != nil {
		return RuntimeConfig{}, err
	}
	cfg.PersistBatchSize, err = boundedPositiveIntFromLookup(
		lookup,
		ScraperPersistBatchSizeEnv,
		DefaultPersistBatchSize,
		MaxPersistBatchSize,
	)
	if err != nil {
		return RuntimeConfig{}, err
	}
	cfg.IndexBatchSize, err = boundedPositiveIntFromLookup(
		lookup,
		ScraperIndexBatchSizeEnv,
		DefaultIndexBatchSize,
		MaxIndexBatchSize,
	)
	if err != nil {
		return RuntimeConfig{}, err
	}

	return cfg, nil
}

func boundedPositiveIntFromLookup(
	lookup func(string) (string, bool),
	key string,
	fallback int,
	max int,
) (int, error) {
	value, ok := lookup(key)
	if !ok {
		return fallback, nil
	}
	parsed, err := positiveInt(key, value)
	if err != nil {
		return 0, err
	}
	if parsed > max {
		return 0, fmt.Errorf("%s must not exceed %d", key, max)
	}
	return parsed, nil
}

func positiveInt(key, value string) (int, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return 0, fmt.Errorf("%s must be a positive integer", key)
	}
	parsed, err := strconv.Atoi(trimmed)
	if err != nil {
		return 0, fmt.Errorf("%s must be a positive integer: %w", key, err)
	}
	if parsed <= 0 {
		return 0, fmt.Errorf("%s must be greater than zero", key)
	}
	return parsed, nil
}

func parseProviderConcurrencyOverrides(
	value string,
	globalMax int,
) (map[ports.ProviderID]int, error) {
	overrides := make(map[ports.ProviderID]int)
	if strings.TrimSpace(value) == "" {
		return overrides, nil
	}

	for _, entry := range strings.Split(value, ",") {
		parts := strings.Split(entry, "=")
		if len(parts) != 2 {
			return nil, fmt.Errorf(
				"%s entry %q must use provider=limit",
				ScraperProviderConcurrencyOverridesEnv,
				entry,
			)
		}

		provider, known := ports.ParseProviderID(parts[0])
		if !known {
			return nil, fmt.Errorf(
				"%s contains unknown provider %q",
				ScraperProviderConcurrencyOverridesEnv,
				strings.TrimSpace(parts[0]),
			)
		}
		if _, duplicate := overrides[provider]; duplicate {
			return nil, fmt.Errorf(
				"%s contains duplicate provider %q",
				ScraperProviderConcurrencyOverridesEnv,
				provider,
			)
		}

		limit, err := positiveInt(ScraperProviderConcurrencyOverridesEnv, parts[1])
		if err != nil {
			return nil, fmt.Errorf("provider %s: %w", provider, err)
		}
		if limit > globalMax {
			return nil, fmt.Errorf(
				"%s for provider %s must not exceed %s",
				ScraperProviderConcurrencyOverridesEnv,
				provider,
				ScraperMaxConcurrencyEnv,
			)
		}
		overrides[provider] = limit
	}

	return overrides, nil
}

func durationFromLookup(
	lookup func(string) (string, bool),
	key string,
	fallback time.Duration,
) (time.Duration, error) {
	value, ok := lookup(key)
	if !ok {
		return fallback, nil
	}

	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return 0, fmt.Errorf("%s must be a valid positive duration", key)
	}

	parsed, err := time.ParseDuration(trimmed)
	if err != nil {
		return 0, fmt.Errorf("%s must be a valid positive duration: %w", key, err)
	}
	if parsed <= 0 {
		return 0, fmt.Errorf("%s must be greater than zero", key)
	}
	return parsed, nil
}

func ResolveEffectiveConcurrency(requested, globalMax int) int {
	if requested <= 0 {
		return globalMax
	}
	if requested > globalMax {
		return globalMax
	}
	return requested
}
