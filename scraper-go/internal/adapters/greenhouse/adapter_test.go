package greenhouse

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
)

func TestGreenhouseSearchMatchesRichJobFields(t *testing.T) {
	adapter := NewGreenhouse("acme", "Acme")
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		if req.URL.String() != "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true" {
			t.Fatalf("unexpected endpoint: %s", req.URL.String())
		}
		return testResponse(`{
			"jobs": [
				{
					"id": 123,
					"title": "Backend Engineer",
					"content": "<p>Build payment services with Java and PostgreSQL.</p>",
					"absolute_url": "https://boards.greenhouse.io/acme/jobs/123",
					"updated_at": "2026-07-27T00:00:00Z",
					"language": "en",
					"requisition_id": "ENG-123",
					"location": {"name": "Remote - Brazil"},
					"departments": [{"name": "Platform Engineering"}],
					"offices": [{"name": "LATAM", "location": "Brazil"}],
					"metadata": [{"name": "Stack", "value": "Kafka"}]
				},
				{
					"id": 456,
					"title": "Finance Analyst",
					"content": "<p>Budget planning.</p>",
					"absolute_url": "https://boards.greenhouse.io/acme/jobs/456",
					"updated_at": "2026-07-27T00:00:00Z",
					"language": "en",
					"location": {"name": "New York"}
				}
			],
			"meta": {"total": 2}
		}`), nil
	})

	jobs, err := adapter.Search(context.Background(), "kafka", domain.ScrapeRequest{
		SearchLanguage: "en",
		SearchLocation: "Brazil",
		RemoteOnly:     true,
	})

	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected one rich metadata match, got %d", len(jobs))
	}

	job := jobs[0]
	if job.Title != "Backend Engineer" {
		t.Fatalf("unexpected title: %q", job.Title)
	}
	if job.Location != "Remote - Brazil | Brazil | LATAM" {
		t.Fatalf("unexpected location: %q", job.Location)
	}
	if job.Modality != "Remoto" {
		t.Fatalf("expected remote modality, got %q", job.Modality)
	}
	if !strings.Contains(job.Description, "Build payment services") {
		t.Fatalf("expected clean content in description: %q", job.Description)
	}
	if !strings.Contains(job.Description, "Departamentos: Platform Engineering") {
		t.Fatalf("expected departments in description: %q", job.Description)
	}
	if !strings.Contains(job.Description, "Metadados: Stack: Kafka") {
		t.Fatalf("expected metadata in description: %q", job.Description)
	}
}

func TestGreenhouseSearchMatchesDescriptionNotOnlyTitle(t *testing.T) {
	adapter := NewGreenhouse("acme", "Acme")
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		return testResponse(`{
			"jobs": [{
				"id": 123,
				"title": "Software Engineer",
				"content": "Experience with Golang services.",
				"absolute_url": "https://boards.greenhouse.io/acme/jobs/123",
				"location": {"name": "Remote"}
			}]
		}`), nil
	})

	jobs, err := adapter.Search(context.Background(), "go", domain.ScrapeRequest{})

	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected description keyword match, got %d", len(jobs))
	}
}

func TestGreenhouseSearchCachesBoardListAcrossKeywords(t *testing.T) {
	var (
		mu    sync.Mutex
		calls int
	)

	adapter := NewGreenhouse("acme", "Acme")
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		mu.Lock()
		calls++
		mu.Unlock()

		return testResponse(`{
			"jobs": [{
				"id": 123,
				"title": "Go Engineer",
				"content": "Backend APIs",
				"absolute_url": "https://boards.greenhouse.io/acme/jobs/123",
				"location": {"name": "Remote"}
			}]
		}`), nil
	})

	var wg sync.WaitGroup
	for _, keyword := range []string{"go", "backend", "engineer"} {
		wg.Add(1)
		go func(keyword string) {
			defer wg.Done()
			if _, err := adapter.Search(context.Background(), keyword, domain.ScrapeRequest{}); err != nil {
				t.Errorf("Search(%q) returned error: %v", keyword, err)
			}
		}(keyword)
	}
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	if calls != 1 {
		t.Fatalf("expected one Greenhouse list call, got %d", calls)
	}
}

func TestGreenhouseSearchCatalogAggregatesKeywordsWithoutDuplicates(t *testing.T) {
	calls := 0
	adapter := NewGreenhouse("acme", "Acme")
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		calls++
		return testResponse(`{
			"jobs": [{
				"id": 123,
				"title": "Go Backend Engineer",
				"content": "Build distributed services.",
				"absolute_url": "https://boards.greenhouse.io/acme/jobs/123",
				"location": {"name": "Remote"}
			}]
		}`), nil
	})

	jobs, err := adapter.SearchCatalog(
		context.Background(),
		[]string{"go", "backend", "java"},
		domain.ScrapeRequest{},
	)

	if err != nil {
		t.Fatalf("SearchCatalog returned error: %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected one catalog request, got %d", calls)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected one job without keyword duplicates, got %d", len(jobs))
	}
	if jobs[0].Keyword != "go" {
		t.Fatalf("expected first matching keyword, got %q", jobs[0].Keyword)
	}
	if got := strings.Join(jobs[0].Keywords, ","); got != "go,backend" {
		t.Fatalf("expected all matching keywords, got %q", got)
	}
}

func TestGreenhouseSearchHandlesNonOKStatus(t *testing.T) {
	adapter := NewGreenhouse("missing", "Missing")
	adapter.client = testHTTPClient(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusNotFound,
			Body:       http.NoBody,
			Header:     make(http.Header),
		}, nil
	})

	_, err := adapter.Search(context.Background(), "go", domain.ScrapeRequest{})
	if err == nil {
		t.Fatal("expected error for non-OK response")
	}
	if !strings.Contains(fmt.Sprint(err), "board 'missing'") {
		t.Fatalf("expected board token in error, got %v", err)
	}
}
