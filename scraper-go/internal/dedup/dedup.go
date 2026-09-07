package dedup

import (
	"net/url"
	"strings"
	"unicode"

	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
)

func DedupeJobs(jobs []domain.Job) []domain.Job {
	seen := make(map[string]*domain.Job, len(jobs))
	order := make([]*domain.Job, 0, len(jobs))

	for i := range jobs {
		job := jobs[i]
		keys := Keys(&job)

		var existing *domain.Job
		for _, key := range keys {
			if found, ok := seen[key]; ok {
				existing = found
				break
			}
		}

		if existing != nil {
			merged := Merge(existing, &job)
			*existing = *merged
			indexKeys(seen, existing)
			continue
		}

		if len(job.Sources) == 0 && strings.TrimSpace(job.Source) != "" {
			job.Sources = []string{job.Source}
		}
		if len(job.Keywords) == 0 && strings.TrimSpace(job.Keyword) != "" {
			job.Keywords = []string{job.Keyword}
		}

		ptr := &job
		indexKeys(seen, ptr)
		order = append(order, ptr)
	}

	result := make([]domain.Job, 0, len(order))
	for _, job := range order {
		result = append(result, *job)
	}
	return result
}

func indexKeys(seen map[string]*domain.Job, job *domain.Job) {
	for key, existing := range seen {
		if existing == job {
			delete(seen, key)
		}
	}
	for _, key := range Keys(job) {
		seen[key] = job
	}
}

// Key returns the primary identity used by the current domain model.
func Key(j *domain.Job) string {
	keys := Keys(j)
	if len(keys) == 0 {
		return "fallback:"
	}
	return keys[0]
}

// Keys returns every stable identifier that can collapse duplicates
// inside a scrape run: external ID, title+company+location, and canonical URL.
func Keys(j *domain.Job) []string {
	keys := make([]string, 0, 3)

	if id := strings.TrimSpace(j.ID); id != "" {
		keys = append(keys, "id:"+id)
	}

	title := normalizeText(j.Title)
	company := normalizeText(j.Company)
	location := normalizeText(j.Location)
	if title != "" && company != "" {
		loc := location
		if loc == "" {
			loc = "sem-local"
		}
		keys = append(keys, "identity:"+title+"|"+company+"|"+loc)
	}

	if link := normalizeURL(j.URL); link != "" {
		keys = append(keys, "url:"+link)
	}

	if len(keys) == 0 {
		return []string{"fallback:" + title + "|" + company + "|" + location + "|" + normalizeText(j.Source)}
	}
	return keys
}

func Merge(existing, incoming *domain.Job) *domain.Job {
	merged := *existing

	merged.Sources = uniqueStrings(append(existing.Sources, incoming.Sources...))
	if incoming.Source != "" {
		merged.Sources = uniqueStrings(append(merged.Sources, incoming.Source))
	}
	if existing.Source != "" {
		merged.Sources = uniqueStrings(append(merged.Sources, existing.Source))
	}
	merged.Source = strings.Join(merged.Sources, ", ")

	merged.Keywords = uniqueStrings(append(existing.Keywords, incoming.Keywords...))
	if incoming.Keyword != "" {
		merged.Keywords = uniqueStrings(append(merged.Keywords, incoming.Keyword))
	}
	if existing.Keyword != "" {
		merged.Keywords = uniqueStrings(append(merged.Keywords, existing.Keyword))
	}
	if len(merged.Keywords) > 0 {
		merged.Keyword = merged.Keywords[0]
	}

	merged.Title = longest(existing.Title, incoming.Title)
	merged.Company = longest(existing.Company, incoming.Company)
	merged.Location = longest(existing.Location, incoming.Location)
	merged.URL = longestCanonicalURL(existing.URL, incoming.URL)
	if strings.TrimSpace(existing.ID) == "" && strings.TrimSpace(incoming.ID) != "" {
		merged.ID = incoming.ID
	}

	return &merged
}

func normalizeText(s string) string {
	t := transform.Chain(norm.NFD, transform.RemoveFunc(func(r rune) bool {
		return unicode.Is(unicode.Mn, r)
	}), norm.NFC)

	result, _, _ := transform.String(t, s)

	var b strings.Builder
	for _, r := range strings.ToLower(result) {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(r)
		} else {
			b.WriteRune(' ')
		}
	}

	return strings.Join(strings.Fields(b.String()), " ")
}

func normalizeURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	u, err := url.Parse(raw)
	if err != nil {
		if idx := strings.IndexAny(raw, "?#"); idx != -1 {
			raw = raw[:idx]
		}
		return strings.TrimRight(raw, "/")
	}

	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	u.RawQuery = ""
	u.Fragment = ""

	return strings.TrimRight(u.String(), "/")
}

func longestCanonicalURL(a, b string) string {
	na := normalizeURL(a)
	nb := normalizeURL(b)
	if nb != "" && (na == "" || len(nb) >= len(na)) {
		if normalizeURL(b) == nb {
			return strings.TrimSpace(b)
		}
		return nb
	}
	if na != "" {
		return strings.TrimSpace(a)
	}
	return longest(a, b)
}

func longest(a, b string) string {
	if len(strings.TrimSpace(b)) > len(strings.TrimSpace(a)) {
		return b
	}
	return a
}

func uniqueStrings(input []string) []string {
	seen := make(map[string]struct{}, len(input))
	out := make([]string, 0, len(input))

	for _, s := range input {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; !ok {
			seen[s] = struct{}{}
			out = append(out, s)
		}
	}

	return out
}
