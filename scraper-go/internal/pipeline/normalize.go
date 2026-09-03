package pipeline

import (
	"net/url"
	"strings"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/jobstore"
)

func normalizeCollectedJob(job domain.Job) domain.Job {
	job.Title = strings.TrimSpace(job.Title)
	job.Company = strings.TrimSpace(job.Company)
	job.Location = strings.TrimSpace(job.Location)
	job.Source = strings.TrimSpace(job.Source)
	job.Keyword = strings.TrimSpace(job.Keyword)
	job.URL = canonicalizeURL(job.URL)
	job.ID = strings.TrimSpace(job.ID)

	if len(job.Sources) == 0 && job.Source != "" {
		job.Sources = []string{job.Source}
	}
	if len(job.Keywords) == 0 && job.Keyword != "" {
		job.Keywords = []string{job.Keyword}
	}
	for i := range job.Sources {
		job.Sources[i] = strings.TrimSpace(job.Sources[i])
	}
	for i := range job.Keywords {
		job.Keywords[i] = strings.TrimSpace(job.Keywords[i])
	}
	return job
}

func canonicalizeURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		if idx := strings.IndexAny(raw, "?#"); idx != -1 {
			raw = raw[:idx]
		}
		return strings.TrimRight(raw, "/")
	}
	parsed.Scheme = strings.ToLower(parsed.Scheme)
	parsed.Host = strings.ToLower(parsed.Host)
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/")
}

func jobIsInvalid(job domain.Job) bool {
	return jobstore.StableID(&job) == ""
}
