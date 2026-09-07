package inhire

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/adapterutil"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

const (
	inhireDefaultAPIURL         = "https://api.inhire.app/job-posts/public/pages"
	inhireDefaultTenantsFile    = "./internal/interfaces/inhireTenants.json"
	inhireDefaultDetailTimeout  = 10 * time.Second
	inhireDefaultDetailMaxBytes = int64(768 * 1024)
	inhireMaxDescriptionRunes   = 12000
)

type InHireAdapter struct {
	client      *http.Client
	apiURL      string
	tenantsFile string
}

type inhireTenant struct {
	Slug        string `json:"slug"`
	TenantName  string `json:"tenantName"`
	JobsCount   int    `json:"jobsCount"`
	ListCompany string `json:"listCompany"`
	SampleJobs  int    `json:"sampleJobs"`
}

type inhirePageResponse struct {
	TenantName string      `json:"tenantName"`
	About      string      `json:"about"`
	JobsPage   []inhireJob `json:"jobsPage"`
}

type inhireJob struct {
	DisplayName   string   `json:"displayName"`
	JobID         string   `json:"jobId"`
	Status        string   `json:"status"`
	WorkplaceType string   `json:"workplaceType"`
	Location      string   `json:"location"`
	CareerPageID  string   `json:"careerPageId"`
	CareerPageIDs []string `json:"careerPageIds"`
}

func NewInHire() *InHireAdapter {
	return &InHireAdapter{
		client: &http.Client{
			Timeout: 45 * time.Second,
			Transport: &http.Transport{
				MaxIdleConnsPerHost: 24,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		apiURL:      inhireDefaultAPIURL,
		tenantsFile: inhireDefaultTenantsFile,
	}
}

func (a *InHireAdapter) SourceName() string {
	return "InHire"
}

func (a *InHireAdapter) Capabilities() ports.SourceCapabilities {
	return ports.SourceCapabilities{
		Provider: ports.ProviderInHire,
		Mode:     ports.DiscoveryCatalog,
	}
}

func (a *InHireAdapter) Search(ctx context.Context, keyword string, req domain.ScrapeRequest) ([]domain.Job, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return nil, nil
	}

	return a.SearchBatch(ctx, []string{keyword}, req)
}

func (a *InHireAdapter) SearchCatalog(
	ctx context.Context,
	keywords []string,
	req domain.ScrapeRequest,
) ([]domain.Job, error) {
	return a.SearchBatch(ctx, keywords, req)
}

func (a *InHireAdapter) SearchBatch(ctx context.Context, keywords []string, req domain.ScrapeRequest) ([]domain.Job, error) {
	tenants, err := a.loadTenants()
	if err != nil {
		return nil, err
	}
	if len(tenants) == 0 {
		return nil, nil
	}

	rawJobs := a.fetchAllTenants(ctx, tenants, req)
	if cause := context.Cause(ctx); cause != nil {
		return nil, cause
	}
	jobs := make([]domain.Job, 0, len(rawJobs))
	var skippedStatus, skippedRemote int
	for _, job := range rawJobs {
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}
		if status := strings.TrimSpace(job.raw.Status); status != "" && !strings.EqualFold(status, "published") {
			skippedStatus++
			continue
		}
		if req.RemoteOnly && inhireModality(job.raw) != "Remoto" {
			skippedRemote++
			continue
		}

		matchedKeywords := inhireMatchingKeywords(job.raw, keywords)
		mapped := inhireToJob(job.tenant, job.raw, matchedKeywords)
		if mapped.Title == "" || mapped.URL == "" {
			continue
		}

		jobs = append(jobs, mapped)
	}

	if inhireDetailEnrichmentEnabled() {
		jobs = a.enrichJobsWithDetails(ctx, jobs, keywords)
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}
	}

	slog.Info("inhire: funil do adapter",
		"tenants_catalog", len(tenants),
		"jobs_raw", len(rawJobs),
		"skipped_status", skippedStatus,
		"skipped_remote", skippedRemote,
		"jobs_returned", len(jobs),
	)

	return jobs, nil
}

func (a *InHireAdapter) enrichJobsWithDetails(ctx context.Context, jobs []domain.Job, keywords []string) []domain.Job {
	if len(jobs) == 0 {
		return jobs
	}

	timeout := inhireDetailTimeout()
	eligible := make([]int, 0, len(jobs))
	for index := range jobs {
		if inhireShouldEnrichDetails(jobs[index], keywords) {
			eligible = append(eligible, index)
		}
	}
	if len(eligible) == 0 {
		return jobs
	}

	started := time.Now()
	var enriched, failed int
	for _, index := range eligible {
		if context.Cause(ctx) != nil {
			break
		}
		detail, err := a.fetchJobDetailText(ctx, jobs[index].URL, timeout)
		if err != nil {
			failed++
			continue
		}
		if detail != "" {
			jobs[index].Description = strings.Join(adapterutil.NonEmptyStrings([]string{
				jobs[index].Description,
				detail,
			}), "\n")
			jobs[index].Keywords = adapterutil.UniqueTrimmedStrings(append(jobs[index].Keywords, inhireMatchingKeywordsInText(detail, keywords)...))
			if jobs[index].Keyword == "" && len(jobs[index].Keywords) > 0 {
				jobs[index].Keyword = jobs[index].Keywords[0]
			}
			enriched++
		}
	}

	slog.Info("inhire: detalhes enriquecidos",
		"jobs_total", len(jobs),
		"eligible", len(eligible),
		"enriched", enriched,
		"failed", failed,
		"mode", "serial",
		"duration", time.Since(started).Round(time.Millisecond).String(),
	)

	return jobs
}

func (a *InHireAdapter) fetchJobDetailText(ctx context.Context, url string, timeout time.Duration) (string, error) {
	url = strings.TrimSpace(url)
	if url == "" {
		return "", nil
	}

	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("inhire: build detail request: %w", err)
	}
	httpReq.Header.Set("Accept", "text/html,application/xhtml+xml")
	httpReq.Header.Set("User-Agent", "JobsScraper/1.0")

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("inhire: detail http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("inhire: detail status inesperado %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, inhireDefaultDetailMaxBytes))
	if err != nil {
		return "", fmt.Errorf("inhire: read detail body: %w", err)
	}

	return inhireExtractDetailText(string(body)), nil
}

func inhireDetailEnrichmentEnabled() bool {
	value := strings.TrimSpace(os.Getenv("INHIRE_ENRICH_DETAILS"))
	if value == "" {
		return false
	}
	return strings.EqualFold(value, "true") || value == "1" || strings.EqualFold(value, "yes")
}

func inhireDetailTimeout() time.Duration {
	value := strings.TrimSpace(os.Getenv("INHIRE_DETAILS_TIMEOUT_MS"))
	if value == "" {
		return inhireDefaultDetailTimeout
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return inhireDefaultDetailTimeout
	}
	return time.Duration(parsed) * time.Millisecond
}

func inhireShouldEnrichDetails(job domain.Job, keywords []string) bool {
	if strings.TrimSpace(job.URL) == "" {
		return false
	}

	mode := strings.ToLower(strings.TrimSpace(os.Getenv("INHIRE_DETAILS_MODE")))
	if mode == "all" {
		return true
	}

	if inhireTitleLooksTechnical(job.Title) {
		return false
	}

	if len(job.Keywords) == 0 {
		return true
	}

	if len(strings.TrimSpace(job.Description)) < 80 {
		title := adapterutil.NormalizeText(job.Title)
		for _, keyword := range keywords {
			keyword = strings.TrimSpace(keyword)
			if keyword == "" {
				continue
			}
			if adapterutil.MatchesKeyword(title, keyword) || strings.Contains(title, adapterutil.NormalizeText(keyword)) {
				return false
			}
		}
		return true
	}

	return false
}

func inhireTitleLooksTechnical(title string) bool {
	text := " " + adapterutil.NormalizeText(title) + " "
	familyHints := []string{
		"backend", "front end", "frontend", "full stack", "fullstack",
		"developer", "desenvolvedor", "engineer", "engenheiro", "devops",
		"sre", "qa", "sdet", "software", "mobile", "android", "ios",
		"dados", "data", "cloud", "security", "seguranca",
	}
	technologyHints := []string{
		"java", "spring", "python", "django", "fastapi", "php", "laravel",
		"javascript", "typescript", "node", "nestjs", "react", "next js",
		"angular", "vue", "go", "golang", "csharp", "dotnet", "ruby",
		"rails", "kotlin", "swift", "flutter", "rust", "kubernetes",
		"docker", "terraform", "aws", "azure", "gcp", "sql",
	}

	hasFamily := false
	for _, hint := range familyHints {
		if strings.Contains(text, " "+hint+" ") {
			hasFamily = true
			break
		}
	}
	if !hasFamily {
		return false
	}

	for _, hint := range technologyHints {
		if strings.Contains(text, " "+hint+" ") {
			return true
		}
	}

	return false
}

func (a *InHireAdapter) loadTenants() ([]inhireTenant, error) {
	path := strings.TrimSpace(os.Getenv("INHIRE_TENANTS_FILE"))
	if path == "" {
		path = a.tenantsFile
	}
	if path == "" {
		path = inhireDefaultTenantsFile
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("inhire: leitura do arquivo '%s': %w", path, err)
	}

	var tenants []inhireTenant
	if err := json.Unmarshal(data, &tenants); err != nil {
		return nil, fmt.Errorf("inhire: parse do arquivo '%s': %w", path, err)
	}

	out := make([]inhireTenant, 0, len(tenants))
	seen := make(map[string]struct{}, len(tenants))
	for _, tenant := range tenants {
		tenant.Slug = strings.TrimSpace(tenant.Slug)
		tenant.TenantName = strings.TrimSpace(tenant.TenantName)
		if tenant.Slug == "" {
			continue
		}
		if _, ok := seen[tenant.Slug]; ok {
			continue
		}
		seen[tenant.Slug] = struct{}{}
		out = append(out, tenant)
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].Slug < out[j].Slug
	})

	return out, nil
}

type inhireTenantJob struct {
	tenant inhireTenant
	raw    inhireJob
}

func (a *InHireAdapter) fetchAllTenants(ctx context.Context, tenants []inhireTenant, req domain.ScrapeRequest) []inhireTenantJob {
	jobs := make([]inhireTenantJob, 0)
	var fetched, failed, withJobs int
	for _, tenant := range tenants {
		if context.Cause(ctx) != nil {
			return jobs
		}
		page, err := a.fetchTenant(ctx, tenant, req)
		if err != nil {
			failed++
			continue
		}
		if page.TenantName != "" {
			tenant.TenantName = strings.TrimSpace(page.TenantName)
		}
		fetched++
		if len(page.JobsPage) > 0 {
			withJobs++
		}
		for _, job := range page.JobsPage {
			jobs = append(jobs, inhireTenantJob{tenant: tenant, raw: job})
		}
	}

	slog.Info("inhire: tenants consultados",
		"tenants_catalog", len(tenants),
		"tenants_ok", fetched,
		"tenants_failed", failed,
		"tenants_with_jobs", withJobs,
		"jobs_raw", len(jobs),
	)

	return jobs
}

func (a *InHireAdapter) fetchTenant(ctx context.Context, tenant inhireTenant, req domain.ScrapeRequest) (inhirePageResponse, error) {
	pageTimeout := time.Duration(req.PageTimeoutMs) * time.Millisecond
	if pageTimeout <= 0 {
		pageTimeout = 20 * time.Second
	}

	reqCtx, cancel := context.WithTimeout(ctx, pageTimeout)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(reqCtx, http.MethodGet, a.apiURL, nil)
	if err != nil {
		return inhirePageResponse{}, fmt.Errorf("inhire: build request: %w", err)
	}
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Inhire-Client", "web-inhire")
	httpReq.Header.Set("X-Tenant", tenant.Slug)
	httpReq.Header.Set("User-Agent", "JobsScraper/1.0")

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return inhirePageResponse{}, fmt.Errorf("inhire: http do tenant %q: %w", tenant.Slug, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return inhirePageResponse{}, fmt.Errorf("inhire: status inesperado %d para tenant %q", resp.StatusCode, tenant.Slug)
	}

	var page inhirePageResponse
	if err := json.NewDecoder(resp.Body).Decode(&page); err != nil {
		return inhirePageResponse{}, fmt.Errorf("inhire: decode tenant %q: %w", tenant.Slug, err)
	}

	return page, nil
}

func inhireMatchesFilters(job inhireJob, req domain.ScrapeRequest) bool {
	if status := strings.TrimSpace(job.Status); status != "" && !strings.EqualFold(status, "published") {
		return false
	}

	if req.RemoteOnly && inhireModality(job) != "Remoto" {
		return false
	}

	if location := strings.TrimSpace(req.SearchLocation); location != "" && inhireModality(job) != "Remoto" {
		if !adapterutil.ContainsNormalized(inhireLocation(job), location) {
			return false
		}
	}

	return true
}

func inhireToJob(tenant inhireTenant, job inhireJob, keywords []string) domain.Job {
	source := "InHire"
	keyword := ""
	if len(keywords) > 0 {
		keyword = keywords[0]
	}

	company := strings.TrimSpace(tenant.TenantName)
	if company == "" {
		company = strings.TrimSpace(tenant.Slug)
	}

	return domain.Job{
		ID:       inhireJobID(tenant, job),
		Title:    strings.TrimSpace(job.DisplayName),
		Company:  company,
		Location: inhireLocation(job),
		URL:      inhireURL(tenant, job),
		Modality: inhireModality(job),
		Description: strings.Join(adapterutil.NonEmptyStrings([]string{
			strings.TrimSpace(job.Status),
			strings.TrimSpace(job.WorkplaceType),
			strings.TrimSpace(job.CareerPageID),
		}), "\n"),
		Source:   source,
		Sources:  []string{source},
		Keyword:  keyword,
		Keywords: keywords,
	}
}

func inhireJobID(tenant inhireTenant, job inhireJob) string {
	if job.JobID != "" {
		return "inhire:" + strings.TrimSpace(tenant.Slug) + ":" + strings.TrimSpace(job.JobID)
	}
	return inhireURL(tenant, job)
}

func inhireURL(tenant inhireTenant, job inhireJob) string {
	if tenant.Slug == "" || job.JobID == "" {
		return ""
	}

	return fmt.Sprintf(
		"https://%s.inhire.app/vagas/%s/%s",
		strings.TrimSpace(tenant.Slug),
		strings.TrimSpace(job.JobID),
		inhireSlugify(job.DisplayName),
	)
}

func inhireLocation(job inhireJob) string {
	return strings.TrimSpace(job.Location)
}

func inhireModality(job inhireJob) string {
	normalized := adapterutil.NormalizeText(job.WorkplaceType)
	switch {
	case strings.Contains(normalized, "remote") || strings.Contains(normalized, "remoto"):
		return "Remoto"
	case strings.Contains(normalized, "hybrid") || strings.Contains(normalized, "hibrido"):
		return "Híbrido"
	case strings.Contains(normalized, "on site") || strings.Contains(normalized, "onsite") || strings.Contains(normalized, "presencial"):
		return "Presencial"
	default:
		return strings.TrimSpace(job.WorkplaceType)
	}
}

func inhireMatchingKeywords(job inhireJob, keywords []string) []string {
	text := adapterutil.NormalizeText(strings.Join([]string{
		job.DisplayName,
		job.WorkplaceType,
		job.Location,
	}, " "))

	matched := make([]string, 0, len(keywords))
	for _, keyword := range keywords {
		keyword = strings.TrimSpace(keyword)
		if keyword == "" {
			continue
		}
		if adapterutil.MatchesKeyword(text, keyword) || strings.Contains(text, adapterutil.NormalizeText(keyword)) {
			matched = append(matched, keyword)
		}
	}

	return adapterutil.UniqueTrimmedStrings(matched)
}

func inhireMatchingKeywordsInText(text string, keywords []string) []string {
	normalizedText := inhireNormalizeKeywordText(text)
	matched := make([]string, 0, len(keywords))
	for _, keyword := range keywords {
		keyword = strings.TrimSpace(keyword)
		if keyword == "" {
			continue
		}
		if inhireTextMatchesKeyword(normalizedText, keyword) {
			matched = append(matched, keyword)
		}
	}
	return adapterutil.UniqueTrimmedStrings(matched)
}

func inhireTextMatchesKeyword(normalizedText, keyword string) bool {
	terms := strings.Fields(inhireNormalizeKeywordText(keyword))
	if len(terms) == 0 {
		return true
	}
	searchText := " " + normalizedText + " "
	for _, term := range terms {
		if term == "go" {
			if strings.Contains(searchText, " go ") || strings.Contains(searchText, " golang ") {
				continue
			}
			return false
		}
		if !strings.Contains(searchText, " "+term+" ") {
			return false
		}
	}
	return true
}

func inhireNormalizeKeywordText(value string) string {
	value = strings.ToLower(html.UnescapeString(value))
	replacer := strings.NewReplacer(
		"/", " ",
		"-", " ",
		".", " ",
		",", " ",
		":", " ",
		";", " ",
		"(", " ",
		")", " ",
		"[", " ",
		"]", " ",
		"{", " ",
		"}", " ",
	)
	return strings.Join(strings.Fields(replacer.Replace(value)), " ")
}

var (
	inhireJSONScriptPattern  = regexp.MustCompile(`(?is)<script[^>]*(?:id=["']__NEXT_DATA__["']|type=["']application/json["'])[^>]*>(.*?)</script>`)
	inhireScriptStylePattern = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>`)
	inhireTagPattern         = regexp.MustCompile(`(?is)<[^>]+>`)
	inhireWhitespacePattern  = regexp.MustCompile(`\s+`)
)

func inhireExtractDetailText(rawHTML string) string {
	rawHTML = strings.TrimSpace(rawHTML)
	if rawHTML == "" {
		return ""
	}

	parts := make([]string, 0, 4)
	for _, match := range inhireJSONScriptPattern.FindAllStringSubmatch(rawHTML, -1) {
		if len(match) < 2 {
			continue
		}
		values := inhireExtractJSONStrings(html.UnescapeString(match[1]))
		if len(values) > 0 {
			parts = append(parts, strings.Join(values, " "))
		}
	}

	visibleHTML := inhireScriptStylePattern.ReplaceAllString(rawHTML, " ")
	visibleText := inhireTagPattern.ReplaceAllString(visibleHTML, " ")
	parts = append(parts, visibleText)

	return inhireNormalizeDetailText(strings.Join(parts, " "))
}

func inhireExtractJSONStrings(rawJSON string) []string {
	var payload any
	decoder := json.NewDecoder(strings.NewReader(rawJSON))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return nil
	}

	values := make([]string, 0, 64)
	inhireCollectJSONStrings(payload, &values)
	return values
}

func inhireCollectJSONStrings(value any, out *[]string) {
	if len(*out) >= 300 {
		return
	}

	switch typed := value.(type) {
	case string:
		text := inhireNormalizeDetailText(typed)
		if len([]rune(text)) >= 3 {
			*out = append(*out, text)
		}
	case []any:
		for _, item := range typed {
			inhireCollectJSONStrings(item, out)
		}
	case map[string]any:
		for _, item := range typed {
			inhireCollectJSONStrings(item, out)
		}
	}
}

func inhireNormalizeDetailText(text string) string {
	text = html.UnescapeString(text)
	text = strings.ReplaceAll(text, `\u003c`, "<")
	text = strings.ReplaceAll(text, `\u003e`, ">")
	text = strings.ReplaceAll(text, `\u0026`, "&")
	text = inhireTagPattern.ReplaceAllString(text, " ")
	text = inhireWhitespacePattern.ReplaceAllString(text, " ")
	text = strings.TrimSpace(text)

	runes := []rune(text)
	if len(runes) > inhireMaxDescriptionRunes {
		text = string(runes[:inhireMaxDescriptionRunes])
	}

	return text
}

func inhireSlugify(value string) string {
	value = strings.ToLower(html.UnescapeString(value))
	value = strings.ReplaceAll(value, "&", " and ")
	t := transform.Chain(norm.NFD, transform.RemoveFunc(func(r rune) bool {
		return unicode.Is(unicode.Mn, r)
	}), norm.NFC)
	value, _, _ = transform.String(t, value)

	var b strings.Builder
	lastDash := false
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteRune('-')
			lastDash = true
		}
	}

	return strings.Trim(b.String(), "-")
}
