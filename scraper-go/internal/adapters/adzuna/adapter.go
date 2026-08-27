package adzuna

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/adapterutil"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
)

const (
	defaultAdzunaResultsPerPage  = 20
	defaultAdzunaMaxPages        = 5
	defaultAdzunaKeywordSlotSize = 30
)

type adzunaStatusError struct {
	statusCode int
}

func (e adzunaStatusError) Error() string {
	return fmt.Sprintf("status %d", e.statusCode)
}

type AdzunaAdapter struct {
	client     *http.Client
	appID      string
	appKey     string
	country    string
	mu         sync.Mutex
	nextOffset int
}

func NewAdzuna(appID, appKey, country string) *AdzunaAdapter {
	return &AdzunaAdapter{
		client:  &http.Client{Timeout: 60 * time.Second},
		appID:   appID,
		appKey:  appKey,
		country: strings.ToLower(strings.TrimSpace(country)),
	}
}

func (a *AdzunaAdapter) SourceName() string {
	return fmt.Sprintf("Adzuna:%s", a.country)
}

func (a *AdzunaAdapter) Capabilities() ports.SourceCapabilities {
	return ports.SourceCapabilities{
		Provider: ports.ProviderAdzuna,
		Mode:     ports.DiscoveryBatch,
	}
}

func adzunaKeywordSlotSize() int {
	value := strings.TrimSpace(os.Getenv("ADZUNA_KEYWORD_SLOT_SIZE"))
	if value == "" {
		return defaultAdzunaKeywordSlotSize
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return defaultAdzunaKeywordSlotSize
	}
	return parsed
}

// buildURL espelha exatamente o buildAdzunaUrl do JS.
func (a *AdzunaAdapter) buildURL(keyword string, req domain.ScrapeRequest, page int) string {
	resultsPerPage := req.ResultsPerPage
	if resultsPerPage <= 0 {
		resultsPerPage = defaultAdzunaResultsPerPage
	}

	endpoint := fmt.Sprintf(
		"https://api.adzuna.com/v1/api/jobs/%s/search/%d",
		a.country, page,
	)

	u, _ := url.Parse(endpoint)
	q := u.Query()
	q.Set("app_id", a.appID)
	q.Set("app_key", a.appKey)
	q.Set("results_per_page", fmt.Sprintf("%d", resultsPerPage))
	q.Set("what", keyword)

	if req.SearchLocation != "" {
		q.Set("where", req.SearchLocation)
	}

	// Comentado para espelhar o JS:
	// if req.RemoteOnly {
	// 	q.Set("work_from_home", "1")
	// }

	u.RawQuery = q.Encode()
	return u.String()
}

func (a *AdzunaAdapter) Search(ctx context.Context, keyword string, req domain.ScrapeRequest) ([]domain.Job, error) {
	return a.searchKeyword(ctx, keyword, req)
}

func (a *AdzunaAdapter) SearchBatch(ctx context.Context, keywords []string, req domain.ScrapeRequest) ([]domain.Job, error) {
	slot := a.nextKeywordSlot(keywords, adzunaKeywordSlotSize())
	if len(slot) == 0 {
		return nil, nil
	}

	if len(slot) < len(keywords) {
		slog.Info("adzuna: usando slot rotativo de keywords",
			"country", a.country,
			"selected", len(slot),
			"total", len(keywords),
		)
	}

	var allJobs []domain.Job
	var firstErr error
	for _, keyword := range slot {
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}
		keyword = strings.TrimSpace(keyword)
		if keyword == "" {
			continue
		}

		jobs, err := a.searchKeyword(ctx, keyword, req)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		allJobs = append(allJobs, jobs...)
	}
	if len(allJobs) > 0 {
		return allJobs, nil
	}

	return nil, firstErr
}

func (a *AdzunaAdapter) nextKeywordSlot(keywords []string, slotSize int) []string {
	if len(keywords) == 0 {
		return nil
	}
	if slotSize <= 0 || slotSize >= len(keywords) {
		return append([]string(nil), keywords...)
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	offset := a.nextOffset % len(keywords)
	a.nextOffset = (offset + slotSize) % len(keywords)

	slot := make([]string, 0, slotSize)
	for i := 0; i < slotSize; i++ {
		slot = append(slot, keywords[(offset+i)%len(keywords)])
	}
	return slot
}

func (a *AdzunaAdapter) searchKeyword(ctx context.Context, keyword string, req domain.ScrapeRequest) ([]domain.Job, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return nil, nil
	}

	maxPages := req.MaxPagesPerKeyword
	if maxPages <= 0 {
		maxPages = defaultAdzunaMaxPages
	}

	// Intervalo entre requisições (aumentamos a segurança)
	waitDuration := time.Duration(req.WaitBetweenSearchesMs) * time.Millisecond
	if waitDuration <= 0 {
		waitDuration = 2000 * time.Millisecond // Adzuna é sensível, 2s é mais seguro
	}

	pageTimeout := time.Duration(req.PageTimeoutMs) * time.Millisecond
	if pageTimeout <= 0 {
		pageTimeout = 15 * time.Second
	}

	var allJobs []domain.Job
	seenPages := make(map[string]struct{})

	for page := 1; page <= maxPages; page++ {
		endpoint := a.buildURL(keyword, req, page)

		pageCtx, cancel := context.WithTimeout(ctx, pageTimeout)
		jobs, err := a.fetchPageWithRetry(pageCtx, endpoint, keyword)
		cancel()

		if err != nil {
			if len(allJobs) > 0 && shouldKeepAdzunaPartialResults(err) {
				return allJobs, nil
			}
			return nil, fmt.Errorf("adzuna erro na página %d: %w", page, err)
		}

		if len(jobs) == 0 {
			break
		}
		if adapterutil.RepeatedJobPage(seenPages, jobs) {
			break
		}

		allJobs = append(allJobs, jobs...)

		if err := adapterutil.Wait(ctx, waitDuration); err != nil {
			return nil, err
		}
	}

	return allJobs, nil
}

func (a *AdzunaAdapter) fetchPageWithRetry(ctx context.Context, endpoint, keyword string) ([]domain.Job, error) {
	var lastErr error

	for attempt := 0; attempt < 3; attempt++ {
		jobs, err := a.fetchPage(ctx, endpoint, keyword)
		if err == nil {
			return jobs, nil
		}

		lastErr = err
		if !isTransientAdzunaError(err) {
			return nil, err
		}

		if err := adapterutil.Wait(ctx, time.Duration(attempt+1)*1500*time.Millisecond); err != nil {
			return nil, err
		}
	}

	return nil, lastErr
}

func shouldKeepAdzunaPartialResults(err error) bool {
	return isTransientAdzunaError(err) || errors.Is(err, context.DeadlineExceeded)
}

func isTransientAdzunaError(err error) bool {
	var statusErr adzunaStatusError
	if errors.As(err, &statusErr) {
		return statusErr.statusCode == http.StatusTooManyRequests ||
			statusErr.statusCode == http.StatusInternalServerError ||
			statusErr.statusCode == http.StatusBadGateway ||
			statusErr.statusCode == http.StatusServiceUnavailable ||
			statusErr.statusCode == http.StatusGatewayTimeout
	}

	return errors.Is(err, context.DeadlineExceeded)
}

type adzunaResponse struct {
	Results []struct {
		Title   string `json:"title"`
		Company struct {
			DisplayName string `json:"display_name"`
		} `json:"company"`
		Location struct {
			DisplayName string `json:"display_name"`
		} `json:"location"`
		RedirectURL string  `json:"redirect_url"`
		URL         string  `json:"url"`
		SalaryMin   float64 `json:"salary_min"`
		SalaryMax   float64 `json:"salary_max"`
		Created     string  `json:"created"`
	} `json:"results"`
}

func (a *AdzunaAdapter) fetchPage(ctx context.Context, endpoint, keyword string) ([]domain.Job, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, adzunaStatusError{statusCode: resp.StatusCode}
	}

	var data adzunaResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	if len(data.Results) == 0 {
		return []domain.Job{}, nil
	}

	jobs := make([]domain.Job, 0, len(data.Results))
	for _, r := range data.Results {
		// Espelha o salario do JS: "min-max" ou vazio.
		salario := ""
		if r.SalaryMin != 0 || r.SalaryMax != 0 {
			salario = fmt.Sprintf("%g-%g", r.SalaryMin, r.SalaryMax)
		}

		link := strings.TrimSpace(r.RedirectURL)
		if link == "" {
			link = strings.TrimSpace(r.URL)
		}

		jobs = append(jobs, domain.Job{
			ID:       link,
			Title:    strings.TrimSpace(r.Title),
			Company:  strings.TrimSpace(r.Company.DisplayName),
			Location: strings.TrimSpace(r.Location.DisplayName),
			URL:      link,
			Salary:   salario,
			PostedAt: r.Created,
			Source:   "Adzuna",
			Sources:  []string{"Adzuna"},
			Keyword:  keyword,
			Keywords: []string{keyword},
		})
	}

	return jobs, nil
}
