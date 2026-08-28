package ports

import (
	"context"
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fallbackSource struct{}

func (fallbackSource) SourceName() string {
	return "Legacy Source"
}

func (fallbackSource) Search(context.Context, string, domain.ScrapeRequest) ([]domain.Job, error) {
	return nil, nil
}

func TestParseProviderIDUsesCanonicalCaseInsensitiveNames(t *testing.T) {
	provider, ok := ParseProviderID(" GreenHouse ")

	require.True(t, ok)
	assert.Equal(t, ProviderGreenhouse, provider)
}

func TestParseProviderIDRejectsUnknownProvider(t *testing.T) {
	_, ok := ParseProviderID("unknown")

	assert.False(t, ok)
}

func TestCapabilitiesOfPreservesLegacySourceAsKeyword(t *testing.T) {
	capabilities := CapabilitiesOf(fallbackSource{})

	assert.Equal(t, ProviderID("legacy source"), capabilities.Provider)
	assert.Equal(t, DiscoveryKeyword, capabilities.Mode)
}
