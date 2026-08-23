package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultMaxConcurrency       = 12
	DefaultRunLockTTL           = 120 * time.Second
	DefaultRunLockRenewInterval = 30 * time.Second

	SourceEnvironment     = "environment"
	SourceInternalDefault = "internal_default"

	ScraperMaxConcurrencyEnv       = "SCRAPER_MAX_CONCURRENCY"
	ScraperRunLockTTLEnv           = "SCRAPER_RUN_LOCK_TTL"
	ScraperRunLockRenewIntervalEnv = "SCRAPER_RUN_LOCK_RENEW_INTERVAL"
)

type RuntimeConfig struct {
	MaxConcurrency       int
	MaxConcurrencySource string
	RunLockTTL           time.Duration
	RunLockRenewInterval time.Duration
}

func LoadRuntimeConfig() (RuntimeConfig, error) {
	return LoadRuntimeConfigFromLookup(os.LookupEnv)
}

func LoadRuntimeConfigFromLookup(lookup func(string) (string, bool)) (RuntimeConfig, error) {
	cfg := RuntimeConfig{
		MaxConcurrency:       DefaultMaxConcurrency,
		MaxConcurrencySource: SourceInternalDefault,
		RunLockTTL:           DefaultRunLockTTL,
		RunLockRenewInterval: DefaultRunLockRenewInterval,
	}

	value, ok := lookup(ScraperMaxConcurrencyEnv)
	if ok {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return RuntimeConfig{}, fmt.Errorf("%s must be a positive integer", ScraperMaxConcurrencyEnv)
		}

		parsed, err := strconv.Atoi(trimmed)
		if err != nil {
			return RuntimeConfig{}, fmt.Errorf("%s must be a positive integer: %w", ScraperMaxConcurrencyEnv, err)
		}
		if parsed <= 0 {
			return RuntimeConfig{}, fmt.Errorf("%s must be greater than zero", ScraperMaxConcurrencyEnv)
		}

		cfg.MaxConcurrency = parsed
		cfg.MaxConcurrencySource = SourceEnvironment
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

	return cfg, nil
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
