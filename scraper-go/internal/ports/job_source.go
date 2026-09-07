package ports

import (
	"context"
	"strings"
	"time"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
)

type ProviderID string

const (
	ProviderLinkedIn   ProviderID = "linkedin"
	ProviderAdzuna     ProviderID = "adzuna"
	ProviderTheMuse    ProviderID = "themuse"
	ProviderGupy       ProviderID = "gupy"
	ProviderInHire     ProviderID = "inhire"
	ProviderJooble     ProviderID = "jooble"
	ProviderGreenhouse ProviderID = "greenhouse"
	ProviderLever      ProviderID = "lever"
)

var knownProviderIDs = map[ProviderID]struct{}{
	ProviderLinkedIn:   {},
	ProviderAdzuna:     {},
	ProviderTheMuse:    {},
	ProviderGupy:       {},
	ProviderInHire:     {},
	ProviderJooble:     {},
	ProviderGreenhouse: {},
	ProviderLever:      {},
}

func ParseProviderID(value string) (ProviderID, bool) {
	provider := ProviderID(strings.ToLower(strings.TrimSpace(value)))
	_, ok := knownProviderIDs[provider]
	return provider, ok
}

type DiscoveryMode string

const (
	DiscoveryKeyword DiscoveryMode = "keyword"
	DiscoveryBatch   DiscoveryMode = "batch"
	DiscoveryCatalog DiscoveryMode = "catalog"
)

type SourceCapabilities struct {
	Provider ProviderID
	Mode     DiscoveryMode
}

type JobSource interface {
	SourceName() string
	Search(ctx context.Context, keyword string, req domain.ScrapeRequest) ([]domain.Job, error)
}

type CapabilityJobSource interface {
	JobSource
	Capabilities() SourceCapabilities
}

type BatchJobSource interface {
	JobSource
	SearchBatch(ctx context.Context, keywords []string, req domain.ScrapeRequest) ([]domain.Job, error)
}

type CatalogJobSource interface {
	JobSource
	SearchCatalog(ctx context.Context, keywords []string, req domain.ScrapeRequest) ([]domain.Job, error)
}

func CapabilitiesOf(source JobSource) SourceCapabilities {
	if capable, ok := source.(CapabilityJobSource); ok {
		return capable.Capabilities()
	}
	return SourceCapabilities{
		Provider: ProviderID(strings.ToLower(strings.TrimSpace(source.SourceName()))),
		Mode:     DiscoveryKeyword,
	}
}

type JobRepository interface {
	SaveBatch(ctx context.Context, jobs []domain.Job) (int, error)
	GetAll(ctx context.Context) ([]domain.Job, error)
	GetSample(ctx context.Context, limit int) ([]domain.Job, error)
	Count(ctx context.Context) (int64, error)
}

type KeywordRepository interface {
	Load(ctx context.Context) ([]string, error)
	Save(ctx context.Context, keywords []string) error
}

type CacheRepository interface {
	Get(ctx context.Context, key string, target any) (bool, error)
	Set(ctx context.Context, key string, value any, ttl time.Duration) error
	Delete(ctx context.Context, key string) error
	SetNX(ctx context.Context, key string, value any, ttl time.Duration) (bool, error)
}

type MetricsRecorder interface {
	RecordSourceRun(source string, duration time.Duration, jobs int, err error)
	RecordPipelineRun(duration time.Duration, jobs int)
}
