package gupy

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
)

func TestGupySearchMapsRemoteJobs(t *testing.T) {
	t.Setenv("GUPY_RAW_DISCOVERY_ENABLED", "false")
	t.Setenv("GUPY_FULL_SWEEP_ENABLED", "false")
	t.Setenv("GUPY_FULL_REMOTE_SWEEP_ENABLED", "false")

	adapter := NewGupy()
	adapter.baseURL = "https://example.test/jobs"
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		if req.URL.String() != "https://example.test/jobs?jobName=Data+Analyst&limit=100&offset=0&workplaceType=remote" {
			t.Fatalf("unexpected endpoint: %s", req.URL.String())
		}

		return testResponse(`{
			"data": [
				{
					"id": 123,
					"name": "Data Analyst",
					"careerPageName": "Acme Dados",
					"jobUrl": "https://acme.gupy.io/jobs/123",
					"city": "Sao Paulo",
					"state": "SP",
					"country": "Brasil",
					"workplaceType": "remote",
					"isRemoteWork": false,
					"publishedDate": "2026-07-27T00:00:00Z",
					"description": "Build dashboards and metrics."
				},
				{
					"id": 456,
					"name": "Finance Analyst",
					"careerPageName": "Acme Dados",
					"jobUrl": "https://acme.gupy.io/jobs/456",
					"city": "Rio de Janeiro",
					"state": "RJ",
					"country": "Brasil",
					"workplaceType": "on-site"
				}
			]
		}`), nil
	})

	jobs, err := adapter.Search(context.Background(), "Data Analyst", domain.ScrapeRequest{RemoteOnly: true})
	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected one remote job, got %d", len(jobs))
	}

	job := jobs[0]
	if job.ID != "gupy:123" {
		t.Fatalf("unexpected ID: %q", job.ID)
	}
	if job.Title != "Data Analyst" {
		t.Fatalf("unexpected title: %q", job.Title)
	}
	if job.Company != "Acme Dados" {
		t.Fatalf("unexpected company: %q", job.Company)
	}
	if job.Location != "Sao Paulo / SP / Brasil" {
		t.Fatalf("unexpected location: %q", job.Location)
	}
	if job.Modality != "Remoto" {
		t.Fatalf("expected remote modality, got %q", job.Modality)
	}
	if job.URL != "https://acme.gupy.io/jobs/123" {
		t.Fatalf("unexpected URL: %q", job.URL)
	}
	if job.Source != "Gupy" || strings.Join(job.Sources, ",") != "Gupy" {
		t.Fatalf("unexpected source metadata: %q %#v", job.Source, job.Sources)
	}
	if job.Keyword != "Data Analyst" || strings.Join(job.Keywords, ",") != "Data Analyst" {
		t.Fatalf("unexpected keyword metadata: %q %#v", job.Keyword, job.Keywords)
	}
}

func TestGupySearchPaginatesUntilShortPage(t *testing.T) {
	t.Setenv("GUPY_RAW_DISCOVERY_ENABLED", "false")
	t.Setenv("GUPY_FULL_SWEEP_ENABLED", "false")
	t.Setenv("GUPY_FULL_REMOTE_SWEEP_ENABLED", "false")

	adapter := NewGupy()
	adapter.baseURL = "https://example.test/jobs"
	adapter.pageLimit = 2
	adapter.maxOffset = 10

	var (
		mu      sync.Mutex
		offsets []string
	)

	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		mu.Lock()
		offsets = append(offsets, req.URL.Query().Get("offset"))
		mu.Unlock()

		switch req.URL.Query().Get("offset") {
		case "0":
			return testResponse(`{"data":[
				{"id":"1","name":"Go Engineer","careerPageName":"Acme","jobUrl":"https://acme.gupy.io/jobs/1","workplaceType":"remote"},
				{"id":"2","name":"Backend Engineer","careerPageName":"Acme","jobUrl":"https://acme.gupy.io/jobs/2","workplaceType":"remote"}
			]}`), nil
		case "2":
			return testResponse(`{"data":[
				{"id":"3","name":"Platform Engineer","careerPageName":"Acme","jobUrl":"https://acme.gupy.io/jobs/3","workplaceType":"remote"}
			]}`), nil
		default:
			t.Fatalf("unexpected offset: %s", req.URL.Query().Get("offset"))
			return testResponse(`{"data":[]}`), nil
		}
	})

	jobs, err := adapter.Search(context.Background(), "engineer", domain.ScrapeRequest{})
	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if len(jobs) != 3 {
		t.Fatalf("expected three jobs across pages, got %d", len(jobs))
	}

	mu.Lock()
	defer mu.Unlock()
	if strings.Join(offsets, ",") != "0,2" {
		t.Fatalf("expected offsets 0,2, got %#v", offsets)
	}
}

func TestGupySearchStopsPaginationAfterCancellation(t *testing.T) {
	t.Setenv("GUPY_RAW_DISCOVERY_ENABLED", "false")
	t.Setenv("GUPY_FULL_SWEEP_ENABLED", "false")
	t.Setenv("GUPY_FULL_REMOTE_SWEEP_ENABLED", "false")

	ctx, cancel := context.WithCancelCause(context.Background())
	cause := errors.New("run lock lost")
	calls := 0
	adapter := NewGupy()
	adapter.baseURL = "https://example.test/jobs"
	adapter.pageLimit = 1
	adapter.maxOffset = 5
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		calls++
		cancel(cause)
		return testResponse(`{
			"data": [{
				"id": 1,
				"name": "Go Developer",
				"careerPageName": "Acme",
				"jobUrl": "https://acme.gupy.io/jobs/1",
				"description": "Go backend"
			}]
		}`), nil
	})

	_, err := adapter.Search(ctx, "go", domain.ScrapeRequest{})

	if !errors.Is(err, cause) {
		t.Fatalf("expected cancellation cause, got %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected no request after cancellation, got %d calls", calls)
	}
}

func TestGupySearchAcceptsIsRemoteWorkFlagAndCareerPageURLFallback(t *testing.T) {
	t.Setenv("GUPY_RAW_DISCOVERY_ENABLED", "false")
	t.Setenv("GUPY_FULL_SWEEP_ENABLED", "false")
	t.Setenv("GUPY_FULL_REMOTE_SWEEP_ENABLED", "false")

	adapter := NewGupy()
	adapter.baseURL = "https://example.test/jobs"
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		return testResponse(`{"data":[{
			"id": "abc",
			"name": "Software Engineer",
			"careerPageName": "Acme",
			"careerPageUrl": "https://acme.gupy.io",
			"city": "Campinas",
			"state": "SP",
			"country": "Brasil",
			"workplaceType": "hybrid",
			"isRemoteWork": true
		}]}`), nil
	})

	jobs, err := adapter.Search(context.Background(), "product", domain.ScrapeRequest{RemoteOnly: true})
	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected isRemoteWork job to pass remote filter, got %d", len(jobs))
	}
	if jobs[0].URL != "https://acme.gupy.io" {
		t.Fatalf("expected career page URL fallback, got %q", jobs[0].URL)
	}
	if jobs[0].Modality != "Remoto" {
		t.Fatalf("expected isRemoteWork to normalize modality to Remoto, got %q", jobs[0].Modality)
	}
}

func TestGupySearchHandlesNonOKStatus(t *testing.T) {
	t.Setenv("GUPY_RAW_DISCOVERY_ENABLED", "false")
	t.Setenv("GUPY_FULL_SWEEP_ENABLED", "false")
	t.Setenv("GUPY_FULL_REMOTE_SWEEP_ENABLED", "false")

	adapter := NewGupy()
	adapter.baseURL = "https://example.test/jobs"
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusTooManyRequests,
			Body:       http.NoBody,
			Header:     make(http.Header),
		}, nil
	})

	_, err := adapter.fetchAll(context.Background(), "go", domain.ScrapeRequest{})
	if err == nil {
		t.Fatal("expected error for non-OK response")
	}
	if !strings.Contains(err.Error(), "status inesperado 429") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestGupySearchBatchExpandsPortugueseTechnologyQueries(t *testing.T) {
	t.Setenv("GUPY_RAW_DISCOVERY_ENABLED", "false")
	t.Setenv("GUPY_FULL_SWEEP_ENABLED", "false")
	t.Setenv("GUPY_FULL_REMOTE_SWEEP_ENABLED", "false")

	adapter := NewGupy()
	adapter.baseURL = "https://example.test/jobs"

	seenQueries := make(map[string]bool)
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		query := req.URL.Query().Get("jobName")
		seenQueries[query] = true

		if req.URL.Query().Get("offset") != "0" {
			return testResponse(`{"data":[]}`), nil
		}

		switch query {
		case "desenvolvedor java":
			return testResponse(`{"data":[{
				"id": "java-1",
				"name": "Pessoa Desenvolvedora Java",
				"careerPageName": "Acme",
				"jobUrl": "https://acme.gupy.io/jobs/java-1",
				"workplaceType": "remote"
			}]}`), nil
		case "react":
			return testResponse(`{"data":[{
				"id": "react-1",
				"name": "Desenvolvedor React",
				"careerPageName": "Acme",
				"jobUrl": "https://acme.gupy.io/jobs/react-1",
				"workplaceType": "remote"
			}]}`), nil
		default:
			return testResponse(`{"data":[]}`), nil
		}
	})

	jobs, err := adapter.SearchBatch(context.Background(), []string{"java developer", "react developer"}, domain.ScrapeRequest{RemoteOnly: true})
	if err != nil {
		t.Fatalf("SearchBatch returned error: %v", err)
	}
	if len(jobs) != 2 {
		t.Fatalf("expected two expanded-query jobs, got %d", len(jobs))
	}
	if !seenQueries["desenvolvedor java"] || !seenQueries["react"] {
		t.Fatalf("expected expanded queries to be searched, got %#v", seenQueries)
	}
	for _, job := range jobs {
		if len(job.Keywords) != 1 {
			t.Fatalf("expected original keyword metadata, got %#v", job.Keywords)
		}
	}
}

func TestGupySearchBatchAddsRawDiscoveryQueries(t *testing.T) {
	t.Setenv("GUPY_RAW_DISCOVERY_ENABLED", "true")
	t.Setenv("GUPY_FULL_SWEEP_ENABLED", "false")
	t.Setenv("GUPY_FULL_REMOTE_SWEEP_ENABLED", "false")

	adapter := NewGupy()
	adapter.baseURL = "https://example.test/jobs"

	seenQueries := make(map[string]bool)
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		query := req.URL.Query().Get("jobName")
		seenQueries[query] = true

		if query != "software" || req.URL.Query().Get("offset") != "0" {
			return testResponse(`{"data":[]}`), nil
		}

		return testResponse(`{"data":[{
			"id": "raw-1",
			"name": "Software Engineer",
			"careerPageName": "Acme",
			"jobUrl": "https://acme.gupy.io/jobs/raw-1",
			"workplaceType": "remote"
		}]}`), nil
	})

	jobs, err := adapter.SearchBatch(context.Background(), []string{"java developer"}, domain.ScrapeRequest{RemoteOnly: true})
	if err != nil {
		t.Fatalf("SearchBatch returned error: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected raw discovery job, got %d", len(jobs))
	}
	if !seenQueries["software"] {
		t.Fatalf("expected software raw discovery query, got %#v", seenQueries)
	}
	if jobs[0].Keyword != "software" {
		t.Fatalf("expected raw query keyword metadata, got %q", jobs[0].Keyword)
	}
}

func TestGupySearchBatchAddsFullRemoteSweep(t *testing.T) {
	t.Setenv("GUPY_RAW_DISCOVERY_ENABLED", "false")
	t.Setenv("GUPY_FULL_SWEEP_ENABLED", "true")
	t.Setenv("GUPY_FULL_REMOTE_SWEEP_ENABLED", "true")

	adapter := NewGupy()
	adapter.baseURL = "https://example.test/jobs"

	var sawFullSweep bool
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		if req.URL.Query().Get("jobName") != "" {
			return testResponse(`{"data":[]}`), nil
		}
		if req.URL.Query().Get("workplaceType") != "remote" {
			t.Fatalf("expected remote full sweep to request workplaceType=remote, got %q", req.URL.String())
		}
		sawFullSweep = true

		return testResponse(`{"data":[{
			"id": "remote-1",
			"name": "Pessoa Engenheira de Software",
			"careerPageName": "Acme",
			"jobUrl": "https://acme.gupy.io/jobs/remote-1",
			"workplaceType": "remote"
		}]}`), nil
	})

	jobs, err := adapter.SearchBatch(context.Background(), []string{"software engineer"}, domain.ScrapeRequest{RemoteOnly: true})
	if err != nil {
		t.Fatalf("SearchBatch returned error: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected one full-sweep job, got %d", len(jobs))
	}
	if !sawFullSweep {
		t.Fatal("expected full remote sweep request")
	}
	if jobs[0].Keyword != "gupy:remote-full-sweep" {
		t.Fatalf("expected full-sweep keyword metadata, got %q", jobs[0].Keyword)
	}
}

func TestGupySearchBatchRejectsAdministrativeJobsFromFullSweep(t *testing.T) {
	t.Setenv("GUPY_RAW_DISCOVERY_ENABLED", "false")
	t.Setenv("GUPY_FULL_SWEEP_ENABLED", "true")
	t.Setenv("GUPY_FULL_REMOTE_SWEEP_ENABLED", "true")

	adapter := NewGupy()
	adapter.baseURL = "https://example.test/jobs"

	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		if req.URL.Query().Get("jobName") != "" {
			return testResponse(`{"data":[]}`), nil
		}

		return testResponse(`{"data":[
			{
				"id": "admin-0",
				"name": "MOTORISTA DE VAN - AEROPORTO_FLORIANOPOLIS (SC)",
				"careerPageName": "Acme",
				"jobUrl": "https://acme.gupy.io/jobs/admin-0",
				"workplaceType": "remote",
				"description": "Transporte de clientes e atendimento operacional."
			},
			{
				"id": "admin-1",
				"name": "Assistente de Sistemas - Operações Comerciais",
				"careerPageName": "Acme",
				"jobUrl": "https://acme.gupy.io/jobs/admin-1",
				"workplaceType": "remote",
				"description": "Atendimento, operação comercial e suporte administrativo."
			},
			{
				"id": "admin-2",
				"name": "Assistente de Negócios - Central de Relacionamento",
				"careerPageName": "Acme",
				"jobUrl": "https://acme.gupy.io/jobs/admin-2",
				"workplaceType": "remote"
			},
			{
				"id": "admin-3",
				"name": "ASSISTENTE CENTRAL DE RESERVAS",
				"careerPageName": "Acme",
				"jobUrl": "https://acme.gupy.io/jobs/admin-3",
				"workplaceType": "remote"
			},
			{
				"id": "admin-4",
				"name": "ANALISTA QUALIDADE III",
				"careerPageName": "Acme",
				"jobUrl": "https://acme.gupy.io/jobs/admin-4",
				"workplaceType": "remote",
				"description": "Processos de qualidade operacional e auditoria."
			},
			{
				"id": "admin-5",
				"name": "Atendente",
				"careerPageName": "Acme",
				"jobUrl": "https://acme.gupy.io/jobs/admin-5",
				"workplaceType": "remote"
			},
			{
				"id": "talent-1",
				"name": "[Banco de Talentos] Pessoa Desenvolvedora Frontend Junior",
				"careerPageName": "Acme",
				"jobUrl": "https://acme.gupy.io/jobs/talent-1",
				"workplaceType": "remote",
				"description": "React e TypeScript."
			},
			{
				"id": "tech-1",
				"name": "Pessoa Desenvolvedora Backend",
				"careerPageName": "Acme",
				"jobUrl": "https://acme.gupy.io/jobs/tech-1",
				"workplaceType": "remote"
			}
		]}`), nil
	})

	jobs, err := adapter.SearchBatch(context.Background(), []string{"backend developer"}, domain.ScrapeRequest{RemoteOnly: true})
	if err != nil {
		t.Fatalf("SearchBatch returned error: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected only the technical job to pass, got %d", len(jobs))
	}
	if jobs[0].ID != "gupy:tech-1" {
		t.Fatalf("expected technical job to remain, got %q", jobs[0].ID)
	}
}

func TestGupySearchBatchAddsFullSweepForAllModalities(t *testing.T) {
	t.Setenv("GUPY_RAW_DISCOVERY_ENABLED", "false")
	t.Setenv("GUPY_FULL_SWEEP_ENABLED", "true")
	t.Setenv("GUPY_FULL_REMOTE_SWEEP_ENABLED", "false")

	adapter := NewGupy()
	adapter.baseURL = "https://example.test/jobs"

	var sawFullSweep bool
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		if req.URL.Query().Get("jobName") != "" {
			return testResponse(`{"data":[]}`), nil
		}
		if req.URL.Query().Get("workplaceType") != "" {
			t.Fatalf("expected all-modality full sweep without workplaceType, got %q", req.URL.String())
		}
		sawFullSweep = true

		return testResponse(`{"data":[{
			"id": "hybrid-1",
			"name": "Pessoa Desenvolvedora Backend",
			"careerPageName": "Acme",
			"jobUrl": "https://acme.gupy.io/jobs/hybrid-1",
			"workplaceType": "hybrid"
		}]}`), nil
	})

	jobs, err := adapter.SearchBatch(context.Background(), []string{"backend developer"}, domain.ScrapeRequest{RemoteOnly: false})
	if err != nil {
		t.Fatalf("SearchBatch returned error: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected one all-modality full-sweep job, got %d", len(jobs))
	}
	if !sawFullSweep {
		t.Fatal("expected all-modality full sweep request")
	}
	if jobs[0].Keyword != "gupy:full-sweep" {
		t.Fatalf("expected full-sweep keyword metadata, got %q", jobs[0].Keyword)
	}
	if jobs[0].Modality != "Híbrido" {
		t.Fatalf("expected hybrid modality, got %q", jobs[0].Modality)
	}
}

func TestGupyFullSweepKeepsCollectedJobsWhenHighOffsetReturnsBadRequest(t *testing.T) {
	t.Setenv("GUPY_RAW_DISCOVERY_ENABLED", "false")
	t.Setenv("GUPY_FULL_SWEEP_ENABLED", "true")
	t.Setenv("GUPY_FULL_REMOTE_SWEEP_ENABLED", "false")

	adapter := NewGupy()
	adapter.baseURL = "https://example.test/jobs"
	adapter.pageLimit = 100
	adapter.maxOffset = 10100
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		if req.URL.Query().Get("jobName") != "" {
			return testResponse(`{"data":[]}`), nil
		}

		offset, err := strconv.Atoi(req.URL.Query().Get("offset"))
		if err != nil {
			t.Fatalf("unexpected offset: %q", req.URL.Query().Get("offset"))
		}
		if offset >= 10000 {
			return &http.Response{
				StatusCode: http.StatusBadRequest,
				Body:       http.NoBody,
				Header:     make(http.Header),
			}, nil
		}

		return testResponse(`{"data":[{
			"id": "full-1",
			"name": "Pessoa Desenvolvedora Full Stack",
			"careerPageName": "Acme",
			"jobUrl": "https://acme.gupy.io/jobs/full-1",
			"workplaceType": "hybrid"
		}]}`), nil
	})

	jobs, err := adapter.SearchBatch(context.Background(), []string{"software engineer"}, domain.ScrapeRequest{RemoteOnly: false})
	if err != nil {
		t.Fatalf("SearchBatch returned error: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected collected job to survive full-sweep 400, got %d", len(jobs))
	}
}
