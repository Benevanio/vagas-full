package pipeline

import (
	"context"
	"fmt"
	"sync"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
)

type concurrencyBudget struct {
	global               chan struct{}
	globalLimit          int
	defaultProviderLimit int
	overrides            map[ports.ProviderID]int

	providersMu sync.Mutex
	providers   map[ports.ProviderID]chan struct{}
}

func newConcurrencyBudget(
	globalLimit int,
	defaultProviderLimit int,
	overrides map[ports.ProviderID]int,
) (*concurrencyBudget, error) {
	if globalLimit <= 0 {
		return nil, fmt.Errorf("pipeline: global concurrency must be greater than zero")
	}
	if defaultProviderLimit <= 0 {
		return nil, fmt.Errorf("pipeline: provider concurrency must be greater than zero")
	}

	overrideCopy := make(map[ports.ProviderID]int, len(overrides))
	for provider, limit := range overrides {
		if limit <= 0 {
			return nil, fmt.Errorf("pipeline: concurrency for provider %s must be greater than zero", provider)
		}
		overrideCopy[provider] = limit
	}

	return &concurrencyBudget{
		global:               make(chan struct{}, globalLimit),
		globalLimit:          globalLimit,
		defaultProviderLimit: defaultProviderLimit,
		overrides:            overrideCopy,
		providers:            make(map[ports.ProviderID]chan struct{}),
	}, nil
}

func (b *concurrencyBudget) acquire(
	ctx context.Context,
	provider ports.ProviderID,
) (*concurrencyPermit, error) {
	if cause := context.Cause(ctx); cause != nil {
		return nil, cause
	}

	providerSemaphore := b.providerSemaphore(provider)
	select {
	case providerSemaphore <- struct{}{}:
	case <-ctx.Done():
		return nil, context.Cause(ctx)
	}
	if cause := context.Cause(ctx); cause != nil {
		<-providerSemaphore
		return nil, cause
	}

	select {
	case b.global <- struct{}{}:
		permit := &concurrencyPermit{
			budget:            b,
			providerSemaphore: providerSemaphore,
		}
		if cause := context.Cause(ctx); cause != nil {
			permit.release()
			return nil, cause
		}
		return permit, nil
	case <-ctx.Done():
		<-providerSemaphore
		return nil, context.Cause(ctx)
	}
}

func (b *concurrencyBudget) providerSemaphore(provider ports.ProviderID) chan struct{} {
	b.providersMu.Lock()
	defer b.providersMu.Unlock()

	semaphore, ok := b.providers[provider]
	if ok {
		return semaphore
	}
	semaphore = make(chan struct{}, b.providerLimit(provider))
	b.providers[provider] = semaphore
	return semaphore
}

func (b *concurrencyBudget) providerLimit(provider ports.ProviderID) int {
	limit := b.defaultProviderLimit
	if override, ok := b.overrides[provider]; ok {
		limit = override
	}
	if limit > b.globalLimit {
		return b.globalLimit
	}
	return limit
}

func (b *concurrencyBudget) providerInUse(provider ports.ProviderID) int {
	return len(b.providerSemaphore(provider))
}

type concurrencyPermit struct {
	once              sync.Once
	budget            *concurrencyBudget
	providerSemaphore chan struct{}
}

func (p *concurrencyPermit) release() {
	if p == nil {
		return
	}
	p.once.Do(func() {
		<-p.budget.global
		<-p.providerSemaphore
	})
}
