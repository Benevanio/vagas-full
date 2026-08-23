package main

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/cache"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/config"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/keywords"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/pipeline"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/runlock"
)

const (
	scrapeTTL     = 10 * time.Minute
	scrapeTimeout = 15 * time.Minute
)

func handleScrape(
	adapterList []ports.JobSource,
	kwStore *keywords.Store,
	c cache.Cache,
	rdb *redis.Client,
	runLock *runlock.Manager,
	runtimeCfg config.RuntimeConfig,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req domain.ScrapeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json body", http.StatusBadRequest)
			return
		}

		if len(req.Keywords) == 0 {
			kws, err := kwStore.Load(r.Context())
			if err != nil || len(kws) == 0 {
				http.Error(w, "falha ao carregar keywords do sistema", http.StatusInternalServerError)
				return
			}
			req.Keywords = kws
		}

		ctx, cancel := context.WithTimeout(r.Context(), scrapeTimeout)
		defer cancel()

		searchConfig := searchConfigFromRequest(req, runtimeCfg.MaxConcurrency)
		slogScrapeStart("public_endpoint", runtimeCfg.MaxConcurrency, req.MaxConcurrency, searchConfig.MaxConcurrency, len(searchConfig.Keywords), len(adapterList))

		start := time.Now()

		result, err := pipeline.SearchJobs(
			ctx,
			c,
			searchConfig,
			adapterList,
			scrapeTTL,
			rdb,
			runLock,
			"public_endpoint",
		)
		if err != nil {
			if mapRunLockError(w, err) {
				return
			}
			http.Error(w, "Erro ao buscar vagas.", http.StatusInternalServerError)
			return
		}

		printSummary(len(adapterList), req.Keywords, result.Total, time.Since(start))

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", cacheHeader(result.FromCache))
		json.NewEncoder(w).Encode(domain.ScrapeResponse{
			Jobs:     result.Jobs,
			Total:    result.Total,
			CachedAt: result.CachedAt.UTC().Format(time.RFC3339),
		})
	}
}

func searchConfigFromRequest(req domain.ScrapeRequest, globalMaxConcurrency int) pipeline.SearchConfig {
	return pipeline.SearchConfig{
		Keywords:              req.Keywords,
		SearchLocation:        req.SearchLocation,
		SearchGeoID:           req.SearchGeoID,
		SearchLanguage:        req.SearchLanguage,
		JobTypes:              req.JobTypes,
		TimeFilter:            req.TimeFilter,
		RemoteOnly:            req.RemoteOnly,
		Sources:               req.Sources,
		ResultsPerPage:        req.ResultsPerPage,
		MaxPagesPerKeyword:    req.MaxPagesPerKeyword,
		WaitBetweenSearchesMs: req.WaitBetweenSearchesMs,
		PageTimeoutMs:         req.PageTimeoutMs,
		MaxConcurrency:        config.ResolveEffectiveConcurrency(req.MaxConcurrency, globalMaxConcurrency),
	}
}

func handleHealth(c cache.Cache) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"ok":    true,
			"cache": c.Status().Provider,
		})
	}
}

func handleGetKeywords(kwStore *keywords.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		kws, err := kwStore.Load(r.Context())
		if err != nil {
			http.Error(w, "erro ao carregar keywords", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"keywords": kws,
			"total":    len(kws),
		})
	}
}

func handleSaveKeywords(kwStore *keywords.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Keywords []string `json:"keywords"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}

		expanded := keywords.GenerateSearchKeywords(body.Keywords)

		if err := kwStore.Save(r.Context(), expanded); err != nil {
			http.Error(w, "erro ao salvar keywords", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"ok":       true,
			"keywords": expanded,
		})
	}
}

func cacheHeader(fromCache bool) string {
	if fromCache {
		return "HIT"
	}
	return "MISS"
}
