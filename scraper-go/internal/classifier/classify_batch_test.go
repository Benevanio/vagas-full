package classifier

import (
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClassifyJobsMatchesIndividualClassify(t *testing.T) {
	jobs := []domain.Job{
		{Title: "Backend Engineer", Company: "Acme", Description: "Golang APIs microservices"},
		{Title: "Front-end Software Developer", Company: "Acme", Description: "React TypeScript"},
		{Title: "Graphic Designer", Company: "Acme", Description: "Branding"},
		{Title: "DevOps Engineer", Company: "Acme", Description: "Kubernetes terraform aws"},
	}

	batched := ClassifyJobs(jobs)
	require.Len(t, batched, 3)

	var individual []domain.Job
	for _, job := range jobs {
		classification := Classify(job)
		if !classification.InScope {
			continue
		}
		job.Classification = &classification
		individual = append(individual, job)
	}

	require.Len(t, individual, len(batched))
	for i := range batched {
		require.NotNil(t, batched[i].Classification)
		require.NotNil(t, individual[i].Classification)
		assert.Equal(t, individual[i].Classification.PrimaryFamily, batched[i].Classification.PrimaryFamily)
		assert.Equal(t, individual[i].Classification.InScope, batched[i].Classification.InScope)
		assert.Equal(t, individual[i].Classification.Confidence, batched[i].Classification.Confidence)
		assert.Equal(t, individual[i].Classification.Seniority, batched[i].Classification.Seniority)
		assert.Equal(t, individual[i].Classification.Technologies, batched[i].Classification.Technologies)
		assert.Equal(t, individual[i].Classification.RelatedFamilies, batched[i].Classification.RelatedFamilies)
	}
}

func TestCurrentFamiliesUnchanged(t *testing.T) {
	got := make([]string, 0, len(familyRules))
	for _, rule := range familyRules {
		got = append(got, rule.Family)
	}

	assert.Equal(t, []string{
		"backend",
		"frontend",
		"mobile",
		"fullstack",
		"platform",
		"devops",
		"data",
		"qa",
		"security",
		"leadership",
		"software",
	}, got)
	assert.NotContains(t, got, "product")
	assert.NotContains(t, got, "product_design")
}
