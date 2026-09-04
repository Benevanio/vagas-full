package adapterutil

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWaitReturnsCancellationCauseWithoutWaitingForTimer(t *testing.T) {
	ctx, cancel := context.WithCancelCause(context.Background())
	cause := assert.AnError
	cancel(cause)
	started := time.Now()

	err := Wait(ctx, time.Minute)

	require.ErrorIs(t, err, cause)
	assert.Less(t, time.Since(started), 100*time.Millisecond)
}
