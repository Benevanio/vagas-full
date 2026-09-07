package adapterutil

import (
	"context"
	"html"
	"strings"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
)

func Wait(ctx context.Context, duration time.Duration) error {
	if cause := context.Cause(ctx); cause != nil {
		return cause
	}
	if duration <= 0 {
		return nil
	}

	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return context.Cause(ctx)
	}
}

func NonEmptyStrings(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

func ContainsNormalized(text, query string) bool {
	return strings.Contains(NormalizeText(text), NormalizeText(query))
}

func MatchesKeyword(text, keyword string) bool {
	normalizedText := " " + NormalizeText(text) + " "
	terms := strings.Fields(NormalizeText(keyword))
	if len(terms) == 0 {
		return true
	}

	for _, term := range terms {
		if term == "go" {
			if strings.Contains(normalizedText, " go ") || strings.Contains(normalizedText, " golang ") {
				continue
			}
			return false
		}
		if !strings.Contains(normalizedText, " "+term+" ") {
			return false
		}
	}

	return true
}

func NormalizeText(value string) string {
	value = strings.ToLower(html.UnescapeString(value))
	value = strings.ReplaceAll(value, "/", " ")
	value = strings.ReplaceAll(value, "-", " ")
	return strings.Join(strings.Fields(value), " ")
}

func UniqueTrimmedStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, value)
	}
	return out
}

func RepeatedJobPage(seen map[string]struct{}, jobs []domain.Job) bool {
	signature := JobPageSignature(jobs)
	if signature == "" {
		return false
	}
	if _, exists := seen[signature]; exists {
		return true
	}
	seen[signature] = struct{}{}
	return false
}

func JobPageSignature(jobs []domain.Job) string {
	var b strings.Builder

	for _, job := range jobs {
		key := strings.TrimSpace(job.ID)
		if key == "" {
			key = strings.TrimSpace(job.URL)
		}
		if key == "" {
			key = strings.Join([]string{
				strings.TrimSpace(job.Title),
				strings.TrimSpace(job.Company),
				strings.TrimSpace(job.Location),
			}, "|")
		}
		if strings.Trim(key, "|") == "" {
			continue
		}
		b.WriteString(key)
		b.WriteByte('\n')
	}

	return b.String()
}
