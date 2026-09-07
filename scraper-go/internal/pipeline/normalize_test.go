package pipeline

import (
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/stretchr/testify/assert"
)

func TestNormalizeCollectedJobTrimsWithoutChangingTitleCase(t *testing.T) {
	got := normalizeCollectedJob(domain.Job{
		Title:    "  Engenheiro Go  ",
		Company:  " Acme ",
		Location: " Brasil ",
		Source:   " Gupy ",
		Keyword:  " go ",
		URL:      " HTTPS://Jobs.Example.com/go?utm=1#x ",
		ID:       " ext-1 ",
	})

	assert.Equal(t, "Engenheiro Go", got.Title)
	assert.Equal(t, "Acme", got.Company)
	assert.Equal(t, "Brasil", got.Location)
	assert.Equal(t, "Gupy", got.Source)
	assert.Equal(t, []string{"Gupy"}, got.Sources)
	assert.Equal(t, "go", got.Keyword)
	assert.Equal(t, "ext-1", got.ID)
	assert.Equal(t, "https://jobs.example.com/go", got.URL)
}

func TestJobIsInvalidWithoutStableIdentity(t *testing.T) {
	assert.True(t, jobIsInvalid(domain.Job{Title: "Só título"}))
	assert.False(t, jobIsInvalid(domain.Job{Title: "Dev Go", Company: "Acme", Location: "Brasil"}))
}
