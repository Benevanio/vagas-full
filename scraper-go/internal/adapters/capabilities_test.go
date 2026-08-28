package adapters_test

import (
	"testing"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/adzuna"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/greenhouse"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/gupy"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/inhire"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/jooble"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/lever"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/linkedin"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/adapters/themuse"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRegisteredAdapterTypesDeclareCanonicalCapabilities(t *testing.T) {
	cases := []struct {
		name     string
		source   ports.JobSource
		provider ports.ProviderID
		mode     ports.DiscoveryMode
	}{
		{"linkedin", linkedin.NewLinkedIn(), ports.ProviderLinkedIn, ports.DiscoveryBatch},
		{"adzuna", adzuna.NewAdzuna("id", "key", "br"), ports.ProviderAdzuna, ports.DiscoveryBatch},
		{"themuse", themuse.NewTheMuse(), ports.ProviderTheMuse, ports.DiscoveryCatalog},
		{"gupy", gupy.NewGupy(), ports.ProviderGupy, ports.DiscoveryBatch},
		{"inhire", inhire.NewInHire(), ports.ProviderInHire, ports.DiscoveryCatalog},
		{"jooble", jooble.NewJooble("key", nil), ports.ProviderJooble, ports.DiscoveryBatch},
		{"greenhouse", greenhouse.NewGreenhouse("board", "Company"), ports.ProviderGreenhouse, ports.DiscoveryCatalog},
		{"lever", lever.NewLever("company", "Company"), ports.ProviderLever, ports.DiscoveryCatalog},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			capable, ok := tc.source.(ports.CapabilityJobSource)
			require.True(t, ok)
			capabilities := capable.Capabilities()
			assert.Equal(t, tc.provider, capabilities.Provider)
			assert.Equal(t, tc.mode, capabilities.Mode)

			switch tc.mode {
			case ports.DiscoveryBatch:
				_, ok = tc.source.(ports.BatchJobSource)
			case ports.DiscoveryCatalog:
				_, ok = tc.source.(ports.CatalogJobSource)
			}
			assert.True(t, ok)
		})
	}
}
