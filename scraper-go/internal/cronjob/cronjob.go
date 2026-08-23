package cronjob

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/config"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/jobstore"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/keywords"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/pipeline"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/runlock"
)

type Config struct {
	Interval       time.Duration
	ScrapeTimeout  time.Duration
	SearchLocation string
	JobTypes       string
	TimeFilter     string
	RemoteOnly     bool
	MaxConcurrency int
}

func DefaultConfig() Config {
	return Config{
		Interval:       3 * time.Hour,
		ScrapeTimeout:  40 * time.Minute,
		SearchLocation: "Brasil",
		JobTypes:       "C,F",
		TimeFilter:     "r604800",
		RemoteOnly:     false,
		MaxConcurrency: config.DefaultMaxConcurrency,
	}
}

type Scheduler struct {
	cfg         Config
	kwStore     *keywords.Store
	jobStore    *jobstore.Store
	adapterList []ports.JobSource
	rdb         *redis.Client
	runLock     *runlock.Manager
	OnComplete  func(keywords []string, scraped, saved int, duration time.Duration)
	mu          sync.Mutex
	running     bool
	stopped     bool
	lastRunAt   time.Time
	lastJobs    int
	stop        chan struct{}
	stopOnce    sync.Once
	active      sync.WaitGroup
}

func New(
	cfg Config,
	kwStore *keywords.Store,
	jobStore *jobstore.Store,
	adapterList []ports.JobSource,
	rdb *redis.Client,
	runLock *runlock.Manager,
) *Scheduler {
	return &Scheduler{
		cfg:         cfg,
		kwStore:     kwStore,
		jobStore:    jobStore,
		adapterList: adapterList,
		rdb:         rdb,
		runLock:     runLock,
		OnComplete:  nil,
		stop:        make(chan struct{}),
	}
}

func (s *Scheduler) Start(ctx context.Context) {
	slog.Info("cronjob: scheduler iniciado", "interval", s.cfg.Interval)

	go func() {
		s.runCron(ctx)

		ticker := time.NewTicker(s.cfg.Interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				s.runCron(ctx)
			case <-s.stop:
				slog.Info("cronjob: scheduler encerrado")
				return
			case <-ctx.Done():
				slog.Info("cronjob: contexto cancelado, encerrando scheduler")
				return
			}
		}
	}()
}

func (s *Scheduler) Stop() {
	s.stopOnce.Do(func() {
		s.mu.Lock()
		s.stopped = true
		s.mu.Unlock()
		close(s.stop)
	})
}

// Shutdown impede novos disparos e aguarda as execuções ativas liberarem o lock.
func (s *Scheduler) Shutdown(ctx context.Context) error {
	s.Stop()

	done := make(chan struct{})
	go func() {
		s.active.Wait()
		close(done)
	}()

	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("cronjob: shutdown: %w", ctx.Err())
	}
}

func (s *Scheduler) RunNow(ctx context.Context) error {
	lease, err := s.acquire(ctx, "admin_manual")
	if err != nil {
		return err
	}

	// Contabiliza a execução antes do yield da goroutine para o Shutdown não
	// retornar enquanto o lease ainda estiver ativo.
	s.active.Add(1)
	go func() {
		defer s.active.Done()
		if runErr := s.runWithLease(lease); runErr != nil {
			slog.Error("cronjob: execução manual falhou",
				"source", "admin_manual",
				"error", runErr,
			)
		}
	}()
	return nil
}

func (s *Scheduler) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

func (s *Scheduler) Snapshot() (running bool, lastRunAt time.Time, jobsCollected int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running, s.lastRunAt, s.lastJobs
}

func (s *Scheduler) runCron(ctx context.Context) {
	lease, err := s.acquire(ctx, "cron")
	if errors.Is(err, runlock.ErrAlreadyHeld) {
		slog.Info("scraper execution skipped",
			"source", "cron",
			"reason", "run_lock_already_held",
			"attempted_at", time.Now().UTC(),
		)
		return
	}
	if err != nil {
		slog.Error("cronjob: falha ao adquirir lock distribuído",
			"source", "cron",
			"attempted_at", time.Now().UTC(),
			"error", err,
		)
		return
	}

	s.active.Add(1)
	defer s.active.Done()
	if err := s.runWithLease(lease); err != nil {
		slog.Error("cronjob: execução falhou", "source", "cron", "error", err)
	}
}

func (s *Scheduler) acquire(ctx context.Context, source string) (*runlock.Lease, error) {
	s.mu.Lock()
	stopped := s.stopped
	s.mu.Unlock()
	if stopped {
		return nil, fmt.Errorf("%w: scheduler is shutting down", runlock.ErrUnavailable)
	}
	if s.runLock == nil {
		return nil, fmt.Errorf("%w: lock service is not configured", runlock.ErrUnavailable)
	}
	return s.runLock.Acquire(ctx, source)
}

func (s *Scheduler) runWithLease(lease *runlock.Lease) (runErr error) {
	s.mu.Lock()
	s.running = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.running = false
		s.mu.Unlock()
	}()

	defer func() {
		releaseCtx, cancelRelease := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelRelease()
		if err := lease.Release(releaseCtx); err != nil && runErr == nil {
			runErr = err
		}
	}()

	start := time.Now()
	scrapeCtx, cancel := context.WithTimeout(lease.Context(), s.cfg.ScrapeTimeout)
	defer cancel()

	kws, err := s.kwStore.Load(scrapeCtx)
	if err != nil {
		slog.Error("cronjob: falha ao carregar keywords", "error", err)
		return fmt.Errorf("cronjob: load keywords: %w", err)
	}
	if len(kws) == 0 {
		err = errors.New("no keywords configured")
		slog.Error("cronjob: falha ao carregar keywords", "error", err)
		return fmt.Errorf("cronjob: load keywords: %w", err)
	}

	config := s.searchConfig(kws)
	slog.Info("scraper execução iniciada",
		"source", lease.State().Source,
		"run_id", lease.RunID(),
		"max_concurrency_configured", s.cfg.MaxConcurrency,
		"max_concurrency_effective", config.MaxConcurrency,
		"keywords", len(kws),
		"adapters", len(s.adapterList),
	)

	jobs, err := pipeline.ScrapeAllSources(scrapeCtx, config, s.adapterList, s.rdb)
	if err != nil {
		slog.Error("cronjob: scrape falhou", "error", err)
		return fmt.Errorf("cronjob: scrape: %w", err)
	}
	if err := executionError(scrapeCtx); err != nil {
		return err
	}

	// Salva apenas vagas novas
	saved, err := s.jobStore.SaveBatch(scrapeCtx, jobs)
	if err != nil {
		slog.Error("cronjob: erro ao salvar vagas", "error", err)
		return fmt.Errorf("cronjob: save jobs: %w", err)
	}
	if err := executionError(scrapeCtx); err != nil {
		return err
	}

	// ✅ Constrói o índice invertido para buscas por keyword
	pipeline.IndexJobsInValkey(scrapeCtx, s.rdb, jobs, kws)

	s.mu.Lock()
	s.lastRunAt = time.Now()
	s.lastJobs = len(jobs)
	s.mu.Unlock()

	slog.Info("cronjob: execução concluída",
		"duration", time.Since(start).Round(time.Second),
		"scraped", len(jobs),
		"new_saved", saved,
		"skipped", len(jobs)-saved,
		"next_run", time.Now().Add(s.cfg.Interval).Format(time.Kitchen),
	)

	if s.OnComplete != nil {
		s.OnComplete(kws, len(jobs), saved, time.Since(start))
	}
	return nil
}

func (s *Scheduler) searchConfig(kws []string) pipeline.SearchConfig {
	return pipeline.SearchConfig{
		Keywords:       kws,
		SearchLocation: s.cfg.SearchLocation,
		JobTypes:       s.cfg.JobTypes,
		TimeFilter:     s.cfg.TimeFilter,
		RemoteOnly:     s.cfg.RemoteOnly,
		MaxConcurrency: s.cfg.MaxConcurrency,
	}
}

func executionError(ctx context.Context) error {
	if cause := context.Cause(ctx); cause != nil {
		return cause
	}
	return ctx.Err()
}

var (
	ErrAlreadyRunning  = runlock.ErrAlreadyHeld
	ErrLockUnavailable = runlock.ErrUnavailable
	ErrLockLost        = runlock.ErrLost
)
