package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/cronjob"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/jobstore"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/runlock"
)

// handleTriggerScrape dispara o scraper manualmente via POST /admin/scrape
// retorna 409 se já houver uma execução em andamento.
func handleTriggerScrape(scheduler *cronjob.Scheduler, executionCtx context.Context) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// A execução manual precisa sobreviver ao fim da request HTTP; se usarmos
		// r.Context(), o scraper nasce com contexto cancelado assim que respondemos.
		if err := scheduler.RunNow(executionCtx); err != nil {
			if errors.Is(err, cronjob.ErrAlreadyRunning) {
				writeScraperError(
					w,
					http.StatusConflict,
					"SCRAPER_ALREADY_RUNNING",
					"Já existe uma execução do scraper em andamento.",
				)
				return
			}
			if errors.Is(err, cronjob.ErrLockUnavailable) {
				writeScraperError(
					w,
					http.StatusServiceUnavailable,
					"SCRAPER_RUN_LOCK_UNAVAILABLE",
					"Não foi possível confirmar a disponibilidade do scraper.",
				)
				return
			}
			writeScraperError(
				w,
				http.StatusInternalServerError,
				"SCRAPER_START_FAILED",
				"Erro ao iniciar scraper.",
			)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"ok":      true,
			"message": "scraper iniciado em background",
		})
	}
}

func writeScraperError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":      false,
		"code":    code,
		"message": message,
	})
}

func mapRunLockError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, runlock.ErrAlreadyHeld):
		writeScraperError(
			w,
			http.StatusConflict,
			"SCRAPER_ALREADY_RUNNING",
			"Já existe uma execução do scraper em andamento.",
		)
		return true
	case errors.Is(err, runlock.ErrUnavailable):
		writeScraperError(
			w,
			http.StatusServiceUnavailable,
			"SCRAPER_RUN_LOCK_UNAVAILABLE",
			"Não foi possível confirmar a disponibilidade do scraper.",
		)
		return true
	case errors.Is(err, runlock.ErrLost):
		writeScraperError(
			w,
			http.StatusServiceUnavailable,
			"SCRAPER_RUN_LOCK_LOST",
			"A execução perdeu o lock distribuído e foi cancelada.",
		)
		return true
	default:
		return false
	}
}

// handleScraperStatus retorna o estado atual do scheduler via GET /admin/scrape/status
func handleScraperStatus(scheduler *cronjob.Scheduler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		running, lastRunAt, jobsCollected := scheduler.Snapshot()
		var lastRunAtValue *string
		if !lastRunAt.IsZero() {
			formatted := lastRunAt.Format(time.RFC3339)
			lastRunAtValue = &formatted
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"name":          "go-scraper",
			"running":       running,
			"lastRunAt":     lastRunAtValue,
			"jobsCollected": jobsCollected,
		})
	}
}

// handleGetJobs retorna todas as vagas do Valkey via GET /admin/jobs
// Para o frontend, o Node.js lê direto do Valkey — esse endpoint é para uso administrativo.
func handleGetJobs(js *jobstore.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

		jobs, err := js.GetSample(r.Context(), limit)
		if err != nil {
			http.Error(w, "erro ao buscar vagas", http.StatusInternalServerError)
			return
		}

		total := len(jobs)
		if limit > 0 {
			if count, countErr := js.Count(r.Context()); countErr == nil {
				total = int(count)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"jobs":  jobs,
			"total": total,
		})
	}
}

// handleJobsCount retorna o total de vagas no índice via GET /admin/jobs/count
func handleJobsCount(js *jobstore.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		count, err := js.Count(r.Context())
		if err != nil {
			http.Error(w, "erro ao contar vagas", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"total": count,
		})
	}
}
