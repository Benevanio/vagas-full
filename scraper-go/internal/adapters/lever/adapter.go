package lever

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/adapterutil"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
)

type LeverAdapter struct {
	client      *http.Client
	companySlug string
	companyName string
	apiHost     string
	apiURL      string

	mu         sync.Mutex
	cachedJobs []leverPosting
	cacheErr   error
	loaded     bool
}

type leverCompany struct {
	Slug    string `json:"slug"`
	Site    string `json:"site"`
	Name    string `json:"name"`
	Company string `json:"companyName"`
	Region  string `json:"region"`
	APIURL  string `json:"apiUrl"`
	JobsURL string `json:"jobsUrl"`
}

type leverPosting struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	HostedURL string `json:"hostedUrl"`
	ApplyURL  string `json:"applyUrl"`
	CreatedAt int64  `json:"createdAt"`
	Country   string `json:"country"`

	Categories struct {
		Team         string   `json:"team"`
		Department   string   `json:"department"`
		Location     string   `json:"location"`
		Commitment   string   `json:"commitment"`
		Level        string   `json:"level"`
		AllLocations []string `json:"allLocations"`
	} `json:"categories"`

	OpeningPlain         string      `json:"openingPlain"`
	Description          string      `json:"description"`
	DescriptionPlain     string      `json:"descriptionPlain"`
	DescriptionBodyPlain string      `json:"descriptionBodyPlain"`
	Lists                []leverList `json:"lists"`
	AdditionalPlain      string      `json:"additionalPlain"`
	SalaryDescription    string      `json:"salaryDescriptionPlain"`
	SalaryRange          *struct {
		Min      float64 `json:"min"`
		Max      float64 `json:"max"`
		Currency string  `json:"currency"`
		Interval string  `json:"interval"`
	} `json:"salaryRange"`
	WorkplaceType string `json:"workplaceType"`
	State         string `json:"state"`
}

type leverList struct {
	Text    string `json:"text"`
	Content string `json:"content"`
}

func NewLever(companySlug, companyName string) *LeverAdapter {
	return &LeverAdapter{
		client:      &http.Client{Timeout: 60 * time.Second},
		companySlug: companySlug,
		companyName: companyName,
		apiHost:     "api.lever.co",
	}
}

func NewLeverWithRegion(companySlug, companyName, region string) *LeverAdapter {
	adapter := NewLever(companySlug, companyName)
	if strings.EqualFold(strings.TrimSpace(region), "eu") {
		adapter.apiHost = "api.eu.lever.co"
	}
	return adapter
}

func NewLeverWithEndpoint(companySlug, companyName, region, apiURL string) *LeverAdapter {
	adapter := NewLeverWithRegion(companySlug, companyName, region)
	adapter.apiURL = strings.TrimSpace(apiURL)
	return adapter
}

func FetchLeverSlugs(_ context.Context) ([]leverCompany, error) {
	path := os.Getenv("LEVER_COMPANIES_FILE")
	if path == "" {
		path = "./internal/interfaces/leverCompanies.json"
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("lever: leitura do arquivo '%s': %w", path, err)
	}

	var companies []leverCompany
	if err := json.Unmarshal(data, &companies); err != nil {
		return nil, fmt.Errorf("lever: parse do arquivo '%s': %w", path, err)
	}

	if len(companies) == 0 {
		return nil, fmt.Errorf("lever: nenhuma empresa encontrada em '%s'", path)
	}

	return companies, nil
}

func (a *LeverAdapter) SourceName() string {
	return fmt.Sprintf("Lever:%s", a.companyName)
}

func (a *LeverAdapter) Capabilities() ports.SourceCapabilities {
	return ports.SourceCapabilities{
		Provider: ports.ProviderLever,
		Mode:     ports.DiscoveryCatalog,
	}
}

func (a *LeverAdapter) Search(ctx context.Context, keyword string, req domain.ScrapeRequest) ([]domain.Job, error) {
	return a.SearchBatch(ctx, []string{keyword}, req)
}

func (a *LeverAdapter) SearchCatalog(
	ctx context.Context,
	keywords []string,
	req domain.ScrapeRequest,
) ([]domain.Job, error) {
	return a.SearchBatch(ctx, keywords, req)
}

func (a *LeverAdapter) SearchBatch(ctx context.Context, keywords []string, req domain.ScrapeRequest) ([]domain.Job, error) {
	raw, err := a.fetchPostings(ctx, req)
	if err != nil {
		return nil, err
	}

	includeAll := leverIncludeAllJobs()
	var jobs []domain.Job
	for _, j := range raw {
		if !leverMatchesFilters(j, req) {
			continue
		}

		matchedKeywords := leverMatchingKeywords(j, keywords)
		if len(matchedKeywords) == 0 && !includeAll {
			continue
		}

		dataPublicacao := ""
		if j.CreatedAt != 0 {
			dataPublicacao = time.UnixMilli(j.CreatedAt).UTC().Format(time.RFC3339)
		}

		keyword := ""
		if len(matchedKeywords) > 0 {
			keyword = matchedKeywords[0]
		}

		jobs = append(jobs, domain.Job{
			ID:          leverJobID(j),
			Title:       strings.TrimSpace(j.Text),
			Company:     a.companyName,
			Location:    leverLocation(j),
			URL:         leverURL(j),
			Salary:      leverSalary(j),
			Modality:    leverModality(j),
			Description: leverDescription(j),
			PostedAt:    dataPublicacao,
			Source:      "Lever",
			Sources:     []string{"Lever"},
			Keyword:     keyword,
			Keywords:    matchedKeywords,
		})
	}

	return jobs, nil
}

func (a *LeverAdapter) fetchPostings(ctx context.Context, req domain.ScrapeRequest) ([]leverPosting, error) {
	a.mu.Lock()
	if a.loaded {
		defer a.mu.Unlock()
		return a.cachedJobs, a.cacheErr
	}
	defer a.mu.Unlock()

	pageTimeout := time.Duration(req.PageTimeoutMs) * time.Millisecond
	if pageTimeout <= 0 {
		pageTimeout = 15 * time.Second
	}

	endpoint := a.postingsEndpoint()

	reqCtx, cancel := context.WithTimeout(ctx, pageTimeout)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(reqCtx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("lever: build request: %w", err)
	}

	httpReq.Header.Set("User-Agent", "JobsScraper/1.0")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("lever: http do: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		// ok
	case http.StatusTooManyRequests:
		return nil, fmt.Errorf("lever: rate limit atingido (429)")
	case http.StatusNotFound:
		return nil, fmt.Errorf("lever: empresa '%s' não encontrada (404)", a.companySlug)
	default:
		return nil, fmt.Errorf("lever: status inesperado %d", resp.StatusCode)
	}

	if err := json.NewDecoder(resp.Body).Decode(&a.cachedJobs); err != nil {
		a.cacheErr = err
		a.loaded = true
		return nil, fmt.Errorf("lever: decode json: %w", err)
	}

	a.loaded = true

	return a.cachedJobs, nil
}

func (a *LeverAdapter) postingsEndpoint() string {
	if a.apiURL != "" {
		return a.apiURL
	}

	return fmt.Sprintf(
		"https://%s/v0/postings/%s?mode=json",
		a.apiHost,
		a.companySlug,
	)
}

// func leverMatchesRequest(job leverPosting, keyword string, req domain.ScrapeRequest) bool {
// 	if keyword != "" && !strings.Contains(leverNormalize(leverSearchText(job)), leverNormalize(keyword)) {
// 		return false
// 	}

// 	return leverMatchesFilters(job, req)
// }

func leverMatchesFilters(job leverPosting, req domain.ScrapeRequest) bool {
	if req.RemoteOnly && leverModality(job) != "Remoto" {
		return false
	}

	if location := strings.TrimSpace(req.SearchLocation); location != "" && leverModality(job) != "Remoto" {
		if !strings.Contains(leverNormalize(leverLocation(job)), leverNormalize(location)) {
			return false
		}
	}

	return true
}

func leverMatchingKeywords(job leverPosting, keywords []string) []string {
	text := leverNormalize(leverSearchText(job))
	matched := make([]string, 0, len(keywords))

	for _, keyword := range keywords {
		keyword = strings.TrimSpace(keyword)
		if keyword == "" {
			continue
		}

		if strings.Contains(text, leverNormalize(keyword)) {
			matched = append(matched, keyword)
		}
	}

	return adapterutil.UniqueTrimmedStrings(matched)
}

func leverIncludeAllJobs() bool {
	value := strings.TrimSpace(os.Getenv("LEVER_INCLUDE_ALL_JOBS"))
	if value == "" {
		return true
	}

	return !strings.EqualFold(value, "false")
}

func leverSearchText(job leverPosting) string {
	parts := []string{
		job.Text,
		job.Country,
		job.Categories.Team,
		job.Categories.Department,
		job.Categories.Location,
		job.Categories.Commitment,
		job.Categories.Level,
		job.OpeningPlain,
		job.DescriptionPlain,
		job.DescriptionBodyPlain,
		job.AdditionalPlain,
		job.SalaryDescription,
		job.WorkplaceType,
	}
	parts = append(parts, job.Categories.AllLocations...)
	for _, list := range job.Lists {
		parts = append(parts, list.Text, list.Content)
	}
	return strings.Join(parts, " ")
}

func leverJobID(job leverPosting) string {
	if job.HostedURL != "" {
		return strings.TrimSpace(job.HostedURL)
	}
	if job.ID != "" {
		return "lever:" + strings.TrimSpace(job.ID)
	}
	return strings.TrimSpace(job.Text)
}

func leverURL(job leverPosting) string {
	if job.HostedURL != "" {
		return strings.TrimSpace(job.HostedURL)
	}
	return strings.TrimSpace(job.ApplyURL)
}

func leverLocation(job leverPosting) string {
	locations := []string{job.Categories.Location}
	locations = append(locations, job.Categories.AllLocations...)
	if job.Country != "" {
		locations = append(locations, job.Country)
	}
	if len(adapterutil.UniqueTrimmedStrings(locations)) == 0 {
		locations = append(locations, job.Categories.Department)
	}
	return strings.Join(adapterutil.UniqueTrimmedStrings(locations), " | ")
}

func leverModality(job leverPosting) string {
	text := leverNormalize(strings.Join([]string{
		job.WorkplaceType,
		job.Categories.Location,
		strings.Join(job.Categories.AllLocations, " "),
	}, " "))

	switch {
	case strings.Contains(text, "hybrid") || strings.Contains(text, "hibrido"):
		return "Híbrido"
	case strings.Contains(text, "remote") || strings.Contains(text, "remoto"):
		return "Remoto"
	case strings.Contains(text, "onsite") || strings.Contains(text, "on site") || strings.Contains(text, "on-site"):
		return "Presencial"
	default:
		return strings.TrimSpace(job.Categories.Commitment)
	}
}

func leverDescription(job leverPosting) string {
	sections := []string{
		job.OpeningPlain,
		job.DescriptionPlain,
		job.DescriptionBodyPlain,
	}
	if len(adapterutil.NonEmptyStrings(sections)) == 0 {
		sections = append(sections, stripLeverHTML(job.Description))
	}
	for _, list := range job.Lists {
		title := strings.TrimSpace(list.Text)
		content := stripLeverHTML(list.Content)
		if title != "" && content != "" {
			sections = append(sections, title+": "+content)
		} else {
			sections = append(sections, title, content)
		}
	}
	sections = append(sections, job.AdditionalPlain, job.SalaryDescription)
	return strings.Join(adapterutil.NonEmptyStrings(sections), "\n\n")
}

func leverSalary(job leverPosting) string {
	if job.SalaryRange == nil {
		return strings.TrimSpace(job.SalaryDescription)
	}

	min := job.SalaryRange.Min
	max := job.SalaryRange.Max
	currency := strings.TrimSpace(job.SalaryRange.Currency)
	interval := strings.TrimSpace(job.SalaryRange.Interval)

	switch {
	case min > 0 && max > 0:
		return strings.TrimSpace(fmt.Sprintf("%.0f - %.0f %s %s", min, max, currency, interval))
	case min > 0:
		return strings.TrimSpace(fmt.Sprintf("A partir de %.0f %s %s", min, currency, interval))
	case max > 0:
		return strings.TrimSpace(fmt.Sprintf("Até %.0f %s %s", max, currency, interval))
	default:
		return strings.TrimSpace(job.SalaryDescription)
	}
}

func stripLeverHTML(value string) string {
	value = html.UnescapeString(value)
	value = regexp.MustCompile(`(?s)<[^>]+>`).ReplaceAllString(value, " ")
	value = html.UnescapeString(value)
	return strings.Join(strings.Fields(value), " ")
}

func leverNormalize(value string) string {
	value = strings.ToLower(html.UnescapeString(value))
	value = strings.ReplaceAll(value, "-", " ")
	value = strings.ReplaceAll(value, "/", " ")
	return strings.Join(strings.Fields(value), " ")
}

func BuildLeverAdapters(ctx context.Context) ([]ports.JobSource, error) {
	companies, err := FetchLeverSlugs(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]ports.JobSource, 0, len(companies))
	for _, company := range companies {
		slug := strings.TrimSpace(company.Slug)
		if slug == "" {
			slug = strings.TrimSpace(company.Site)
		}
		name := strings.TrimSpace(company.Name)
		if name == "" {
			name = strings.TrimSpace(company.Company)
		}
		if slug == "" {
			continue
		}
		if name == "" {
			name = slug
		}
		result = append(result, NewLeverWithEndpoint(slug, name, company.Region, company.APIURL))
	}

	return result, nil
}
