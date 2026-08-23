package runlock

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfigValidation(t *testing.T) {
	require.NoError(t, (Config{TTL: 2 * time.Second, RenewInterval: time.Second}).Validate())

	invalid := []Config{
		{TTL: 0, RenewInterval: time.Second},
		{TTL: time.Second, RenewInterval: 0},
		{TTL: time.Second, RenewInterval: time.Second},
		{TTL: time.Second, RenewInterval: 2 * time.Second},
	}
	for _, cfg := range invalid {
		require.Error(t, cfg.Validate())
	}
}

func TestAcquireCommandUsesAtomicSetNXPX(t *testing.T) {
	assert.Equal(t, []any{
		"SET",
		LockKey,
		"owner-token",
		"NX",
		"PX",
		int64(120000),
	}, acquireCommand("owner-token", 120*time.Second))
}

func TestAcquireRejectsExistingLockAndCreatesOperationalState(t *testing.T) {
	manager, client, _ := newTestManager(t, 2*time.Second, 500*time.Millisecond)
	ctx := context.Background()

	lease, err := manager.Acquire(ctx, "cron")
	require.NoError(t, err)
	t.Cleanup(func() { _ = lease.Release(context.Background()) })

	assert.Equal(t, lease.Token(), client.Get(ctx, LockKey).Val())
	assert.Greater(t, client.PTTL(ctx, LockKey).Val(), time.Duration(0))

	state, err := client.HGetAll(ctx, StateKey).Result()
	require.NoError(t, err)
	assert.Equal(t, lease.RunID(), state["runId"])
	assert.NotEqual(t, lease.Token(), state["runId"])
	assert.Equal(t, "cron", state["source"])
	assert.NotEmpty(t, state["startedAt"])
	assert.NotEmpty(t, state["lockExpiresAt"])

	_, err = manager.Acquire(ctx, "admin_manual")
	require.ErrorIs(t, err, ErrAlreadyHeld)
}

func TestTokensAreUniqueAcrossExecutions(t *testing.T) {
	manager, _, _ := newTestManager(t, 2*time.Second, 500*time.Millisecond)

	first, err := manager.Acquire(context.Background(), "cron")
	require.NoError(t, err)
	firstToken := first.Token()
	firstRunID := first.RunID()
	require.NoError(t, first.Release(context.Background()))

	second, err := manager.Acquire(context.Background(), "cron")
	require.NoError(t, err)
	defer second.Release(context.Background())

	assert.NotEqual(t, firstToken, second.Token())
	assert.NotEqual(t, firstRunID, second.RunID())
}

func TestOnlyOwnerCanRenewOrRelease(t *testing.T) {
	manager, client, server := newTestManager(t, 2*time.Second, 500*time.Millisecond)
	ctx := context.Background()

	lease, err := manager.Acquire(ctx, "cron")
	require.NoError(t, err)

	wrongState := lease.State()
	wrongState.RunID = "different-run"
	renewed, err := manager.store.Renew(ctx, "different-token", wrongState, 2*time.Second)
	require.NoError(t, err)
	assert.False(t, renewed)

	released, err := manager.store.Release(ctx, "different-token", "different-run")
	require.NoError(t, err)
	assert.False(t, released)
	assert.Equal(t, lease.Token(), client.Get(ctx, LockKey).Val())

	server.FastForward(time.Second)
	renewed, err = manager.store.Renew(ctx, lease.Token(), lease.State(), 2*time.Second)
	require.NoError(t, err)
	assert.True(t, renewed)
	assert.Greater(t, client.PTTL(ctx, LockKey).Val(), 1500*time.Millisecond)
	assert.Greater(t, client.PTTL(ctx, StateKey).Val(), 1500*time.Millisecond)

	require.NoError(t, lease.Release(ctx))
	assert.Equal(t, redis.Nil, client.Get(ctx, LockKey).Err())
	assert.Empty(t, client.HGetAll(ctx, StateKey).Val())
}

func TestOldExecutionCannotRemoveNewLock(t *testing.T) {
	manager, client, _ := newTestManager(t, 2*time.Second, 500*time.Millisecond)
	ctx := context.Background()

	oldLease, err := manager.Acquire(ctx, "cron")
	require.NoError(t, err)

	require.NoError(t, client.Set(ctx, LockKey, "new-owner", 2*time.Second).Err())
	require.NoError(t, client.HSet(ctx, StateKey, "runId", "new-run").Err())

	require.ErrorIs(t, oldLease.Release(ctx), ErrLost)
	assert.Equal(t, "new-owner", client.Get(ctx, LockKey).Val())
	assert.Equal(t, "new-run", client.HGet(ctx, StateKey, "runId").Val())
}

func TestLockExpiresAfterOwnerCrashes(t *testing.T) {
	manager, client, server := newTestManager(t, 2*time.Second, 500*time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())

	lease, err := manager.Acquire(ctx, "cron")
	require.NoError(t, err)
	cancel()

	select {
	case <-lease.renewalDone:
	case <-time.After(time.Second):
		t.Fatal("renewal routine did not stop after context cancellation")
	}

	server.FastForward(3 * time.Second)
	assert.Equal(t, redis.Nil, client.Get(context.Background(), LockKey).Err())
	assert.Empty(t, client.HGetAll(context.Background(), StateKey).Val())
}

func TestAcquireFailsClosedWhenValkeyIsUnavailable(t *testing.T) {
	manager, _, server := newTestManager(t, 2*time.Second, 500*time.Millisecond)
	server.Close()

	_, err := manager.Acquire(context.Background(), "cron")

	require.ErrorIs(t, err, ErrUnavailable)
}

func TestReleaseStopsRenewalRoutine(t *testing.T) {
	manager, _, _ := newTestManager(t, 2*time.Second, 500*time.Millisecond)
	lease, err := manager.Acquire(context.Background(), "cron")
	require.NoError(t, err)

	require.NoError(t, lease.Release(context.Background()))

	select {
	case <-lease.renewalDone:
	case <-time.After(time.Second):
		t.Fatal("renewal routine was left running")
	}
}

func TestConfirmedOwnershipLossCancelsLease(t *testing.T) {
	manager, client, _ := newTestManager(t, 200*time.Millisecond, 25*time.Millisecond)
	lease, err := manager.Acquire(context.Background(), "cron")
	require.NoError(t, err)

	require.NoError(t, client.Set(context.Background(), LockKey, "new-owner", time.Second).Err())

	select {
	case <-lease.Context().Done():
	case <-time.After(time.Second):
		t.Fatal("lease context was not canceled after ownership loss")
	}
	require.ErrorIs(t, context.Cause(lease.Context()), ErrLost)

	require.ErrorIs(t, lease.Release(context.Background()), ErrLost)
	assert.Equal(t, "new-owner", client.Get(context.Background(), LockKey).Val())
}

func TestTemporaryRenewalFailureDoesNotCancelLease(t *testing.T) {
	var renewCalls atomic.Int32
	store := &fakeStore{
		renew: func(context.Context, State, time.Duration) (bool, error) {
			if renewCalls.Add(1) == 1 {
				return false, errors.New("temporary network error")
			}
			return true, nil
		},
	}
	manager, err := New(store, Config{
		TTL:           200 * time.Millisecond,
		RenewInterval: 50 * time.Millisecond,
	})
	require.NoError(t, err)

	lease, err := manager.Acquire(context.Background(), "cron")
	require.NoError(t, err)
	time.Sleep(125 * time.Millisecond)

	assert.NoError(t, context.Cause(lease.Context()))
	assert.GreaterOrEqual(t, renewCalls.Load(), int32(2))
	require.NoError(t, lease.Release(context.Background()))
}

func TestContinuousRenewalFailureCancelsBeforeTTL(t *testing.T) {
	store := &fakeStore{
		renew: func(context.Context, State, time.Duration) (bool, error) {
			return false, errors.New("valkey unavailable")
		},
	}
	manager, err := New(store, Config{
		TTL:           200 * time.Millisecond,
		RenewInterval: 50 * time.Millisecond,
	})
	require.NoError(t, err)

	lease, err := manager.Acquire(context.Background(), "cron")
	require.NoError(t, err)

	select {
	case <-lease.Context().Done():
	case <-time.After(190 * time.Millisecond):
		t.Fatal("lease was not canceled before ttl")
	}
	require.ErrorIs(t, context.Cause(lease.Context()), ErrLost)
	require.NoError(t, lease.Release(context.Background()))
}

func TestReleaseReturnsStoreFailure(t *testing.T) {
	store := &fakeStore{releaseErr: errors.New("connection reset")}
	manager, err := New(store, Config{
		TTL:           time.Second,
		RenewInterval: 250 * time.Millisecond,
	})
	require.NoError(t, err)
	lease, err := manager.Acquire(context.Background(), "cron")
	require.NoError(t, err)

	err = lease.Release(context.Background())

	require.ErrorIs(t, err, ErrUnavailable)
	require.ErrorContains(t, err, "connection reset")
}

func TestReleaseReportsOwnershipChangeAsLockLost(t *testing.T) {
	manager, client, _ := newTestManager(t, 2*time.Second, 500*time.Millisecond)
	lease, err := manager.Acquire(context.Background(), "cron")
	require.NoError(t, err)
	require.NoError(t, client.Set(context.Background(), LockKey, "new-owner", time.Second).Err())

	err = lease.Release(context.Background())

	require.ErrorIs(t, err, ErrLost)
	assert.Equal(t, "new-owner", client.Get(context.Background(), LockKey).Val())
}

func TestReleaseCancelsInFlightRenewalBeforeWaiting(t *testing.T) {
	renewalStarted := make(chan struct{})
	store := &fakeStore{
		renew: func(ctx context.Context, _ State, _ time.Duration) (bool, error) {
			close(renewalStarted)
			<-ctx.Done()
			return false, context.Cause(ctx)
		},
	}
	manager, err := New(store, Config{
		TTL:           time.Second,
		RenewInterval: 20 * time.Millisecond,
	})
	require.NoError(t, err)
	lease, err := manager.Acquire(context.Background(), "cron")
	require.NoError(t, err)

	select {
	case <-renewalStarted:
	case <-time.After(time.Second):
		t.Fatal("renewal did not start")
	}

	released := make(chan error, 1)
	go func() {
		released <- lease.Release(context.Background())
	}()

	select {
	case err := <-released:
		require.NoError(t, err)
	case <-time.After(200 * time.Millisecond):
		t.Fatal("release waited indefinitely for in-flight renewal")
	}
}

func newTestManager(
	t *testing.T,
	ttl time.Duration,
	renewInterval time.Duration,
) (*Manager, *redis.Client, *miniredis.Miniredis) {
	t.Helper()

	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		_ = client.Close()
	})

	manager, err := New(NewValkeyStore(client), Config{
		TTL:           ttl,
		RenewInterval: renewInterval,
	})
	require.NoError(t, err)
	return manager, client, server
}

type fakeStore struct {
	renew      func(context.Context, State, time.Duration) (bool, error)
	releaseErr error
}

func (s *fakeStore) TryAcquire(context.Context, string, time.Duration) (bool, error) {
	return true, nil
}

func (s *fakeStore) WriteState(context.Context, string, State, time.Duration) (bool, error) {
	return true, nil
}

func (s *fakeStore) Renew(ctx context.Context, _ string, state State, ttl time.Duration) (bool, error) {
	if s.renew == nil {
		return true, nil
	}
	return s.renew(ctx, state, ttl)
}

func (s *fakeStore) Release(context.Context, string, string) (bool, error) {
	if s.releaseErr != nil {
		return false, fmt.Errorf("fake release: %w", s.releaseErr)
	}
	return true, nil
}
