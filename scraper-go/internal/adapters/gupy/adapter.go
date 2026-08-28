package gupy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/adapterutil"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
)

const (
	gupyDefaultBaseURL    = "https://employability-portal.gupy.io/api/v1/jobs"
	gupyDefaultPageLimit  = 100
	gupyDefaultMaxOffset  = 10000
	gupyDefaultQueryLimit = 60
)

type GupyAdapter struct {
	client          *http.Client
	baseURL         string
	pageLimit       int
	maxOffset       int
	mu              sync.Mutex
	nextQueryOffset int
}

type gupyResponse struct {
	Data []gupyJob `json:"data"`
}

type gupyJob struct {
	ID             any    `json:"id"`
	Name           string `json:"name"`
	CareerPageName string `json:"careerPageName"`
	CareerPageURL  string `json:"careerPageUrl"`
	JobURL         string `json:"jobUrl"`
	City           string `json:"city"`
	State          string `json:"state"`
	Country        string `json:"country"`
	WorkplaceType  string `json:"workplaceType"`
	IsRemoteWork   bool   `json:"isRemoteWork"`
	PublishedDate  string `json:"publishedDate"`
	Description    string `json:"description"`
}

type gupyHTTPError struct {
	statusCode int
	keyword    string
	offset     int
}

func (e *gupyHTTPError) Error() string {
	return fmt.Sprintf("gupy: status inesperado %d para keyword %q offset %d", e.statusCode, e.keyword, e.offset)
}

func (e *gupyHTTPError) StatusCode() int {
	return e.statusCode
}

func NewGupy() *GupyAdapter {
	return &GupyAdapter{
		client: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		baseURL:   gupyDefaultBaseURL,
		pageLimit: gupyDefaultPageLimit,
		maxOffset: gupyDefaultMaxOffset,
	}
}

func (a *GupyAdapter) SourceName() string {
	return "Gupy"
}

func (a *GupyAdapter) Capabilities() ports.SourceCapabilities {
	return ports.SourceCapabilities{
		Provider: ports.ProviderGupy,
		Mode:     ports.DiscoveryBatch,
	}
}

func (a *GupyAdapter) Search(ctx context.Context, keyword string, req domain.ScrapeRequest) ([]domain.Job, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return nil, nil
	}

	return a.SearchBatch(ctx, []string{keyword}, req)
}

func (a *GupyAdapter) SearchBatch(ctx context.Context, keywords []string, req domain.ScrapeRequest) ([]domain.Job, error) {
	queryKeywords := gupyExpandedQueries(keywords, req)
	if len(queryKeywords) == 0 {
		return nil, nil
	}

	queries := make([]string, 0, len(queryKeywords))
	for query := range queryKeywords {
		queries = append(queries, query)
	}
	sort.Strings(queries)
	queries = a.nextQuerySlot(queries, gupyQueryLimit())

	type collectedJob struct {
		raw      gupyJob
		keywords []string
	}

	collected := make(map[string]collectedJob)
	order := make([]string, 0)
	for _, query := range queries {
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}
		rawJobs, err := a.fetchAll(ctx, query, req)
		if err != nil {
			if cause := context.Cause(ctx); cause != nil {
				return nil, cause
			}
			slog.Warn("gupy: query ignorada por erro",
				"query", query,
				"error", err,
			)
			continue
		}

		for _, raw := range rawJobs {
			if !gupyMatchesRequest(raw, req) {
				continue
			}

			job := gupyToJob(raw, queryKeywords[query])
			if job.URL == "" || job.Title == "" {
				continue
			}
			if !gupyLooksLikeTechnologyJob(job, queryKeywords[query]) {
				continue
			}

			key := gupyDedupeKey(raw)
			if key == "" {
				key = job.URL
			}

			current, ok := collected[key]
			if !ok {
				collected[key] = collectedJob{raw: raw, keywords: queryKeywords[query]}
				order = append(order, key)
				continue
			}

			current.keywords = adapterutil.UniqueTrimmedStrings(append(current.keywords, queryKeywords[query]...))
			collected[key] = current
		}
	}

	jobs := make([]domain.Job, 0, len(order))
	for _, key := range order {
		collectedJob := collected[key]
		keywords := adapterutil.UniqueTrimmedStrings(collectedJob.keywords)
		if len(keywords) == 0 {
			continue
		}
		jobs = append(jobs, gupyToJob(collectedJob.raw, keywords))
	}

	return jobs, nil
}

func gupyQueryLimit() int {
	value := strings.TrimSpace(os.Getenv("GUPY_QUERY_LIMIT"))
	if value == "" {
		return gupyDefaultQueryLimit
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return gupyDefaultQueryLimit
	}
	return parsed
}

func (a *GupyAdapter) nextQuerySlot(queries []string, limit int) []string {
	if len(queries) == 0 {
		return nil
	}
	if limit <= 0 || limit >= len(queries) {
		return queries
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	offset := a.nextQueryOffset % len(queries)
	a.nextQueryOffset = (offset + limit) % len(queries)

	slot := make([]string, 0, limit)
	for i := 0; i < limit; i++ {
		slot = append(slot, queries[(offset+i)%len(queries)])
	}

	slog.Info("gupy: usando slot rotativo de queries",
		"selected", len(slot),
		"total", len(queries),
	)

	return slot
}

func (a *GupyAdapter) fetchAll(ctx context.Context, keyword string, req domain.ScrapeRequest) ([]gupyJob, error) {
	limit := a.pageLimit
	if limit <= 0 {
		limit = gupyDefaultPageLimit
	}

	maxOffset := a.maxOffset
	if maxOffset <= 0 {
		maxOffset = gupyDefaultMaxOffset
	}

	all := make([]gupyJob, 0, limit)
	for offset := 0; offset <= maxOffset; offset += limit {
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}
		page, err := a.fetchPageWithRetry(ctx, keyword, offset, limit, req)
		if err != nil {
			if gupyIsFullSweepEnd(err, keyword, offset) {
				break
			}
			return nil, err
		}
		all = append(all, page...)
		if len(page) < limit {
			break
		}
	}

	return all, nil
}

func (a *GupyAdapter) fetchPageWithRetry(ctx context.Context, keyword string, offset, limit int, req domain.ScrapeRequest) ([]gupyJob, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		page, err := a.fetchPage(ctx, keyword, offset, limit, req)
		if err == nil {
			return page, nil
		}
		lastErr = err

		if !gupyIsRetryable(err) {
			return nil, err
		}

		timer := time.NewTimer(time.Duration(250*(attempt+1)) * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}

	return nil, lastErr
}

func gupyIsRetryable(err error) bool {
	if err == nil {
		return false
	}

	var httpErr *gupyHTTPError
	if errors.As(err, &httpErr) {
		return httpErr.StatusCode() >= 500
	}

	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return true
	}

	var netErr net.Error
	return errors.As(err, &netErr)
}

func gupyIsFullSweepEnd(err error, keyword string, offset int) bool {
	if strings.TrimSpace(keyword) != "" || offset == 0 {
		return false
	}

	var httpErr *gupyHTTPError
	if !errors.As(err, &httpErr) {
		return false
	}

	return httpErr.StatusCode() == http.StatusBadRequest
}

func (a *GupyAdapter) fetchPage(ctx context.Context, keyword string, offset, limit int, req domain.ScrapeRequest) ([]gupyJob, error) {
	pageTimeout := time.Duration(req.PageTimeoutMs) * time.Millisecond
	if pageTimeout <= 0 {
		pageTimeout = 15 * time.Second
	}

	pageCtx, cancel := context.WithTimeout(ctx, pageTimeout)
	defer cancel()

	endpoint, err := gupySearchURL(a.baseURL, keyword, offset, limit, req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(pageCtx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("gupy: build request: %w", err)
	}
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("User-Agent", "JobsScraper/1.0")

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("gupy: http do: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, &gupyHTTPError{statusCode: resp.StatusCode, keyword: keyword, offset: offset}
	}

	var data gupyResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("gupy: decode json: %w", err)
	}

	return data.Data, nil
}

func gupySearchURL(baseURL, keyword string, offset, limit int, req domain.ScrapeRequest) (string, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("gupy: parse base url: %w", err)
	}

	q := u.Query()
	if strings.TrimSpace(keyword) != "" {
		q.Set("jobName", keyword)
	}
	if req.RemoteOnly {
		q.Set("workplaceType", "remote")
	}
	q.Set("offset", fmt.Sprint(offset))
	q.Set("limit", fmt.Sprint(limit))
	u.RawQuery = q.Encode()

	return u.String(), nil
}

func gupyMatchesRequest(job gupyJob, req domain.ScrapeRequest) bool {
	if req.RemoteOnly && !gupyIsRemote(job) {
		return false
	}

	if location := strings.TrimSpace(req.SearchLocation); location != "" && !gupyIsRemote(job) {
		if !adapterutil.ContainsNormalized(gupyLocation(job), location) {
			return false
		}
	}

	return true
}

func gupyToJob(job gupyJob, keywords []string) domain.Job {
	source := "Gupy"
	keyword := ""
	if len(keywords) > 0 {
		keyword = keywords[0]
	}

	return domain.Job{
		ID:          gupyJobID(job),
		Title:       strings.TrimSpace(job.Name),
		Company:     strings.TrimSpace(job.CareerPageName),
		Location:    gupyLocation(job),
		URL:         gupyURL(job),
		Modality:    gupyModality(job),
		Description: strings.TrimSpace(job.Description),
		PostedAt:    strings.TrimSpace(job.PublishedDate),
		Source:      source,
		Sources:     []string{source},
		Keyword:     keyword,
		Keywords:    keywords,
	}
}

func gupyJobID(job gupyJob) string {
	if job.ID != nil {
		if id := strings.TrimSpace(fmt.Sprint(job.ID)); id != "" {
			return "gupy:" + id
		}
	}
	if u := gupyURL(job); u != "" {
		return u
	}
	return strings.TrimSpace(job.Name)
}

func gupyDedupeKey(job gupyJob) string {
	if job.ID != nil {
		if id := strings.TrimSpace(fmt.Sprint(job.ID)); id != "" {
			return id
		}
	}
	return gupyURL(job)
}

func gupyURL(job gupyJob) string {
	if job.JobURL != "" {
		return strings.TrimSpace(job.JobURL)
	}
	return strings.TrimSpace(job.CareerPageURL)
}

func gupyLocation(job gupyJob) string {
	return strings.Join(adapterutil.NonEmptyStrings([]string{
		job.City,
		job.State,
		job.Country,
	}), " / ")
}

func gupyModality(job gupyJob) string {
	workplaceType := strings.TrimSpace(job.WorkplaceType)
	normalized := adapterutil.NormalizeText(workplaceType)

	switch {
	case job.IsRemoteWork || strings.Contains(normalized, "remote") || strings.Contains(normalized, "remoto"):
		return "Remoto"
	case strings.Contains(normalized, "hybrid") || strings.Contains(normalized, "hibrido"):
		return "Híbrido"
	case strings.Contains(normalized, "onsite") || strings.Contains(normalized, "on site"):
		return "Presencial"
	default:
		return workplaceType
	}
}

func gupyIsRemote(job gupyJob) bool {
	return gupyModality(job) == "Remoto"
}

func gupyExpandedQueries(keywords []string, req domain.ScrapeRequest) map[string][]string {
	out := make(map[string][]string)
	for _, keyword := range keywords {
		keyword = strings.TrimSpace(keyword)
		if keyword == "" {
			continue
		}

		for _, query := range gupyQueryVariants(keyword) {
			query = strings.TrimSpace(query)
			if query == "" {
				continue
			}
			out[query] = adapterutil.UniqueTrimmedStrings(append(out[query], keyword))
		}
	}

	if gupyRawDiscoveryEnabled() && gupyLooksLikeTechnologySearch(keywords) {
		for _, query := range gupyRawDiscoveryQueries() {
			out[query] = adapterutil.UniqueTrimmedStrings(append(out[query], query))
		}
	}

	if gupyFullSweepEnabled() && gupyLooksLikeTechnologySearch(keywords) {
		fullSweepKeyword := "gupy:full-sweep"
		if req.RemoteOnly {
			fullSweepKeyword = "gupy:remote-full-sweep"
		}
		out[""] = adapterutil.UniqueTrimmedStrings(append(out[""], fullSweepKeyword))
	}

	return out
}

func gupyRawDiscoveryEnabled() bool {
	value := strings.TrimSpace(os.Getenv("GUPY_RAW_DISCOVERY_ENABLED"))
	if value == "" {
		return true
	}

	return !strings.EqualFold(value, "false")
}

func gupyFullSweepEnabled() bool {
	value := strings.TrimSpace(os.Getenv("GUPY_FULL_SWEEP_ENABLED"))
	if value != "" {
		return !strings.EqualFold(value, "false")
	}

	value = strings.TrimSpace(os.Getenv("GUPY_FULL_REMOTE_SWEEP_ENABLED"))
	if value == "" {
		return true
	}

	return !strings.EqualFold(value, "false")
}

func gupyLooksLikeTechnologySearch(keywords []string) bool {
	text := adapterutil.NormalizeText(strings.Join(keywords, " "))
	signals := []string{
		"software", "developer", "desenvolvedor", "backend", "frontend", "full stack",
		"mobile", "engineer", "engenheiro", "devops", "data", "dados", "qa", "tech",
		"java", "python", "php", "javascript", "typescript", "node", "react", "angular",
		"vue", "golang", "kotlin", "swift", "flutter", "cloud", "aws", "azure", "gcp",
	}

	for _, signal := range signals {
		if strings.Contains(text, signal) {
			return true
		}
	}

	return false
}

func gupyRawDiscoveryQueries() []string {
	return []string{
		"software",
		"desenvolvedor",
		"desenvolvedora",
		"engenheiro de software",
		"engenheira de software",
		"programador",
		"programadora",
		"backend",
		"back end",
		"frontend",
		"front end",
		"full stack",
		"fullstack",
		"mobile",
		"dados",
		"data",
		"business intelligence",
		"analytics",
		"devops",
		"sre",
		"cloud",
		"qa",
		"quality assurance",
		"automação",
		"segurança da informação",
		"cybersecurity",
		"java",
		"spring boot",
		"python",
		"django",
		"fastapi",
		"php",
		"laravel",
		"javascript",
		"typescript",
		"node",
		"node.js",
		"nestjs",
		"react",
		"next.js",
		"react native",
		"angular",
		"vue",
		"golang",
		"kotlin",
		"swift",
		"flutter",
		"ruby",
		"rails",
		".net",
		"dotnet",
		"c#",
		"kubernetes",
		"aws",
		"azure",
		"gcp",
	}
}

func gupyLooksLikeTechnologyJob(job domain.Job, _ []string) bool {
	title := adapterutil.NormalizeText(job.Title)
	description := adapterutil.NormalizeText(job.Description)

	if title == "" {
		return false
	}

	if gupyIsNonConcreteOpening(title) {
		return false
	}

	if gupyHasHardNegativeTitle(title) {
		return false
	}

	if gupyHasStrongTechnologyRole(title) {
		return true
	}

	if gupyHasTechnologySignal(title) && gupyHasRoleSignal(title) {
		return true
	}

	if gupyHasGenericTechnologyTitle(title) {
		combined := strings.Join(adapterutil.NonEmptyStrings([]string{title, description}), " ")
		if gupyHasStrongTechnologyRole(combined) || gupyHasTechnologySignal(combined) {
			return true
		}
	}

	return false
}

func gupyIsNonConcreteOpening(title string) bool {
	terms := []string{
		"banco de talentos",
		"talent pool",
		"cadastro reserva",
	}

	for _, term := range terms {
		if adapterutil.ContainsNormalized(title, term) {
			return true
		}
	}

	return false
}

func gupyHasHardNegativeTitle(title string) bool {
	if gupyHasStrongTechnologyRole(title) || (gupyHasTechnologySignal(title) && gupyHasRoleSignal(title)) {
		return false
	}

	hardNegativeTerms := []string{
		"motorista", "motorista de van", "atendente", "operador", "operadora",
		"promotor", "promotora", "vendedor", "vendedora", "recepcionista",
		"auxiliar", "assistente", "estagiario administrativo",
		"analista qualidade", "analista de qualidade",
	}

	for _, term := range hardNegativeTerms {
		if adapterutil.ContainsNormalized(title, term) {
			return true
		}
	}

	return false
}

func gupyHasStrongTechnologyRole(text string) bool {
	strongTerms := []string{
		"software engineer", "software developer", "engenheiro de software",
		"engenheira de software", "arquiteto de software", "arquiteta de software",
		"software architect", "desenvolvedor", "desenvolvedora",
		"programador", "programadora", "backend", "back end", "frontend",
		"front end", "full stack", "fullstack", "mobile developer",
		"desenvolvedor mobile", "devops", "site reliability", "sre",
		"data engineer", "data analyst", "analytics engineer",
		"engenheiro de dados", "cientista de dados", "analista de dados",
		"qa engineer", "analista qa", "quality assurance", "sdet",
		"security engineer", "engenheiro de seguranca", "cloud engineer",
		"platform engineer", "go engineer", "tech lead", "technical lead",
	}

	for _, term := range strongTerms {
		if adapterutil.ContainsNormalized(text, term) {
			return true
		}
	}

	return false
}

func gupyHasGenericTechnologyTitle(title string) bool {
	terms := []string{
		"analista de sistemas",
		"arquiteto de software",
		"arquiteta de software",
		"software",
		"tecnologia da informacao",
	}

	for _, term := range terms {
		if adapterutil.ContainsNormalized(title, term) {
			return true
		}
	}

	return false
}

func gupyHasTechnologySignal(text string) bool {
	terms := []string{
		"java", "spring", "python", "django", "fastapi", "php", "laravel",
		"symfony", "javascript", "typescript", "node", "nodejs", "node js",
		"nestjs", "react", "nextjs", "next js", "react native", "angular",
		"vue", "golang", "kotlin", "swift", "flutter", "ruby", "rails",
		"dotnet", "csharp", "kubernetes", "docker", "aws", "azure", "gcp",
		"terraform", "postgresql", "mysql", "mongodb", "redis", "kafka",
	}

	for _, term := range terms {
		if adapterutil.ContainsNormalized(text, term) {
			return true
		}
	}

	return false
}

func gupyHasRoleSignal(text string) bool {
	terms := []string{
		"developer", "desenvolvedor", "desenvolvedora", "engineer",
		"engenheiro", "engenheira", "programador", "programadora",
		"analista de sistemas", "analista desenvolvedor",
	}

	for _, term := range terms {
		if adapterutil.ContainsNormalized(text, term) {
			return true
		}
	}

	return false
}

func gupyQueryVariants(keyword string) []string {
	normalized := adapterutil.NormalizeText(keyword)
	var variants []string
	add := func(values ...string) {
		for _, value := range values {
			value = strings.TrimSpace(value)
			if value != "" {
				variants = append(variants, value)
			}
		}
	}

	add(keyword)

	switch normalized {
	case "software engineer", "software developer", "desenvolvedor de software":
		add("software developer", "software engineer", "desenvolvedor de software", "engenheiro de software")
	case "developer", "desenvolvedor":
		add("developer", "desenvolvedor")
	case "backend developer", "backend engineer", "desenvolvedor backend":
		add("backend developer", "backend engineer", "desenvolvedor backend", "desenvolvedor back end")
	case "frontend developer", "frontend engineer", "front end developer", "desenvolvedor frontend":
		add("frontend developer", "front-end developer", "desenvolvedor frontend", "desenvolvedor front end")
	case "full stack developer":
		add("full stack developer", "fullstack developer", "desenvolvedor full stack", "desenvolvedor fullstack")
	case "mobile developer":
		add("mobile developer", "desenvolvedor mobile")
	case "platform engineer":
		add("platform engineer", "engenheiro de plataforma")
	case "devops engineer":
		add("devops engineer", "devops", "engenheiro devops")
	case "data engineer":
		add("data engineer", "engenheiro de dados")
	case "qa engineer":
		add("qa engineer", "quality assurance", "analista de qa", "analista qa", "tester")
	case "tech lead":
		add("tech lead", "technical lead", "lider tecnico", "líder técnico")
	case "engineering manager":
		add("engineering manager", "gerente de engenharia")
	case "site reliability engineer":
		add("site reliability engineer", "sre", "engenheiro de confiabilidade")
	case "security engineer":
		add("security engineer", "engenheiro de segurança", "seguranca da informacao", "segurança da informação")
	case "automation engineer":
		add("automation engineer", "engenheiro de automação", "automacao")
	case "sdet":
		add("sdet", "software development engineer in test")
	}

	addTechnologyVariants(normalized, add)

	return adapterutil.UniqueTrimmedStrings(variants)
}

func addTechnologyVariants(normalized string, add func(...string)) {
	technologies := map[string][]string{
		"java developer":         {"java developer", "desenvolvedor java", "java"},
		"spring boot developer":  {"spring boot developer", "desenvolvedor spring boot", "spring boot"},
		"python developer":       {"python developer", "desenvolvedor python", "python"},
		"django developer":       {"django developer", "desenvolvedor django", "django"},
		"fastapi developer":      {"fastapi developer", "desenvolvedor fastapi", "fastapi"},
		"php developer":          {"php developer", "desenvolvedor php", "php"},
		"laravel developer":      {"laravel developer", "desenvolvedor laravel", "laravel"},
		"symfony developer":      {"symfony developer", "desenvolvedor symfony", "symfony"},
		"javascript developer":   {"javascript developer", "desenvolvedor javascript", "javascript"},
		"typescript developer":   {"typescript developer", "desenvolvedor typescript", "typescript"},
		"node developer":         {"node developer", "node.js developer", "desenvolvedor node", "node.js", "nodejs"},
		"node.js developer":      {"node.js developer", "desenvolvedor node", "node.js", "nodejs"},
		"nestjs developer":       {"nestjs developer", "desenvolvedor nestjs", "nest.js", "nestjs"},
		"react developer":        {"react developer", "desenvolvedor react", "react"},
		"next.js developer":      {"next.js developer", "desenvolvedor next", "next.js", "nextjs"},
		"react native developer": {"react native developer", "desenvolvedor react native", "react native"},
		"angular developer":      {"angular developer", "desenvolvedor angular", "angular"},
		"vue developer":          {"vue developer", "desenvolvedor vue", "vue.js", "vuejs"},
		"golang developer":       {"golang developer", "desenvolvedor golang", "golang"},
		"go developer":           {"go developer", "desenvolvedor go", "golang"},
		"c# developer":           {"c# developer", "desenvolvedor c#", "c#"},
		".net developer":         {".net developer", "desenvolvedor .net", ".net", "dotnet"},
		"ruby developer":         {"ruby developer", "desenvolvedor ruby", "ruby"},
		"rails developer":        {"rails developer", "ruby on rails", "desenvolvedor rails"},
		"kotlin developer":       {"kotlin developer", "desenvolvedor kotlin", "kotlin"},
		"swift developer":        {"swift developer", "desenvolvedor swift", "swift"},
		"flutter developer":      {"flutter developer", "desenvolvedor flutter", "flutter"},
		"rust developer":         {"rust developer", "desenvolvedor rust", "rust"},
		"kubernetes engineer":    {"kubernetes engineer", "kubernetes", "k8s"},
		"cloud engineer":         {"cloud engineer", "engenheiro cloud", "cloud"},
		"aws engineer":           {"aws engineer", "engenheiro aws", "aws"},
		"azure engineer":         {"azure engineer", "engenheiro azure", "azure"},
		"gcp engineer":           {"gcp engineer", "engenheiro gcp", "google cloud"},
	}

	if variants, ok := technologies[normalized]; ok {
		add(variants...)
	}
}
