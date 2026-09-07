package greenhouse

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log/slog"
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

// var jsonLDPattern = regexp.MustCompile(`(?s)<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>`)

type greenhouseListResponse struct {
	Jobs []greenhouseListJob `json:"jobs"`
	Meta struct {
		Total int `json:"total"`
	} `json:"meta"`
}

type greenhouseListJob struct {
	ID            int                  `json:"id"`
	InternalJobID *int                 `json:"internal_job_id"`
	Title         string               `json:"title"`
	Content       string               `json:"content"`
	AbsoluteURL   string               `json:"absolute_url"`
	UpdatedAt     string               `json:"updated_at"`
	Language      string               `json:"language"`
	RequisitionID string               `json:"requisition_id"`
	Metadata      []greenhouseMetadata `json:"metadata"`
	Departments   []greenhouseGroup    `json:"departments"`
	Offices       []greenhouseOffice   `json:"offices"`
	Location      struct {
		Name string `json:"name"`
	} `json:"location"`
}

type greenhouseMetadata struct {
	Name  string `json:"name"`
	Value any    `json:"value"`
}

type greenhouseGroup struct {
	Name string `json:"name"`
}

type greenhouseOffice struct {
	Name     string `json:"name"`
	Location string `json:"location"`
}

// type jobPosting struct {
// 	Type        string `json:"@type"`
// 	Title       string `json:"title"`
// 	Description string `json:"description"`
// 	DatePosted  string `json:"datePosted"`

// 	HiringOrganization struct {
// 		Name string `json:"name"`
// 	} `json:"hiringOrganization"`

// 	JobLocation struct {
// 		Address struct {
// 			Locality string `json:"addressLocality"`
// 			Region   string `json:"addressRegion"`
// 			Country  string `json:"addressCountry"`
// 		} `json:"address"`
// 	} `json:"jobLocation"`

// 	BaseSalary *struct {
// 		Value struct {
// 			MinValue float64 `json:"minValue"`
// 			MaxValue float64 `json:"maxValue"`
// 			UnitText string  `json:"unitText"`
// 		} `json:"value"`
// 	} `json:"baseSalary"`
// }

// func extractJSONLD(html string) *jobPosting {
// 	matches := jsonLDPattern.FindAllStringSubmatch(html, -1)

// 	for _, match := range matches {
// 		if len(match) < 2 {
// 			continue
// 		}

// 		var posting jobPosting
// 		if err := json.Unmarshal([]byte(strings.TrimSpace(match[1])), &posting); err != nil {
// 			continue
// 		}

// 		if posting.Type == "JobPosting" && posting.Title != "" {
// 			return &posting
// 		}
// 	}

// 	return nil
// }

type GreenhouseAdapter struct {
	client      *http.Client
	boardToken  string
	companyName string

	mu         sync.Mutex
	cachedJobs []greenhouseListJob
	cacheErr   error
	loaded     bool
}

func NewGreenhouse(boardToken, companyName string) *GreenhouseAdapter {
	return &GreenhouseAdapter{
		client:      &http.Client{Timeout: 30 * time.Second},
		boardToken:  boardToken,
		companyName: companyName,
	}
}

func (a *GreenhouseAdapter) SourceName() string {
	return fmt.Sprintf("Green House:%s", a.companyName)
}

func (a *GreenhouseAdapter) Capabilities() ports.SourceCapabilities {
	return ports.SourceCapabilities{
		Provider: ports.ProviderGreenhouse,
		Mode:     ports.DiscoveryCatalog,
	}
}

func (a *GreenhouseAdapter) Search(ctx context.Context, keyword string, req domain.ScrapeRequest) ([]domain.Job, error) {
	return a.SearchBatch(ctx, []string{keyword}, req)
}

func (a *GreenhouseAdapter) SearchCatalog(
	ctx context.Context,
	keywords []string,
	req domain.ScrapeRequest,
) ([]domain.Job, error) {
	return a.SearchBatch(ctx, keywords, req)
}

func (a *GreenhouseAdapter) SearchBatch(ctx context.Context, keywords []string, req domain.ScrapeRequest) ([]domain.Job, error) {
	rawJobs, err := a.fetchJobs(ctx, req)
	if err != nil {
		return nil, err
	}

	var jobs []domain.Job
	for _, j := range rawJobs {
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}

		matchedKeywords := make([]string, 0, len(keywords))
		for _, keyword := range keywords {
			keyword = strings.TrimSpace(keyword)
			if keyword != "" && a.matchesRequest(j, keyword, req) {
				matchedKeywords = append(matchedKeywords, keyword)
			}
		}
		if len(matchedKeywords) == 0 {
			continue
		}

		source := "Green House"
		jobs = append(jobs, domain.Job{
			ID:          greenhouseJobID(j),
			Title:       strings.TrimSpace(j.Title),
			Description: greenhouseDescription(j),
			Company:     a.companyName,
			Location:    greenhouseLocation(j),
			URL:         strings.TrimSpace(j.AbsoluteURL),
			Modality:    greenhouseModality(j),
			PostedAt:    strings.TrimSpace(j.UpdatedAt),
			Source:      source,
			Sources:     []string{source},
			Keyword:     matchedKeywords[0],
			Keywords:    matchedKeywords,
		})
	}

	return jobs, nil
}

func (a *GreenhouseAdapter) fetchJobs(ctx context.Context, req domain.ScrapeRequest) ([]greenhouseListJob, error) {
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

	listCtx, cancel := context.WithTimeout(ctx, pageTimeout)
	defer cancel()

	endpoint := fmt.Sprintf("https://boards-api.greenhouse.io/v1/boards/%s/jobs?content=true", a.boardToken)

	listReq, err := http.NewRequestWithContext(listCtx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	listReq.Header.Set("User-Agent", "JobsScraper/1.0")
	listReq.Header.Set("Accept", "application/json")

	resp, err := a.client.Do(listReq)
	if err != nil {
		a.cachedJobs = nil
		a.cacheErr = err
		a.loaded = true
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		err := fmt.Errorf("greenhouse: status inesperado %d para board '%s'", resp.StatusCode, a.boardToken)
		a.cachedJobs = nil
		a.cacheErr = err
		a.loaded = true
		return nil, err
	}

	var data greenhouseListResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		a.cachedJobs = nil
		a.cacheErr = err
		a.loaded = true
		return nil, err
	}

	a.cachedJobs = data.Jobs
	a.cacheErr = nil
	a.loaded = true

	return data.Jobs, nil
}

func (a *GreenhouseAdapter) matchesRequest(job greenhouseListJob, keyword string, req domain.ScrapeRequest) bool {
	if lang := strings.TrimSpace(req.SearchLanguage); lang != "" {
		if job.Language != "" && !strings.EqualFold(job.Language, lang) {
			return false
		}
	}

	if keyword != "" && !matchesGreenhouseKeyword(greenhouseSearchText(job), keyword) {
		return false
	}

	if req.RemoteOnly && !greenhouseIsRemote(job) {
		return false
	}

	if location := strings.TrimSpace(req.SearchLocation); location != "" && !greenhouseIsRemote(job) {
		if !containsNormalized(greenhouseLocation(job), location) && !containsNormalized(greenhouseSearchText(job), location) {
			return false
		}
	}

	return true
}

func greenhouseSearchText(job greenhouseListJob) string {
	parts := []string{
		job.Title,
		job.Content,
		job.Location.Name,
		job.Language,
		job.RequisitionID,
	}

	for _, department := range job.Departments {
		parts = append(parts, department.Name)
	}
	for _, office := range job.Offices {
		parts = append(parts, office.Name, office.Location)
	}
	for _, metadata := range job.Metadata {
		parts = append(parts, metadata.Name, fmt.Sprint(metadata.Value))
	}

	return strings.Join(parts, " ")
}

func greenhouseJobID(job greenhouseListJob) string {
	if job.AbsoluteURL != "" {
		return strings.TrimSpace(job.AbsoluteURL)
	}
	if job.ID != 0 {
		return fmt.Sprintf("greenhouse:%d", job.ID)
	}
	return strings.TrimSpace(job.Title)
}

func greenhouseDescription(job greenhouseListJob) string {
	sections := []string{cleanGreenhouseHTML(job.Content)}

	departments := greenhouseDepartmentNames(job)
	if len(departments) > 0 {
		sections = append(sections, "Departamentos: "+strings.Join(departments, ", "))
	}

	offices := greenhouseOfficeNames(job)
	if len(offices) > 0 {
		sections = append(sections, "Escritórios: "+strings.Join(offices, ", "))
	}

	metadata := greenhouseMetadataPairs(job)
	if len(metadata) > 0 {
		sections = append(sections, "Metadados: "+strings.Join(metadata, "; "))
	}

	return strings.Join(adapterutil.NonEmptyStrings(sections), "\n\n")
}

func greenhouseDepartmentNames(job greenhouseListJob) []string {
	names := make([]string, 0, len(job.Departments))
	for _, department := range job.Departments {
		names = append(names, department.Name)
	}
	return adapterutil.UniqueTrimmedStrings(names)
}

func greenhouseOfficeNames(job greenhouseListJob) []string {
	names := make([]string, 0, len(job.Offices))
	for _, office := range job.Offices {
		names = append(names, strings.Join(adapterutil.NonEmptyStrings([]string{office.Name, office.Location}), " - "))
	}
	return adapterutil.UniqueTrimmedStrings(names)
}

func greenhouseMetadataPairs(job greenhouseListJob) []string {
	pairs := make([]string, 0, len(job.Metadata))
	for _, metadata := range job.Metadata {
		name := strings.TrimSpace(metadata.Name)
		value := strings.TrimSpace(fmt.Sprint(metadata.Value))
		if name == "" || value == "" || value == "<nil>" {
			continue
		}
		pairs = append(pairs, name+": "+value)
	}
	return adapterutil.UniqueTrimmedStrings(pairs)
}

func greenhouseLocation(job greenhouseListJob) string {
	locations := []string{job.Location.Name}
	for _, office := range job.Offices {
		locations = append(locations, office.Location, office.Name)
	}
	return strings.Join(adapterutil.UniqueTrimmedStrings(locations), " | ")
}

func greenhouseModality(job greenhouseListJob) string {
	text := normalizeGreenhouseText(greenhouseSearchText(job))
	switch {
	case strings.Contains(text, "hybrid") || strings.Contains(text, "hibrido"):
		return "Híbrido"
	case greenhouseIsRemote(job):
		return "Remoto"
	case strings.Contains(text, "onsite") || strings.Contains(text, "on site") || strings.Contains(text, "presencial"):
		return "Presencial"
	default:
		return ""
	}
}

func greenhouseIsRemote(job greenhouseListJob) bool {
	text := normalizeGreenhouseText(strings.Join([]string{
		job.Location.Name,
		greenhouseSearchText(job),
	}, " "))

	return strings.Contains(text, "remote") ||
		strings.Contains(text, "remoto") ||
		strings.Contains(text, "anywhere") ||
		strings.Contains(text, "worldwide") ||
		strings.Contains(text, "global")
}

func cleanGreenhouseHTML(value string) string {
	value = html.UnescapeString(value)
	value = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`).ReplaceAllString(value, " ")
	value = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`).ReplaceAllString(value, " ")
	value = regexp.MustCompile(`(?s)<[^>]+>`).ReplaceAllString(value, " ")
	value = html.UnescapeString(value)
	return strings.Join(strings.Fields(value), " ")
}

func containsNormalized(text, query string) bool {
	return strings.Contains(normalizeGreenhouseText(text), normalizeGreenhouseText(query))
}

func matchesGreenhouseKeyword(text, keyword string) bool {
	normalizedText := " " + normalizeGreenhouseText(text) + " "
	terms := strings.Fields(normalizeGreenhouseText(keyword))
	if len(terms) == 0 {
		return true
	}

	for _, term := range terms {
		if term == "go" {
			if strings.Contains(normalizedText, " go ") || strings.Contains(normalizedText, " golang ") {
				continue
			}
			return false
		}
		if !strings.Contains(normalizedText, " "+term+" ") {
			return false
		}
	}

	return true
}

func normalizeGreenhouseText(value string) string {
	value = strings.ToLower(html.UnescapeString(value))
	value = strings.ReplaceAll(value, "/", " ")
	value = strings.ReplaceAll(value, "-", " ")
	return strings.Join(strings.Fields(value), " ")
}

func FetchGreenhouseSlugs(ctx context.Context) ([]string, error) {

	filename := os.Getenv("GREENHOUSE_COMPANIES_FILE")
	if filename == "" {
		filename = "./internal/interfaces/greenhouseCompanies.json"
	}

	data, err := os.ReadFile(filename)
	if err != nil {
		return nil, fmt.Errorf("não foi possível ler o arquivo %s: %w", filename, err)
	}

	var slugs []string
	if err := json.Unmarshal(data, &slugs); err != nil {
		return nil, fmt.Errorf("erro ao processar o JSON de empresas: %w", err)
	}

	slog.Info("Slugs da Greenhouse carregados com sucesso", "total", len(slugs))

	return slugs, nil
}

func BuildGreenhouseAdapters(ctx context.Context) ([]ports.JobSource, error) {
	slugs, err := FetchGreenhouseSlugs(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]ports.JobSource, 0, len(slugs))
	for _, slug := range slugs {
		slug = strings.TrimSpace(slug)
		if slug == "" {
			continue
		}
		result = append(result, NewGreenhouse(slug, slug))
	}

	return result, nil
}
