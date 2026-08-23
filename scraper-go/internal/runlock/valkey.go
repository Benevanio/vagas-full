package runlock

import (
	"context"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	LockKey  = "scraper:run:lock"
	StateKey = "scraper:run:state"
)

var writeStateScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[2])
redis.call("HSET", KEYS[2],
  "runId", ARGV[2],
  "source", ARGV[3],
  "startedAt", ARGV[4],
  "lockExpiresAt", ARGV[5])
redis.call("PEXPIRE", KEYS[2], ARGV[6])
return 1
`)

var renewScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("PEXPIRE", KEYS[1], ARGV[6])
if redis.call("HGET", KEYS[2], "runId") ~= ARGV[2] then
  redis.call("DEL", KEYS[2])
end
redis.call("HSET", KEYS[2],
  "runId", ARGV[2],
  "source", ARGV[3],
  "startedAt", ARGV[4],
  "lockExpiresAt", ARGV[5])
redis.call("PEXPIRE", KEYS[2], ARGV[6])
return 1
`)

var releaseScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
if redis.call("HGET", KEYS[2], "runId") == ARGV[2] then
  redis.call("DEL", KEYS[2])
end
return 1
`)

type Store interface {
	TryAcquire(ctx context.Context, token string, ttl time.Duration) (bool, error)
	WriteState(ctx context.Context, token string, state State, ttl time.Duration) (bool, error)
	Renew(ctx context.Context, token string, state State, ttl time.Duration) (bool, error)
	Release(ctx context.Context, token, runID string) (bool, error)
}

type ValkeyStore struct {
	client *redis.Client
}

func NewValkeyStore(client *redis.Client) *ValkeyStore {
	return &ValkeyStore{client: client}
}

func (s *ValkeyStore) TryAcquire(ctx context.Context, token string, ttl time.Duration) (bool, error) {
	result, err := s.client.Do(ctx, acquireCommand(token, ttl)...).Text()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return result == "OK", nil
}

func acquireCommand(token string, ttl time.Duration) []any {
	return []any{"SET", LockKey, token, "NX", "PX", ttl.Milliseconds()}
}

func (s *ValkeyStore) WriteState(
	ctx context.Context,
	token string,
	state State,
	ttl time.Duration,
) (bool, error) {
	result, err := writeStateScript.Run(
		ctx,
		s.client,
		[]string{LockKey, StateKey},
		token,
		state.RunID,
		state.Source,
		state.StartedAt.UTC().Format(time.RFC3339Nano),
		state.LockExpiresAt.UTC().Format(time.RFC3339Nano),
		strconv.FormatInt(ttl.Milliseconds(), 10),
	).Int64()
	return result == 1, err
}

func (s *ValkeyStore) Renew(
	ctx context.Context,
	token string,
	state State,
	ttl time.Duration,
) (bool, error) {
	result, err := renewScript.Run(
		ctx,
		s.client,
		[]string{LockKey, StateKey},
		token,
		state.RunID,
		state.Source,
		state.StartedAt.UTC().Format(time.RFC3339Nano),
		state.LockExpiresAt.UTC().Format(time.RFC3339Nano),
		strconv.FormatInt(ttl.Milliseconds(), 10),
	).Int64()
	return result == 1, err
}

func (s *ValkeyStore) Release(ctx context.Context, token, runID string) (bool, error) {
	result, err := releaseScript.Run(
		ctx,
		s.client,
		[]string{LockKey, StateKey},
		token,
		runID,
	).Int64()
	return result == 1, err
}
