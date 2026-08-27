package pipeline

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConcurrencyBudgetEnforcesGlobalAndProviderPeaks(t *testing.T) {
	budget, err := newConcurrencyBudget(3, 2, map[ports.ProviderID]int{
		ports.ProviderGupy: 1,
	})
	require.NoError(t, err)

	var globalActive atomic.Int32
	var globalPeak atomic.Int32
	providerActive := map[ports.ProviderID]*atomic.Int32{
		ports.ProviderGupy:   {},
		ports.ProviderAdzuna: {},
	}
	providerPeak := map[ports.ProviderID]*atomic.Int32{
		ports.ProviderGupy:   {},
		ports.ProviderAdzuna: {},
	}
	release := make(chan struct{})
	started := make(chan struct{}, 5)
	var wg sync.WaitGroup

	for _, provider := range []ports.ProviderID{
		ports.ProviderGupy,
		ports.ProviderGupy,
		ports.ProviderAdzuna,
		ports.ProviderAdzuna,
		ports.ProviderAdzuna,
	} {
		wg.Add(1)
		go func(provider ports.ProviderID) {
			defer wg.Done()
			permit, acquireErr := budget.acquire(context.Background(), provider)
			require.NoError(t, acquireErr)
			defer permit.release()

			currentGlobal := globalActive.Add(1)
			updatePeak(&globalPeak, currentGlobal)
			currentProvider := providerActive[provider].Add(1)
			updatePeak(providerPeak[provider], currentProvider)
			started <- struct{}{}
			<-release
			providerActive[provider].Add(-1)
			globalActive.Add(-1)
		}(provider)
	}

	for range 3 {
		select {
		case <-started:
		case <-time.After(time.Second):
			t.Fatal("expected the global budget to start three tasks")
		}
	}
	select {
	case <-started:
		t.Fatal("a fourth task exceeded the global budget")
	case <-time.After(50 * time.Millisecond):
	}

	close(release)
	wg.Wait()

	assert.Equal(t, int32(3), globalPeak.Load())
	assert.Equal(t, int32(1), providerPeak[ports.ProviderGupy].Load())
	assert.Equal(t, int32(2), providerPeak[ports.ProviderAdzuna].Load())
}

func TestConcurrencyBudgetCancelsWhileWaitingForProvider(t *testing.T) {
	budget, err := newConcurrencyBudget(2, 1, nil)
	require.NoError(t, err)
	first, err := budget.acquire(context.Background(), ports.ProviderGupy)
	require.NoError(t, err)
	defer first.release()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	permit, err := budget.acquire(ctx, ports.ProviderGupy)

	require.ErrorIs(t, err, context.Canceled)
	assert.Nil(t, permit)
}

func TestConcurrencyBudgetDoesNotAcquireAfterCancellation(t *testing.T) {
	budget, err := newConcurrencyBudget(1, 1, nil)
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	permit, err := budget.acquire(ctx, ports.ProviderGupy)

	require.ErrorIs(t, err, context.Canceled)
	assert.Nil(t, permit)
	assert.Equal(t, 0, budget.providerInUse(ports.ProviderGupy))
	assert.Empty(t, budget.global)
}

func TestConcurrencyBudgetCancelsGlobalWaitAndReleasesProviderPermit(t *testing.T) {
	budget, err := newConcurrencyBudget(1, 1, nil)
	require.NoError(t, err)
	globalHolder, err := budget.acquire(context.Background(), ports.ProviderAdzuna)
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	waitDone := make(chan error, 1)
	go func() {
		_, acquireErr := budget.acquire(ctx, ports.ProviderGupy)
		waitDone <- acquireErr
	}()

	require.Eventually(t, func() bool {
		return budget.providerInUse(ports.ProviderGupy) == 1
	}, time.Second, time.Millisecond)
	cancel()
	require.ErrorIs(t, <-waitDone, context.Canceled)
	assert.Equal(t, 0, budget.providerInUse(ports.ProviderGupy))

	globalHolder.release()
	permit, err := budget.acquire(context.Background(), ports.ProviderGupy)
	require.NoError(t, err)
	permit.release()
}

func TestConcurrencyPermitReleaseIsIdempotent(t *testing.T) {
	budget, err := newConcurrencyBudget(1, 1, nil)
	require.NoError(t, err)
	permit, err := budget.acquire(context.Background(), ports.ProviderLever)
	require.NoError(t, err)

	permit.release()
	permit.release()

	next, err := budget.acquire(context.Background(), ports.ProviderLever)
	require.NoError(t, err)
	next.release()
}

func TestConcurrencyBudgetReleasesAfterSuccessErrorAndCancellation(t *testing.T) {
	budget, err := newConcurrencyBudget(1, 1, nil)
	require.NoError(t, err)

	success, err := budget.acquire(context.Background(), ports.ProviderGupy)
	require.NoError(t, err)
	success.release()
	assert.Equal(t, 0, budget.providerInUse(ports.ProviderGupy))
	assert.Empty(t, budget.global)

	failed, err := budget.acquire(context.Background(), ports.ProviderGupy)
	require.NoError(t, err)
	failed.release()
	assert.Equal(t, 0, budget.providerInUse(ports.ProviderGupy))
	assert.Empty(t, budget.global)

	ctx, cancel := context.WithCancel(context.Background())
	held, err := budget.acquire(ctx, ports.ProviderGupy)
	require.NoError(t, err)
	cancel()
	held.release()
	assert.Equal(t, 0, budget.providerInUse(ports.ProviderGupy))
	assert.Empty(t, budget.global)
}

func TestConcurrencyBudgetUsesGlobalAsEffectiveProviderMaximum(t *testing.T) {
	budget, err := newConcurrencyBudget(2, 4, map[ports.ProviderID]int{
		ports.ProviderLinkedIn: 3,
	})
	require.NoError(t, err)

	assert.Equal(t, 2, budget.providerLimit(ports.ProviderLinkedIn))
	assert.Equal(t, 2, budget.providerLimit(ports.ProviderGupy))
}

func updatePeak(peak *atomic.Int32, current int32) {
	for {
		previous := peak.Load()
		if current <= previous || peak.CompareAndSwap(previous, current) {
			return
		}
	}
}
