package runlock

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

var (
	ErrAlreadyHeld = errors.New("scraper run lock already held")
	ErrUnavailable = errors.New("scraper run lock unavailable")
	ErrLost        = errors.New("scraper run lock lost")
)

type Config struct {
	TTL           time.Duration
	RenewInterval time.Duration
}

func (c Config) Validate() error {
	if c.TTL <= 0 {
		return errors.New("runlock: ttl must be greater than zero")
	}
	if c.RenewInterval <= 0 {
		return errors.New("runlock: renew interval must be greater than zero")
	}
	if c.RenewInterval >= c.TTL {
		return errors.New("runlock: renew interval must be shorter than ttl")
	}
	return nil
}

type State struct {
	RunID         string
	Source        string
	StartedAt     time.Time
	LockExpiresAt time.Time
}

type Manager struct {
	store Store
	cfg   Config
	now   func() time.Time
}

func New(store Store, cfg Config) (*Manager, error) {
	if store == nil {
		return nil, errors.New("runlock: store is required")
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &Manager{
		store: store,
		cfg:   cfg,
		now:   time.Now,
	}, nil
}

func (m *Manager) Acquire(ctx context.Context, source string) (*Lease, error) {
	token, err := newToken()
	if err != nil {
		return nil, fmt.Errorf("runlock: generate token: %w", err)
	}
	runID, err := newToken()
	if err != nil {
		return nil, fmt.Errorf("runlock: generate run id: %w", err)
	}

	acquired, err := m.store.TryAcquire(ctx, token, m.cfg.TTL)
	if err != nil {
		return nil, fmt.Errorf("%w: acquire: %v", ErrUnavailable, err)
	}
	if !acquired {
		return nil, ErrAlreadyHeld
	}

	startedAt := m.now().UTC()
	state := State{
		RunID:         runID,
		Source:        source,
		StartedAt:     startedAt,
		LockExpiresAt: startedAt.Add(m.cfg.TTL),
	}
	if written, stateErr := m.store.WriteState(ctx, token, state, m.cfg.TTL); stateErr != nil || !written {
		slog.Warn("scraper run state unavailable",
			"source", source,
			"run_id", runID,
			"error", stateErr,
		)
	}

	leaseCtx, cancel := context.WithCancelCause(ctx)
	lease := &Lease{
		manager:     m,
		token:       token,
		runID:       runID,
		source:      source,
		startedAt:   startedAt,
		ctx:         leaseCtx,
		cancel:      cancel,
		stopRenewal: make(chan struct{}),
		renewalDone: make(chan struct{}),
	}

	slog.Info("scraper run lock acquired",
		"source", source,
		"run_id", runID,
		"lock_expires_at", state.LockExpiresAt,
	)
	go lease.renew()
	return lease, nil
}

type Lease struct {
	manager   *Manager
	token     string
	runID     string
	source    string
	startedAt time.Time

	ctx    context.Context
	cancel context.CancelCauseFunc

	stopRenewal chan struct{}
	renewalDone chan struct{}
	stopOnce    sync.Once
	releaseOnce sync.Once
	releaseErr  error
}

func (l *Lease) Context() context.Context {
	return l.ctx
}

func (l *Lease) Token() string {
	return l.token
}

func (l *Lease) RunID() string {
	return l.runID
}

func (l *Lease) State() State {
	return State{
		RunID:         l.runID,
		Source:        l.source,
		StartedAt:     l.startedAt,
		LockExpiresAt: l.manager.now().UTC().Add(l.manager.cfg.TTL),
	}
}

func (l *Lease) Release(ctx context.Context) error {
	l.releaseOnce.Do(func() {
		l.cancel(nil)
		l.stopOnce.Do(func() {
			close(l.stopRenewal)
		})
		<-l.renewalDone

		released, err := l.manager.store.Release(ctx, l.token, l.runID)
		switch {
		case err != nil:
			l.releaseErr = fmt.Errorf("%w: release: %v", ErrUnavailable, err)
			slog.Error("scraper run lock release failed",
				"source", l.source,
				"run_id", l.runID,
				"error", err,
			)
		case released:
			slog.Info("scraper run lock released",
				"source", l.source,
				"run_id", l.runID,
			)
		default:
			l.releaseErr = fmt.Errorf("%w: ownership changed during release", ErrLost)
			slog.Warn("scraper run lock not released because ownership changed",
				"source", l.source,
				"run_id", l.runID,
			)
		}
	})
	return l.releaseErr
}

func (l *Lease) renew() {
	defer close(l.renewalDone)

	ticker := time.NewTicker(l.manager.cfg.RenewInterval)
	defer ticker.Stop()

	safetyTimer := time.NewTimer(l.manager.cfg.TTL - l.manager.cfg.RenewInterval)
	defer safetyTimer.Stop()

	for {
		select {
		case <-l.stopRenewal:
			return
		case <-l.ctx.Done():
			return
		case <-safetyTimer.C:
			cause := fmt.Errorf("%w: renewal could not be confirmed before safety deadline", ErrLost)
			slog.Error("scraper run lock lost",
				"source", l.source,
				"run_id", l.runID,
				"reason", "renewal_safety_deadline",
			)
			l.cancel(cause)
			return
		case <-ticker.C:
			state := l.State()
			renewCtx, cancelRenew := context.WithTimeout(l.ctx, l.renewTimeout())
			renewed, err := l.manager.store.Renew(
				renewCtx,
				l.token,
				state,
				l.manager.cfg.TTL,
			)
			cancelRenew()
			if err != nil {
				if l.ctx.Err() != nil {
					return
				}
				slog.Warn("scraper run lock renewal failed temporarily",
					"source", l.source,
					"run_id", l.runID,
					"error", err,
				)
				continue
			}
			if !renewed {
				cause := fmt.Errorf("%w: token no longer owns lock", ErrLost)
				slog.Error("scraper run lock lost",
					"source", l.source,
					"run_id", l.runID,
					"reason", "ownership_changed",
				)
				l.cancel(cause)
				return
			}

			resetTimer(safetyTimer, l.manager.cfg.TTL-l.manager.cfg.RenewInterval)
		}
	}
}

func (l *Lease) renewTimeout() time.Duration {
	safetyMargin := l.manager.cfg.TTL - l.manager.cfg.RenewInterval
	if safetyMargin < l.manager.cfg.RenewInterval {
		return safetyMargin
	}
	return l.manager.cfg.RenewInterval
}

func resetTimer(timer *time.Timer, duration time.Duration) {
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	timer.Reset(duration)
}

func newToken() (string, error) {
	var value [32]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(value[:]), nil
}
