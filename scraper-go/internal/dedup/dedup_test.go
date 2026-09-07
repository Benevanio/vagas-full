package dedup

import (
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDedupeJobsSameBatchByIdentity(t *testing.T) {
	jobs := []domain.Job{
		{Title: "Dev Go", Company: "Acme", Location: "Brasil", Source: "gupy", Keyword: "go"},
		{Title: "Dev Go", Company: "Acme", Location: "Brasil", Source: "linkedin", Keyword: "golang"},
	}

	got := DedupeJobs(jobs)
	require.Len(t, got, 1)
	assert.ElementsMatch(t, []string{"gupy", "linkedin"}, got[0].Sources)
	assert.ElementsMatch(t, []string{"go", "golang"}, got[0].Keywords)
}

func TestDedupeJobsEquivalentURLs(t *testing.T) {
	jobs := []domain.Job{
		{URL: "https://jobs.example.com/go?utm=1#top", Source: "gupy"},
		{URL: "HTTPS://JOBS.EXAMPLE.COM/go/", Source: "linkedin"},
	}

	got := DedupeJobs(jobs)
	require.Len(t, got, 1)
	assert.ElementsMatch(t, []string{"gupy", "linkedin"}, got[0].Sources)
}

func TestDedupeJobsSameExternalID(t *testing.T) {
	jobs := []domain.Job{
		{ID: "ext-42", Title: "Engenheiro", Company: "A", Location: "SP", Source: "themuse"},
		{ID: "ext-42", Title: "Engenheiro", Company: "A", Location: "SP", Source: "themuse"},
	}

	got := DedupeJobs(jobs)
	require.Len(t, got, 1)
}

func TestDedupeJobsKeepsDifferentJobsWithSameTitle(t *testing.T) {
	jobs := []domain.Job{
		{Title: "Software Engineer", Company: "Acme", Location: "Brasil", URL: "https://a.example/1"},
		{Title: "Software Engineer", Company: "Globex", Location: "Brasil", URL: "https://b.example/2"},
	}

	got := DedupeJobs(jobs)
	assert.Len(t, got, 2)
}

func TestDedupeJobsPreservesOriginalTitle(t *testing.T) {
	jobs := []domain.Job{
		{Title: "Engenheiro Go", Company: "Acme", Location: "Brasil"},
	}

	got := DedupeJobs(jobs)
	require.Len(t, got, 1)
	assert.Equal(t, "Engenheiro Go", got[0].Title)
}

func TestKeysUsesCanonicalURL(t *testing.T) {
	a := Keys(&domain.Job{URL: "https://jobs.example.com/go?x=1"})
	b := Keys(&domain.Job{URL: "https://jobs.example.com/go/"})
	assert.Contains(t, a, "url:https://jobs.example.com/go")
	assert.Equal(t, a, b)
}
