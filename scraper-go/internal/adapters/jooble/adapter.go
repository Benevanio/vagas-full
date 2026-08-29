package jooble

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/adapterutil"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/redis/go-redis/v9"
)

const (
	joobleQuotaKey               = "jooble:quota:daily"     // contador no Valkey
	joobleQuotaLimit             = 300                      // chamadas máximas por dia
	joobleSlotSize               = 37                       // keywords por execução
	joobleRotationKey            = "jooble:rotation:offset" // offset rotativo no Valkey
	joobleDefaultPagesPerKeyword = 3
	joobleDefaultResultsPerPage  = 20
	joobleMaxResultsPerPage      = 50
)

type JoobleAdapter struct {
	apiKey string
	client *http.Client
	rdb    *redis.Client
	mu     sync.Mutex
}

func NewJooble(apiKey string, rdb *redis.Client) *JoobleAdapter {
	return &JoobleAdapter{
		apiKey: apiKey,
		client: &http.Client{Timeout: 15 * time.Second},
		rdb:    rdb,
	}
}

func (a *JoobleAdapter) SourceName() string { return "Jooble" }

func (a *JoobleAdapter) Capabilities() ports.SourceCapabilities {
	return ports.SourceCapabilities{
		Provider: ports.ProviderJooble,
		Mode:     ports.DiscoveryBatch,
	}
}

// quotaRemaining retorna quantas chamadas ainda cabem hoje.
// Se Valkey estiver indisponível, segue com o limite local para não zerar o adapter silenciosamente.
func (a *JoobleAdapter) quotaRemaining(ctx context.Context) int {
	if a.rdb == nil {
		slog.Warn("jooble: Valkey indisponível, seguindo sem contador distribuído de cota")
		return joobleQuotaLimit
	}

	used, err := a.rdb.Get(ctx, joobleQuotaKey).Int()
	if err == redis.Nil {
		return joobleQuotaLimit // chave não existe ainda → dia novo
	}
	if err != nil {
		slog.Warn("jooble: falha ao ler cota no Valkey, seguindo sem bloquear adapter", "error", err)
		return joobleQuotaLimit
	}
	remaining := joobleQuotaLimit - used
	if remaining < 0 {
		return 0
	}
	return remaining
}

// incrementQuota registra 1 chamada usada.
// Na primeira chamada do dia, define TTL até meia-noite.
func (a *JoobleAdapter) incrementQuota(ctx context.Context) {
	if a.rdb == nil {
		return
	}

	pipe := a.rdb.Pipeline()
	pipe.Incr(ctx, joobleQuotaKey)

	// TTL dinâmico: segundos restantes até meia-noite
	now := time.Now()
	midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
	ttl := time.Until(midnight)
	pipe.Expire(ctx, joobleQuotaKey, ttl)

	pipe.Exec(ctx) //nolint:errcheck — falha aqui não deve parar o scraper
}

// nextSlot retorna o subconjunto rotacionado de keywords para essa execução.
func (a *JoobleAdapter) nextSlot(ctx context.Context, keywords []string, slotSize int) []string {
	if len(keywords) == 0 {
		return nil
	}
	if a.rdb == nil {
		if slotSize > len(keywords) {
			slotSize = len(keywords)
		}
		return append([]string(nil), keywords[:slotSize]...)
	}

	// Lê offset atual; se não existir começa do 0
	offset, err := a.rdb.Get(ctx, joobleRotationKey).Int()
	if err != nil {
		offset = 0
	}

	// Salva próximo offset para a execução seguinte
	nextOffset := (offset + slotSize) % len(keywords)
	a.rdb.Set(ctx, joobleRotationKey, nextOffset, 0) //nolint:errcheck

	// Monta o slice rotacionado (wrap-around circular)
	result := make([]string, 0, slotSize)
	for i := 0; i < slotSize && i < len(keywords); i++ {
		result = append(result, keywords[(offset+i)%len(keywords)])
	}
	return result
}

// SearchBatch é o ponto de entrada — recebe todas as keywords mas roda
// apenas o slot rotacionado, respeitando a cota diária.
// Retorna os jobs encontrados e para silenciosamente se a cota acabar.
func (a *JoobleAdapter) SearchBatch(ctx context.Context, allKeywords []string, req domain.ScrapeRequest) ([]domain.Job, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	remaining := a.quotaRemaining(ctx)
	if remaining <= 0 {
		slog.Warn("jooble: cota diária esgotada, adapter não fará novas chamadas", "limit", joobleQuotaLimit)
		return nil, nil // cota esgotada → para silenciosamente
	}

	slotSize := joobleSlotSize
	if slotSize > remaining {
		slotSize = remaining // não ultrapassa o que sobrou
	}

	slot := a.nextSlot(ctx, allKeywords, slotSize)
	if len(slot) == 0 {
		return nil, nil
	}

	var allJobs []domain.Job
	for _, keyword := range slot {
		jobs, err := a.search(ctx, keyword, req)
		if err != nil {
			if len(allJobs) == 0 {
				return nil, err
			}
			slog.Warn("jooble: busca interrompida após resultados parciais", "keyword", keyword, "error", err)
			break
		}
		allJobs = append(allJobs, jobs...)
	}

	return allJobs, nil
}

// search faz 1 chamada para 1 keyword (lógica original preservada).
func (a *JoobleAdapter) search(ctx context.Context, keyword string, req domain.ScrapeRequest) ([]domain.Job, error) {
	maxPages := req.MaxPagesPerKeyword
	if maxPages <= 0 {
		maxPages = joobleDefaultPagesPerKeyword
	}

	resultsPerPage := req.ResultsPerPage
	if resultsPerPage <= 0 {
		resultsPerPage = joobleDefaultResultsPerPage
	}
	if resultsPerPage > joobleMaxResultsPerPage {
		resultsPerPage = joobleMaxResultsPerPage
	}

	pageTimeout := time.Duration(req.PageTimeoutMs) * time.Millisecond
	if pageTimeout <= 0 {
		pageTimeout = 15 * time.Second
	}

	var allJobs []domain.Job
	seenPages := make(map[string]struct{})

	for page := 1; page <= maxPages; page++ {
		pageCtx, cancel := context.WithTimeout(ctx, pageTimeout)
		jobs, total, err := a.fetchPage(pageCtx, keyword, req, page, resultsPerPage)
		cancel()

		if err != nil {
			if len(allJobs) > 0 {
				slog.Warn("jooble: página falhou após resultados parciais", "keyword", keyword, "page", page, "error", err)
				break
			}
			return nil, err
		}

		a.incrementQuota(ctx)

		if len(jobs) == 0 {
			break
		}
		if adapterutil.RepeatedJobPage(seenPages, jobs) {
			break
		}

		allJobs = append(allJobs, jobs...)

		if total > 0 && len(allJobs) >= total {
			break
		}
		if len(jobs) < resultsPerPage {
			break
		}
	}

	return allJobs, nil
}

func (a *JoobleAdapter) fetchPage(
	ctx context.Context,
	keyword string,
	req domain.ScrapeRequest,
	page int,
	resultsPerPage int,
) ([]domain.Job, int, error) {
	endpoint := strings.TrimRight(os.Getenv("JOOBLE_API_BASE"), "/")
	if endpoint == "" {
		endpoint = "https://br.jooble.org/api"
	}
	endpoint = endpoint + "/" + a.apiKey

	location := strings.TrimSpace(req.SearchLocation)
	if location == "" {
		location = "Brasil"
	}

	payload := map[string]any{
		"keywords":      keyword,
		"location":      location,
		"page":          strconv.Itoa(page),
		"ResultOnPage":  resultsPerPage,
		"SearchMode":    0,
		"companysearch": "false",
	}
	if location != "" {
		payload["radius"] = "80"
	}

	body, _ := json.Marshal(payload)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewBuffer(body))
	if err != nil {
		return nil, 0, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("User-Agent", "JobsScraper/1.0")

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, 0, fmt.Errorf("jooble: 429")
	}
	if resp.StatusCode == http.StatusForbidden {
		return nil, 0, fmt.Errorf("jooble: 403 acesso negado, verifique JOOBLE_API_KEY")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("jooble: status %d", resp.StatusCode)
	}

	var joobleRes joobleSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&joobleRes); err != nil {
		return nil, 0, err
	}

	rawJobs := joobleRes.Jobs
	if len(rawJobs) == 0 {
		rawJobs = joobleRes.Results
	}

	jobs := make([]domain.Job, 0, len(rawJobs))
	for _, j := range rawJobs {
		id := strings.TrimSpace(strconv.FormatInt(j.ID, 10))
		if j.ID == 0 {
			id = strings.TrimSpace(j.Link)
		}
		if id == "" {
			id = strings.Join([]string{
				strings.TrimSpace(j.Title),
				strings.TrimSpace(j.Company),
				strings.TrimSpace(j.Location),
			}, "|")
		}

		jobs = append(jobs, domain.Job{
			ID:          id,
			Title:       strings.TrimSpace(j.Title),
			Company:     strings.TrimSpace(j.Company),
			Location:    strings.TrimSpace(j.Location),
			URL:         strings.TrimSpace(j.Link),
			Salary:      strings.TrimSpace(j.Salary),
			Modality:    strings.TrimSpace(j.Type),
			Description: strings.TrimSpace(j.Snippet),
			PostedAt:    strings.TrimSpace(j.Updated),
			Source:      "Jooble",
			Sources:     []string{"Jooble"},
			Keyword:     keyword,
			Keywords:    []string{keyword},
		})
	}

	return jobs, joobleRes.TotalCount, nil
}

func (a *JoobleAdapter) Search(ctx context.Context, keyword string, req domain.ScrapeRequest) ([]domain.Job, error) {
	return a.SearchBatch(ctx, []string{keyword}, req)
}

type joobleSearchResponse struct {
	TotalCount int         `json:"totalCount"`
	Jobs       []joobleJob `json:"jobs"`
	Results    []joobleJob `json:"results"`
}

type joobleJob struct {
	Title    string `json:"title"`
	Location string `json:"location"`
	Snippet  string `json:"snippet"`
	Source   string `json:"source"`
	Type     string `json:"type"`
	Link     string `json:"link"`
	Company  string `json:"company"`
	Updated  string `json:"updated"`
	Salary   string `json:"salary"`
	ID       int64  `json:"id"`
}
