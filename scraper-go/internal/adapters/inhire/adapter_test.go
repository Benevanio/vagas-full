package inhire

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
)

func TestInHireSearchBatchFetchesTenantsAndMapsJobs(t *testing.T) {
	tenantsFile := writeInHireTenantsFile(t, `[
		{"slug":"acme","tenantName":"Acme"},
		{"slug":"brq","tenantName":"BRQ"}
	]`)
	t.Setenv("INHIRE_TENANTS_FILE", tenantsFile)
	t.Setenv("INHIRE_ENRICH_DETAILS", "false")

	var (
		mu      sync.Mutex
		tenants []string
	)

	adapter := NewInHire()
	adapter.apiURL = "https://example.test/inhire"
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		if req.URL.String() != "https://example.test/inhire" {
			t.Fatalf("unexpected endpoint: %s", req.URL.String())
		}
		if req.Header.Get("X-Inhire-Client") != "web-inhire" {
			t.Fatalf("expected X-Inhire-Client header")
		}

		tenant := req.Header.Get("X-Tenant")
		mu.Lock()
		tenants = append(tenants, tenant)
		mu.Unlock()

		switch tenant {
		case "acme":
			return testResponse(`{
				"tenantName": "Acme Tecnologia",
				"jobsPage": [
					{
						"displayName": "Pessoa Desenvolvedora Java Sênior",
						"jobId": "job-1",
						"status": "published",
						"workplaceType": "Hybrid",
						"location": "São Paulo, SP, BR"
					},
					{
						"displayName": "Pessoa Analista Financeira",
						"jobId": "job-2",
						"status": "closed",
						"workplaceType": "Remote",
						"location": "BR"
					}
				]
			}`), nil
		case "brq":
			return testResponse(`{
				"tenantName": "BRQ",
				"jobsPage": [
					{
						"displayName": "Engenheiro de Dados",
						"jobId": "job-3",
						"status": "published",
						"workplaceType": "Remote",
						"location": "BR"
					}
				]
			}`), nil
		default:
			t.Fatalf("unexpected tenant: %s", tenant)
			return testResponse(`{"jobsPage":[]}`), nil
		}
	})

	jobs, err := adapter.SearchBatch(context.Background(), []string{"java developer", "dados"}, domain.ScrapeRequest{})
	if err != nil {
		t.Fatalf("SearchBatch returned error: %v", err)
	}
	if len(jobs) != 2 {
		t.Fatalf("expected two published jobs, got %d", len(jobs))
	}
	if tenantsJoined := strings.Join(tenants, ","); tenantsJoined != "acme,brq" {
		t.Fatalf("unexpected tenants order: %s", tenantsJoined)
	}

	first := jobs[0]
	if first.Company != "Acme Tecnologia" {
		t.Fatalf("unexpected company: %q", first.Company)
	}
	if first.Modality != "Híbrido" {
		t.Fatalf("expected hybrid modality, got %q", first.Modality)
	}
	if first.URL != "https://acme.inhire.app/vagas/job-1/pessoa-desenvolvedora-java-senior" {
		t.Fatalf("unexpected URL: %q", first.URL)
	}
	if first.Source != "InHire" || strings.Join(first.Sources, ",") != "InHire" {
		t.Fatalf("unexpected source metadata: %q %#v", first.Source, first.Sources)
	}

	second := jobs[1]
	if second.Modality != "Remoto" {
		t.Fatalf("expected remote modality, got %q", second.Modality)
	}
	if second.Keyword != "dados" {
		t.Fatalf("expected matched keyword, got %q", second.Keyword)
	}
}

func TestInHireSearchBatchRespectsRemoteOnly(t *testing.T) {
	tenantsFile := writeInHireTenantsFile(t, `[{"slug":"acme","tenantName":"Acme"}]`)
	t.Setenv("INHIRE_TENANTS_FILE", tenantsFile)
	t.Setenv("INHIRE_ENRICH_DETAILS", "false")

	adapter := NewInHire()
	adapter.apiURL = "https://example.test/inhire"
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		return testResponse(`{
			"tenantName": "Acme",
			"jobsPage": [
				{"displayName":"Backend Java","jobId":"remote","status":"published","workplaceType":"Remote","location":"BR"},
				{"displayName":"Backend Java","jobId":"hybrid","status":"published","workplaceType":"Hybrid","location":"São Paulo, SP, BR"}
			]
		}`), nil
	})

	jobs, err := adapter.SearchBatch(context.Background(), []string{"java"}, domain.ScrapeRequest{RemoteOnly: true})
	if err != nil {
		t.Fatalf("SearchBatch returned error: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected only remote job, got %d", len(jobs))
	}
	if jobs[0].ID != "inhire:acme:remote" {
		t.Fatalf("unexpected job ID: %q", jobs[0].ID)
	}
}

func TestInHireSearchCatalogStopsBeforeNextTenantAfterCancellation(t *testing.T) {
	tenantsFile := writeInHireTenantsFile(t, `[
		{"slug":"acme","tenantName":"Acme"},
		{"slug":"brq","tenantName":"BRQ"}
	]`)
	t.Setenv("INHIRE_TENANTS_FILE", tenantsFile)
	t.Setenv("INHIRE_ENRICH_DETAILS", "false")

	ctx, cancel := context.WithCancelCause(context.Background())
	cause := errors.New("run lock lost")
	calls := 0
	adapter := NewInHire()
	adapter.apiURL = "https://example.test/inhire"
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		calls++
		cancel(cause)
		return testResponse(`{"tenantName":"Acme","jobsPage":[]}`), nil
	})

	_, err := adapter.SearchCatalog(ctx, []string{"go"}, domain.ScrapeRequest{})

	if !errors.Is(err, cause) {
		t.Fatalf("expected cancellation cause, got %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected no request after cancellation, got %d calls", calls)
	}
}

func TestInHireLoadTenantsHandlesMissingFile(t *testing.T) {
	t.Setenv("INHIRE_TENANTS_FILE", filepath.Join(t.TempDir(), "missing.json"))
	t.Setenv("INHIRE_ENRICH_DETAILS", "false")

	adapter := NewInHire()
	_, err := adapter.SearchBatch(context.Background(), []string{"java"}, domain.ScrapeRequest{})
	if err == nil {
		t.Fatal("expected missing tenants file error")
	}
	if !strings.Contains(err.Error(), "inhire: leitura") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestInHireSearchBatchEnrichesAmbiguousJobsWithDetails(t *testing.T) {
	tenantsFile := writeInHireTenantsFile(t, `[{"slug":"acme","tenantName":"Acme"}]`)
	t.Setenv("INHIRE_TENANTS_FILE", tenantsFile)
	t.Setenv("INHIRE_ENRICH_DETAILS", "true")
	t.Setenv("INHIRE_DETAILS_MODE", "ambiguous")
	t.Setenv("INHIRE_DETAILS_TIMEOUT_MS", "1000")

	var detailCalls int

	adapter := NewInHire()
	adapter.apiURL = "https://example.test/inhire"
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		switch req.URL.String() {
		case "https://example.test/inhire":
			return testResponse(`{
				"tenantName": "Acme",
				"jobsPage": [
					{
						"displayName": "Analista de Sistemas Pleno",
						"jobId": "job-1",
						"status": "published",
						"workplaceType": "Hybrid",
						"location": "São Paulo, SP, BR"
					},
					{
						"displayName": "Backend Java Developer",
						"jobId": "job-2",
						"status": "published",
						"workplaceType": "Remote",
						"location": "BR"
					}
				]
			}`), nil
		case "https://acme.inhire.app/vagas/job-1/analista-de-sistemas-pleno":
			detailCalls++
			return testResponse(`<!doctype html>
				<html>
					<head>
						<script id="__NEXT_DATA__" type="application/json">
							{"props":{"pageProps":{"job":{"description":"Developer backend com Java, Spring Boot, PostgreSQL e APIs."}}}}
						</script>
					</head>
					<body><main>Responsabilidades de engenharia de software.</main></body>
				</html>`), nil
		default:
			t.Fatalf("unexpected endpoint: %s", req.URL.String())
			return testResponse(`{}`), nil
		}
	})

	jobs, err := adapter.SearchBatch(context.Background(), []string{"java developer", "spring boot developer"}, domain.ScrapeRequest{})
	if err != nil {
		t.Fatalf("SearchBatch returned error: %v", err)
	}
	if len(jobs) != 2 {
		t.Fatalf("expected two jobs, got %d", len(jobs))
	}
	if detailCalls != 1 {
		t.Fatalf("expected one detail call for ambiguous job, got %d", detailCalls)
	}
	if !strings.Contains(jobs[0].Description, "Spring Boot") {
		t.Fatalf("expected enriched description, got %q", jobs[0].Description)
	}
	if strings.Join(jobs[0].Keywords, ",") != "java developer,spring boot developer" {
		t.Fatalf("expected keywords from detail, got %#v", jobs[0].Keywords)
	}
}

func TestInHireExtractDetailTextReadsJSONAndVisibleHTML(t *testing.T) {
	text := inhireExtractDetailText(`<!doctype html>
		<script id="__NEXT_DATA__" type="application/json">
			{"props":{"description":"Desenvolvimento com React, TypeScript e Node.js"}}
		</script>
		<style>.hidden{display:none}</style>
		<main><h1>Vaga</h1><p>APIs e testes automatizados</p></main>`)

	if !strings.Contains(text, "React, TypeScript e Node.js") {
		t.Fatalf("expected JSON text, got %q", text)
	}
	if !strings.Contains(text, "APIs e testes automatizados") {
		t.Fatalf("expected visible HTML text, got %q", text)
	}
	if strings.Contains(text, "display:none") {
		t.Fatalf("expected style content to be removed, got %q", text)
	}
}

func TestInHireMatchingKeywordsInText(t *testing.T) {
	matched := inhireMatchingKeywordsInText(
		"Developer backend com Java, Spring Boot, PostgreSQL e APIs.",
		[]string{"java developer", "spring boot developer"},
	)

	if strings.Join(matched, ",") != "java developer,spring boot developer" {
		t.Fatalf("unexpected matched keywords: %#v", matched)
	}
}

func writeInHireTenantsFile(t *testing.T, payload string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "tenants.json")
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		t.Fatalf("write tenants file: %v", err)
	}
	return path
}
