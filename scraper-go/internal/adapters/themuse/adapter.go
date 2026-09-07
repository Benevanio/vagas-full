package themuse

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/adapterutil"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
)

const (
	theMuseFeedTTL         = 30 * time.Minute
	theMuseDetailTimeout   = 15 * time.Second
	defaultTheMuseMaxPages = 50
)

var (
	theMuseHTMLTagPattern = regexp.MustCompile(`<[^>]*>`)
	theMuseSpacePattern   = regexp.MustCompile(`\s+`)
	theMuseTokenPattern   = regexp.MustCompile(`[a-z0-9+#.]+`)
)

// TheMuseAdapter consome o feed público e filtra localmente por keyword.
type TheMuseAdapter struct {
	client  *http.Client
	mu      sync.Mutex
	fetchMu sync.Mutex
	cache   []domain.Job
	cached  time.Time
	cacheID string
	details map[string]domain.Job
}

func NewTheMuse() *TheMuseAdapter {
	return &TheMuseAdapter{
		client:  &http.Client{Timeout: 60 * time.Second},
		details: make(map[string]domain.Job),
	}
}

func (a *TheMuseAdapter) SourceName() string { return "The Muse" }

func (a *TheMuseAdapter) Capabilities() ports.SourceCapabilities {
	return ports.SourceCapabilities{
		Provider: ports.ProviderTheMuse,
		Mode:     ports.DiscoveryCatalog,
	}
}

func buildTheMuseURL(page int) string {
	u, _ := url.Parse("https://www.themuse.com/api/public/jobs")
	q := u.Query()

	q.Set("page", fmt.Sprintf("%d", page))
	q.Set("descending", "true")

	if apiKey := os.Getenv("THEMUSE_API_KEY"); apiKey != "" {
		q.Set("api_key", apiKey)
	}

	u.RawQuery = q.Encode()
	return u.String()
}

func buildTheMuseDetailURL(id string) string {
	u, _ := url.Parse("https://www.themuse.com/api/public/jobs/" + url.PathEscape(id))
	q := u.Query()

	if apiKey := os.Getenv("THEMUSE_API_KEY"); apiKey != "" {
		q.Set("api_key", apiKey)
	}

	u.RawQuery = q.Encode()
	return u.String()
}

type theMuseNamedValue struct {
	Name string `json:"name"`
}

type theMuseResponse struct {
	Results []struct {
		ID      json.Number `json:"id"`
		Name    string      `json:"name"`
		Company struct {
			Name string `json:"name"`
		} `json:"company"`
		Refs struct {
			LandingPage string `json:"landing_page"`
		} `json:"refs"`
		Locations       []theMuseNamedValue `json:"locations"`
		Categories      []theMuseNamedValue `json:"categories"`
		Levels          []theMuseNamedValue `json:"levels"`
		Contents        string              `json:"contents"`
		Description     string              `json:"description"`
		PublicationDate string              `json:"publication_date"`
	} `json:"results"`
}

type theMuseDetailResponse struct {
	ID      json.Number `json:"id"`
	Name    string      `json:"name"`
	Company struct {
		Name string `json:"name"`
	} `json:"company"`
	Refs struct {
		LandingPage string `json:"landing_page"`
	} `json:"refs"`
	Locations       []theMuseNamedValue `json:"locations"`
	Categories      []theMuseNamedValue `json:"categories"`
	Levels          []theMuseNamedValue `json:"levels"`
	Contents        string              `json:"contents"`
	Description     string              `json:"description"`
	PublicationDate string              `json:"publication_date"`
}

func (a *TheMuseAdapter) Search(ctx context.Context, keyword string, req domain.ScrapeRequest) ([]domain.Job, error) {
	feed, err := a.fetchFeed(ctx, req)
	if err != nil {
		return nil, err
	}
	if cause := context.Cause(ctx); cause != nil {
		return nil, cause
	}

	matches := make([]domain.Job, 0)
	for _, job := range feed {
		if !theMuseMatchesKeyword(job, keyword) {
			continue
		}
		job.Keyword = keyword
		job.Keywords = []string{keyword}
		matches = append(matches, job)
	}

	return matches, nil
}

func (a *TheMuseAdapter) SearchCatalog(
	ctx context.Context,
	keywords []string,
	req domain.ScrapeRequest,
) ([]domain.Job, error) {
	feed, err := a.fetchFeed(ctx, req)
	if err != nil {
		return nil, err
	}

	jobs := make([]domain.Job, 0, len(feed))
	for _, job := range feed {
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}

		matchedKeywords := make([]string, 0, len(keywords))
		for _, keyword := range keywords {
			keyword = strings.TrimSpace(keyword)
			if keyword != "" && theMuseMatchesKeyword(job, keyword) {
				matchedKeywords = append(matchedKeywords, keyword)
			}
		}
		if len(matchedKeywords) == 0 {
			continue
		}

		job.Keyword = matchedKeywords[0]
		job.Keywords = matchedKeywords
		jobs = append(jobs, job)
	}
	return jobs, nil
}

func (a *TheMuseAdapter) fetchFeed(ctx context.Context, req domain.ScrapeRequest) ([]domain.Job, error) {
	maxPages := req.MaxPagesPerKeyword
	if maxPages <= 0 {
		maxPages = defaultTheMuseMaxPages
	}

	pageTimeout := time.Duration(req.PageTimeoutMs) * time.Millisecond
	if pageTimeout <= 0 {
		pageTimeout = 15 * time.Second
	}

	waitBetween := time.Duration(req.WaitBetweenSearchesMs) * time.Millisecond
	if waitBetween <= 0 {
		waitBetween = 1000 * time.Millisecond
	}

	cacheID := fmt.Sprintf("pages:%d", maxPages)

	a.mu.Lock()
	if a.cacheID == cacheID && time.Since(a.cached) < theMuseFeedTTL {
		defer a.mu.Unlock()
		return append([]domain.Job(nil), a.cache...), nil
	}
	a.mu.Unlock()

	a.fetchMu.Lock()
	defer a.fetchMu.Unlock()

	a.mu.Lock()
	if a.cacheID == cacheID && time.Since(a.cached) < theMuseFeedTTL {
		defer a.mu.Unlock()
		return append([]domain.Job(nil), a.cache...), nil
	}
	a.mu.Unlock()

	var allJobs []domain.Job
	seenPages := make(map[string]struct{})

	for page := 1; page <= maxPages; page++ {
		endpoint := buildTheMuseURL(page)

		pageCtx, cancel := context.WithTimeout(ctx, pageTimeout)
		jobs, err := a.fetchPage(pageCtx, endpoint)
		cancel()

		if err != nil {
			return nil, err
		}

		if len(jobs) == 0 {
			// Espelha o break do JS quando results está vazio.
			break
		}
		if adapterutil.RepeatedJobPage(seenPages, jobs) {
			break
		}

		allJobs = append(allJobs, jobs...)

		if page < maxPages {
			if err := adapterutil.Wait(ctx, waitBetween); err != nil {
				return nil, err
			}
		}
	}

	allJobs = a.enrichJobs(ctx, allJobs)
	if cause := context.Cause(ctx); cause != nil {
		return nil, cause
	}

	a.mu.Lock()
	a.cacheID = cacheID
	a.cached = time.Now()
	a.cache = append([]domain.Job(nil), allJobs...)
	a.mu.Unlock()

	return append([]domain.Job(nil), allJobs...), nil
}

func (a *TheMuseAdapter) fetchPage(ctx context.Context, endpoint string) ([]domain.Job, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	var data theMuseResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	if len(data.Results) == 0 {
		return []domain.Job{}, nil
	}

	jobs := make([]domain.Job, 0, len(data.Results))
	for _, r := range data.Results {
		jobs = append(jobs, theMuseJobFromListResult(
			strings.TrimSpace(r.ID.String()),
			r.Name,
			r.Company.Name,
			r.Refs.LandingPage,
			r.Locations,
			r.Categories,
			r.Levels,
			r.Contents,
			r.Description,
			r.PublicationDate,
		))
	}

	return jobs, nil
}

func (a *TheMuseAdapter) enrichJobs(ctx context.Context, jobs []domain.Job) []domain.Job {
	if len(jobs) == 0 {
		return jobs
	}

	enriched := make([]domain.Job, len(jobs))
	copy(enriched, jobs)

	for i := range enriched {
		if context.Cause(ctx) != nil {
			break
		}
		id := strings.TrimSpace(enriched[i].ID)
		if id == "" || strings.HasPrefix(id, "http://") || strings.HasPrefix(id, "https://") {
			continue
		}

		a.mu.Lock()
		detail, ok := a.details[id]
		a.mu.Unlock()
		if ok {
			enriched[i] = mergeTheMuseJob(enriched[i], detail)
			continue
		}

		detailCtx, cancel := context.WithTimeout(ctx, theMuseDetailTimeout)
		detail, err := a.fetchDetail(detailCtx, id)
		cancel()
		if err != nil {
			continue
		}

		a.mu.Lock()
		a.details[id] = detail
		a.mu.Unlock()

		enriched[i] = mergeTheMuseJob(enriched[i], detail)
	}

	return enriched
}

func (a *TheMuseAdapter) fetchDetail(ctx context.Context, id string) (domain.Job, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, buildTheMuseDetailURL(id), nil)
	if err != nil {
		return domain.Job{}, err
	}

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return domain.Job{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return domain.Job{}, fmt.Errorf("detail status %d", resp.StatusCode)
	}

	var data theMuseDetailResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return domain.Job{}, err
	}

	return theMuseJobFromListResult(
		strings.TrimSpace(data.ID.String()),
		data.Name,
		data.Company.Name,
		data.Refs.LandingPage,
		data.Locations,
		data.Categories,
		data.Levels,
		data.Contents,
		data.Description,
		data.PublicationDate,
	), nil
}

func theMuseJobFromListResult(
	id string,
	title string,
	company string,
	landingPage string,
	locations []theMuseNamedValue,
	categories []theMuseNamedValue,
	levels []theMuseNamedValue,
	contents string,
	description string,
	publicationDate string,
) domain.Job {
	urlValue := strings.TrimSpace(landingPage)
	jobID := strings.TrimSpace(id)
	if jobID == "" {
		jobID = urlValue
	}

	descParts := []string{
		stripTheMuseHTML(contents),
		stripTheMuseHTML(description),
		strings.Join(theMuseNames(categories), " "),
		strings.Join(theMuseNames(levels), " "),
	}

	return domain.Job{
		ID:          jobID,
		Title:       strings.TrimSpace(title),
		Company:     strings.TrimSpace(company),
		Location:    strings.Join(theMuseNames(locations), ", "),
		URL:         urlValue,
		Description: strings.TrimSpace(strings.Join(nonEmptyStrings(descParts), " ")),
		PostedAt:    publicationDate,
		Source:      "The Muse",
		Sources:     []string{"The Muse"},
	}
}

func mergeTheMuseJob(base, detail domain.Job) domain.Job {
	if detail.ID != "" {
		base.ID = detail.ID
	}
	if detail.Title != "" {
		base.Title = detail.Title
	}
	if detail.Company != "" {
		base.Company = detail.Company
	}
	if detail.Location != "" {
		base.Location = detail.Location
	}
	if detail.URL != "" {
		base.URL = detail.URL
	}
	if detail.Description != "" {
		base.Description = detail.Description
	}
	if detail.PostedAt != "" {
		base.PostedAt = detail.PostedAt
	}
	return base
}

func theMuseMatchesKeyword(job domain.Job, keyword string) bool {
	keyword = strings.TrimSpace(strings.ToLower(keyword))
	if keyword == "" {
		return true
	}

	searchText := strings.ToLower(strings.Join([]string{
		job.Title,
		job.Company,
		job.Location,
		job.Description,
	}, " "))

	groups := theMuseKeywordGroups(keyword)
	if len(groups) == 0 {
		return false
	}

	for _, group := range groups {
		if !theMuseTextHasAnyToken(searchText, group) {
			return false
		}
	}

	return true
}

func theMuseKeywordGroups(keyword string) [][]string {
	terms := theMuseTokenPattern.FindAllString(keyword, -1)
	groups := make([][]string, 0, len(terms))

	for _, term := range terms {
		switch term {
		case "developer", "desenvolvedor":
			groups = append(groups, []string{"developer", "engineer", "dev", "software"})
		case "engineer":
			groups = append(groups, []string{"engineer", "developer"})
		case "frontend", "front-end":
			groups = append(groups, []string{"frontend", "front-end", "front", "ui"})
		case "backend":
			groups = append(groups, []string{"backend", "back-end", "server"})
		case "node.js", "node":
			groups = append(groups, []string{"node.js", "nodejs", "node"})
		case "golang", "go":
			groups = append(groups, []string{"golang", "go"})
		case "javascript":
			groups = append(groups, []string{"javascript", "js"})
		case "typescript":
			groups = append(groups, []string{"typescript", "ts"})
		case "c#":
			groups = append(groups, []string{"c#", "csharp"})
		case ".net":
			groups = append(groups, []string{".net", "dotnet"})
		default:
			groups = append(groups, []string{term})
		}
	}

	return groups
}

func theMuseTextHasAnyToken(text string, terms []string) bool {
	for _, term := range terms {
		if theMuseTextHasToken(text, term) {
			return true
		}
	}
	return false
}

func theMuseTextHasToken(text, term string) bool {
	if term == "" {
		return true
	}

	if strings.Contains(term, ".") || strings.Contains(term, "#") || strings.Contains(term, "+") {
		return strings.Contains(text, term)
	}

	for _, token := range theMuseTokenPattern.FindAllString(text, -1) {
		if token == term {
			return true
		}
	}

	return false
}

func theMuseNames(values []theMuseNamedValue) []string {
	names := make([]string, 0, len(values))
	for _, value := range values {
		name := strings.TrimSpace(value.Name)
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

func stripTheMuseHTML(value string) string {
	withoutTags := theMuseHTMLTagPattern.ReplaceAllString(value, " ")
	return strings.TrimSpace(theMuseSpacePattern.ReplaceAllString(withoutTags, " "))
}

func nonEmptyStrings(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
