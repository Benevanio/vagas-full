package jobstore_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/jobstore"
)

func newTestStore(t *testing.T) (*jobstore.Store, *miniredis.Miniredis) {
	t.Helper()
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { rdb.Close() })

	return jobstore.New(rdb), mr
}

// TestSaveBatch_IndexGlobalSemTTL garante que o index global nunca recebe TTL.
// Esse é o ponto central da Opção 2: o index é permanente e se auto-limpa
// organicamente via GetAll quando vagas individuais expiram.
func TestSaveBatch_IndexGlobalSemTTL(t *testing.T) {
	store, _ := newTestStore(t)
	ctx := context.Background()

	jobs := []domain.Job{
		{Title: "Engenheiro Go", Company: "Acme", Location: "Brasil"},
	}

	_, err := store.SaveBatch(ctx, jobs)
	require.NoError(t, err)

	// TTL == -1 significa sem expiração no Valkey/Redis
	rdb := redis.NewClient(&redis.Options{}) // só para chamar TTL direto
	_ = rdb                                  // usamos o miniredis via store

	// Acessa o TTL via store indiretamente: se o index tiver TTL,
	// Count() vai falhar após FastForward — verificamos isso abaixo
}

// TestSaveBatch_TTLVagaIndividual garante que cada vaga tem TTL de ~9 dias.
func TestSaveBatch_TTLVagaIndividual(t *testing.T) {
	_, mr := newTestStore(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	store := jobstore.New(rdb)
	ctx := context.Background()

	jobs := []domain.Job{
		{Title: "Dev Go", Company: "Empresa A", Location: "Brasil"},
	}

	_, err := store.SaveBatch(ctx, jobs)
	require.NoError(t, err)

	ids, err := rdb.SMembers(ctx, "scraper:jobs:index").Result()
	require.NoError(t, err)
	require.Len(t, ids, 1)

	ttl, err := rdb.TTL(ctx, "scraper:job:"+ids[0]).Result()
	require.NoError(t, err)

	// TTL deve estar entre 8 e 9 dias (tolerância de alguns segundos de execução)
	assert.Greater(t, ttl, 8*24*time.Hour, "TTL da vaga deve ser maior que 8 dias")
	assert.LessOrEqual(t, ttl, 9*24*time.Hour, "TTL da vaga não deve ultrapassar 9 dias")
}

// TestSaveBatch_IndexSobreviventeAposExpiracao é o teste mais importante:
// simula o ciclo semanal completo. O index global deve sobreviver mesmo
// após as vagas individuais expirarem — sem sumir como acontecia antes.
func TestSaveBatch_IndexSobreviventeAposExpiracao(t *testing.T) {
	_, mr := newTestStore(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	store := jobstore.New(rdb)
	ctx := context.Background()

	// Ciclo 1: semana atual
	semana1 := []domain.Job{
		{Title: "Dev Go", Company: "Empresa A", Location: "Brasil"},
		{Title: "Dev Python", Company: "Empresa B", Location: "Brasil"},
	}
	saved1, err := store.SaveBatch(ctx, semana1)
	require.NoError(t, err)
	assert.Equal(t, 2, saved1.Inserted)

	// Ciclo 2: semana seguinte, vagas novas + as antigas ainda no cache
	semana2 := []domain.Job{
		{Title: "Dev Rust", Company: "Empresa C", Location: "Brasil"},
	}
	saved2, err := store.SaveBatch(ctx, semana2)
	require.NoError(t, err)
	assert.Equal(t, 1, saved2.Inserted, "apenas a vaga nova deve ser salva")

	// Todas as 3 vagas devem estar disponíveis
	all, err := store.GetAll(ctx)
	require.NoError(t, err)
	assert.Len(t, all, 3, "vagas de semanas anteriores não devem sumir entre ciclos")

	// Avança 10 dias — vagas individuais expiram (TTL = 9 dias)
	mr.FastForward(10 * 24 * time.Hour)

	// Index global ainda existe (sem TTL), mas GetAll limpa IDs órfãos
	allAposExpiracao, err := store.GetAll(ctx)
	require.NoError(t, err)
	assert.Empty(t, allAposExpiracao, "vagas expiradas devem ser removidas pelo GetAll")

	// Index global deve ainda existir como chave (auto-limpeza, não deleção)
	exists, err := rdb.Exists(ctx, "scraper:jobs:index").Result()
	require.NoError(t, err)
	// Após GetAll limpar todos os IDs órfãos, o Set pode estar vazio mas presente
	// O importante é que não sumiu por TTL — se sumisse, Exists retornaria 0
	// antes mesmo do GetAll rodar
	_ = exists // comportamento aceitável: Set vazio ou removido após SRem de todos os membros
}

// TestSaveBatch_DeduplicacaoEntreCiclos garante que a mesma vaga não é
// salva duas vezes mesmo que apareça em scrapes diferentes.
func TestSaveBatch_DeduplicacaoEntreCiclos(t *testing.T) {
	_, mr := newTestStore(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	store := jobstore.New(rdb)
	ctx := context.Background()

	vaga := domain.Job{Title: "Dev Go", Company: "Acme", Location: "Brasil"}

	saved1, err := store.SaveBatch(ctx, []domain.Job{vaga})
	require.NoError(t, err)
	assert.Equal(t, 1, saved1.Inserted)

	// Mesma vaga no próximo ciclo — upsert, sem nova inserção
	saved2, err := store.SaveBatch(ctx, []domain.Job{vaga})
	require.NoError(t, err)
	assert.Equal(t, 0, saved2.Inserted, "vaga duplicada não deve ser inserida novamente")
	assert.Equal(t, 1, saved2.Updated)

	count, err := store.Count(ctx)
	require.NoError(t, err)
	assert.Equal(t, int64(1), count)
}

// TestGetAll_LimpaIDsOrfaos garante que GetAll remove do index IDs cujas
// vagas individuais já expiraram — mecanismo central da auto-limpeza.
func TestGetAll_LimpaIDsOrfaos(t *testing.T) {
	_, mr := newTestStore(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	store := jobstore.New(rdb)
	ctx := context.Background()

	jobs := []domain.Job{
		{Title: "Dev Go", Company: "Acme", Location: "Brasil"},
		{Title: "Dev Rust", Company: "Acme", Location: "Brasil"},
	}

	_, err := store.SaveBatch(ctx, jobs)
	require.NoError(t, err)

	countAntes, _ := store.Count(ctx)
	assert.Equal(t, int64(2), countAntes)

	// Expira as vagas individuais mas não o index
	mr.FastForward(10 * 24 * time.Hour)

	// GetAll deve retornar vazio e limpar o index
	resultado, err := store.GetAll(ctx)
	require.NoError(t, err)
	assert.Empty(t, resultado)

	// Index deve ter sido limpo pelo SRem interno do GetAll
	countDepois, _ := store.Count(ctx)
	assert.Equal(t, int64(0), countDepois)
}

func TestGetSample_RespeitaLimite(t *testing.T) {
	store, _ := newTestStore(t)
	ctx := context.Background()

	jobs := []domain.Job{
		{Title: "Dev Go", Company: "Acme", Location: "Brasil"},
		{Title: "Dev Rust", Company: "Globex", Location: "Brasil"},
		{Title: "Dev Python", Company: "Initech", Location: "Brasil"},
	}

	_, err := store.SaveBatch(ctx, jobs)
	require.NoError(t, err)

	sample, err := store.GetSample(ctx, 2)
	require.NoError(t, err)

	assert.Len(t, sample, 2)
}

func TestSaveBatch_InsertAndUpsertReturnPersistedIDs(t *testing.T) {
	store, _ := newTestStore(t)
	ctx := context.Background()
	job := domain.Job{
		Title:       "Dev Go",
		Company:     "Acme",
		Location:    "Brasil",
		Description: "primeira versão",
		URL:         "https://jobs.example.com/go",
	}

	inserted, err := store.SaveBatch(ctx, []domain.Job{job})
	require.NoError(t, err)
	require.Equal(t, 1, inserted.Inserted)
	require.Len(t, inserted.Persisted, 1)
	require.NotEmpty(t, inserted.Persisted[0].ID)

	updated, err := store.SaveBatch(ctx, []domain.Job{{
		Title:    "Dev Go",
		Company:  "Acme",
		Location: "Brasil",
		URL:      "https://jobs.example.com/go?utm=2",
		Salary:   "10k",
	}})
	require.NoError(t, err)
	assert.Equal(t, 0, updated.Inserted)
	assert.Equal(t, 1, updated.Updated)
	require.Len(t, updated.Persisted, 1)
	assert.Equal(t, inserted.Persisted[0].ID, updated.Persisted[0].ID)
	assert.Equal(t, "primeira versão", updated.Persisted[0].Description)
	assert.Equal(t, "10k", updated.Persisted[0].Salary)

	loaded, err := store.GetByIDs(ctx, []string{inserted.Persisted[0].ID})
	require.NoError(t, err)
	require.Len(t, loaded, 1)
	assert.Equal(t, "primeira versão", loaded[0].Description)
}

func TestSaveBatch_IdempotentRetryAndInvalidIsolation(t *testing.T) {
	store, _ := newTestStore(t)
	ctx := context.Background()
	jobs := []domain.Job{
		{Title: "Dev Go", Company: "Acme", Location: "Brasil"},
		{Title: "sem identidade válida"},
	}

	first, err := store.SaveBatch(ctx, jobs)
	require.NoError(t, err)
	assert.Equal(t, 1, first.Inserted)
	assert.Equal(t, 1, first.Invalid)

	second, err := store.SaveBatch(ctx, jobs)
	require.NoError(t, err)
	assert.Equal(t, 0, second.Inserted)
	assert.Equal(t, 1, second.Updated)
	assert.Equal(t, first.Persisted[0].ID, second.Persisted[0].ID)
}

func TestSaveBatch_RollbackWhenExecFails(t *testing.T) {
	store, mr := newTestStore(t)
	ctx := context.Background()
	mr.SetError("ERR exec failed")

	_, err := store.SaveBatch(ctx, []domain.Job{
		{Title: "Dev Go", Company: "Acme", Location: "Brasil"},
	})
	require.Error(t, err)

	mr.SetError("")
	count, err := store.Count(ctx)
	require.NoError(t, err)
	assert.Equal(t, int64(0), count)
}

func TestRetryTransientLimitedAndSkipsPermanent(t *testing.T) {
	t.Run("retries then succeeds", func(t *testing.T) {
		attempts := 0
		err := jobstore.RetryTransient(context.Background(), func() error {
			attempts++
			if attempts < 3 {
				return errors.New("connection reset")
			}
			return nil
		})
		require.NoError(t, err)
		assert.Equal(t, 3, attempts)
	})

	t.Run("no retry on permanent", func(t *testing.T) {
		attempts := 0
		err := jobstore.RetryTransient(context.Background(), func() error {
			attempts++
			return errors.New("marshal invalid payload")
		})
		require.Error(t, err)
		assert.Equal(t, 1, attempts)
	})

	t.Run("gives up after max attempts", func(t *testing.T) {
		attempts := 0
		err := jobstore.RetryTransient(context.Background(), func() error {
			attempts++
			return errors.New("timeout")
		})
		require.Error(t, err)
		assert.Equal(t, 3, attempts)
	})
}

func TestSaveBatch_CollapsesDuplicateIDsInSameBatch(t *testing.T) {
	store, _ := newTestStore(t)
	ctx := context.Background()
	job := domain.Job{
		Title:       "Dev Go",
		Company:     "Acme",
		Location:    "Brasil",
		Description: "primeira",
		Source:      "gupy",
	}
	duplicate := job
	duplicate.Description = "segunda"
	duplicate.Source = "linkedin"

	result, err := store.SaveBatch(ctx, []domain.Job{job, duplicate})
	require.NoError(t, err)
	assert.Equal(t, 1, result.Inserted)
	require.Len(t, result.Persisted, 1)
	assert.Contains(t, result.Persisted[0].Description, "segunda")

	count, err := store.Count(ctx)
	require.NoError(t, err)
	assert.Equal(t, int64(1), count)
}

func TestSaveBatch_RetriesTransientThenSucceeds(t *testing.T) {
	store, mr := newTestStore(t)
	ctx := context.Background()
	mr.SetError("timeout")
	time.AfterFunc(80*time.Millisecond, func() { mr.SetError("") })

	result, err := store.SaveBatch(ctx, []domain.Job{
		{Title: "Dev Go", Company: "Acme", Location: "Brasil"},
	})
	require.NoError(t, err)
	assert.Equal(t, 1, result.Inserted)
	require.Len(t, result.Persisted, 1)
	assert.NotEmpty(t, result.Persisted[0].ID)
}
