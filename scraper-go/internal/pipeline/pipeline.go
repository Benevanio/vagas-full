package pipeline

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/domain"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/metrics"
	"github.com/Benevanio/Jobs_Scraper_Global/scraper-go/internal/ports"
	"github.com/prometheus/client_golang/prometheus"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

var errInvalidMaxConcurrency = fmt.Errorf("pipeline: max concurrency must be greater than zero")

type result struct {
	jobs []domain.Job
	err  error
}

type adapterTask struct {
	adapter  ports.JobSource
	provider ports.ProviderID
	mode     ports.DiscoveryMode
	keywords []string
}

func Run(ctx context.Context, adapterList []ports.JobSource, req domain.ScrapeRequest) ([]domain.Job, error) {
	return runWithConcurrency(ctx, adapterList, req, 2, nil, defaultProcessConfig())
}

func runWithConcurrency(
	ctx context.Context,
	adapterList []ports.JobSource,
	req domain.ScrapeRequest,
	defaultProviderConcurrency int,
	providerOverrides map[ports.ProviderID]int,
	processCfg processConfig,
) ([]domain.Job, error) {
	pipelineStart := time.Now()

	maxConcurrency := req.MaxConcurrency
	if maxConcurrency <= 0 {
		return nil, errInvalidMaxConcurrency
	}
	if err := validateSources(adapterList); err != nil {
		return nil, err
	}

	budget, err := newConcurrencyBudget(
		maxConcurrency,
		defaultProviderConcurrency,
		providerOverrides,
	)
	if err != nil {
		return nil, err
	}

	queueCapacity := max(1, maxConcurrency*2)
	tasks := make(chan adapterTask, queueCapacity)
	results := make(chan result, queueCapacity)
	incoming := make(chan domain.Job, stageQueueCapacity(processCfg))
	runStats := newProviderRunStats(adapterList, budget)

	var tasksWg sync.WaitGroup
	tasksWg.Add(1 + maxConcurrency)
	go func() {
		defer tasksWg.Done()
		produceTasks(ctx, tasks, adapterList, req.Keywords, runStats)
	}()
	for range maxConcurrency {
		go func() {
			defer tasksWg.Done()
			runWorker(ctx, tasks, results, budget, runStats, req)
		}()
	}

	var gatherWg sync.WaitGroup
	gatherWg.Add(1)
	go func() {
		defer gatherWg.Done()
		tasksWg.Wait()
		close(results)
	}()

	var processWg sync.WaitGroup
	var processed []domain.Job
	var processErr error
	processWg.Add(1)
	go func() {
		defer processWg.Done()
		processed, _, processErr = processIncomingJobs(ctx, incoming, processCfg)
	}()

	var closeIncoming sync.Once
	closeIncomingFn := func() {
		closeIncoming.Do(func() { close(incoming) })
	}
	defer closeIncomingFn()

	for r := range results {
		if r.err != nil {
			continue
		}
		for _, job := range r.jobs {
			if context.Cause(ctx) != nil {
				break
			}
			select {
			case <-ctx.Done():
			case incoming <- job:
			}
		}
	}
	closeIncomingFn()
	processWg.Wait()
	gatherWg.Wait()
	logProviderRunStats(runStats)
	if processErr != nil {
		return nil, processErr
	}
	if cause := context.Cause(ctx); cause != nil {
		return nil, cause
	}

	metrics.PipelineRunDuration.Observe(time.Since(pipelineStart).Seconds())
	metrics.PipelineJobsTotal.Observe(float64(len(processed)))

	return processed, nil
}

type taskCursor struct {
	adapter  ports.JobSource
	provider ports.ProviderID
	mode     ports.DiscoveryMode
	emitted  bool
	next     int
}

type providerTaskCursor struct {
	sources []taskCursor
	next    int
}

func produceTasks(
	ctx context.Context,
	queue chan<- adapterTask,
	adapterList []ports.JobSource,
	keywords []string,
	runStats *providerRunStats,
) {
	defer close(queue)

	providerIndexes := make(map[ports.ProviderID]int)
	cursors := make([]providerTaskCursor, 0, len(adapterList))
	for _, adapter := range adapterList {
		capabilities := ports.CapabilitiesOf(adapter)
		sourceCursor := taskCursor{
			adapter:  adapter,
			provider: capabilities.Provider,
			mode:     capabilities.Mode,
		}
		index, exists := providerIndexes[capabilities.Provider]
		if !exists {
			index = len(cursors)
			providerIndexes[capabilities.Provider] = index
			cursors = append(cursors, providerTaskCursor{})
		}
		cursors[index].sources = append(cursors[index].sources, sourceCursor)
	}

	for {
		produced := false
		for i := range cursors {
			task, ok := cursors[i].nextTask(keywords)
			if !ok {
				continue
			}
			produced = true
			if cause := context.Cause(ctx); cause != nil {
				return
			}
			select {
			case queue <- task:
				runStats.recordProduced(task)
			case <-ctx.Done():
				return
			}
		}
		if !produced {
			return
		}
	}
}

func (c *providerTaskCursor) nextTask(keywords []string) (adapterTask, bool) {
	if len(c.sources) == 0 {
		return adapterTask{}, false
	}

	for range len(c.sources) {
		index := c.next % len(c.sources)
		c.next = (index + 1) % len(c.sources)
		if task, ok := c.sources[index].nextTask(keywords); ok {
			return task, true
		}
	}
	return adapterTask{}, false
}

func (c *taskCursor) nextTask(keywords []string) (adapterTask, bool) {
	if c.mode == ports.DiscoveryBatch || c.mode == ports.DiscoveryCatalog {
		if c.emitted {
			return adapterTask{}, false
		}
		c.emitted = true
		return adapterTask{
			adapter:  c.adapter,
			provider: c.provider,
			mode:     c.mode,
			keywords: append([]string(nil), keywords...),
		}, true
	}

	if c.next >= len(keywords) {
		return adapterTask{}, false
	}
	task := adapterTask{
		adapter:  c.adapter,
		provider: c.provider,
		mode:     c.mode,
		keywords: []string{keywords[c.next]},
	}
	c.next++
	return task, true
}

func validateSources(adapterList []ports.JobSource) error {
	for _, source := range adapterList {
		capabilities := ports.CapabilitiesOf(source)
		if _, explicit := source.(ports.CapabilityJobSource); explicit {
			provider, known := ports.ParseProviderID(string(capabilities.Provider))
			if !known || provider != capabilities.Provider {
				return fmt.Errorf(
					"pipeline: source %q declares invalid provider %q",
					source.SourceName(),
					capabilities.Provider,
				)
			}
		}

		switch capabilities.Mode {
		case ports.DiscoveryKeyword:
		case ports.DiscoveryBatch:
			if _, ok := source.(ports.BatchJobSource); !ok {
				return fmt.Errorf(
					"pipeline: provider %s declares batch mode without BatchJobSource",
					capabilities.Provider,
				)
			}
		case ports.DiscoveryCatalog:
			if _, ok := source.(ports.CatalogJobSource); !ok {
				return fmt.Errorf(
					"pipeline: provider %s declares catalog mode without CatalogJobSource",
					capabilities.Provider,
				)
			}
		default:
			return fmt.Errorf(
				"pipeline: provider %s declares invalid discovery mode %q",
				capabilities.Provider,
				capabilities.Mode,
			)
		}
	}
	return nil
}

func runWorker(
	ctx context.Context,
	tasks <-chan adapterTask,
	results chan<- result,
	budget *concurrencyBudget,
	runStats *providerRunStats,
	req domain.ScrapeRequest,
) {
	for {
		if context.Cause(ctx) != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		case task, ok := <-tasks:
			if !ok {
				return
			}
			if context.Cause(ctx) != nil {
				return
			}
			runScheduledTask(ctx, task, results, budget, runStats, req)
		}
	}
}

func runScheduledTask(
	ctx context.Context,
	task adapterTask,
	results chan<- result,
	budget *concurrencyBudget,
	runStats *providerRunStats,
	req domain.ScrapeRequest,
) {
	permit, err := budget.acquire(ctx, task.provider)
	if err != nil {
		return
	}
	defer permit.release()

	source := string(task.provider)
	started := time.Now()
	timer := prometheus.NewTimer(metrics.ScrapeDurationSeconds.WithLabelValues(source))
	jobs, err := runAdapterTask(ctx, task, req)
	timer.ObserveDuration()
	runStats.recordCompleted(ctx, task, err, time.Since(started))

	metrics.ScrapeRunsTotal.WithLabelValues(source).Inc()
	if err != nil {
		metrics.ScrapeErrorsTotal.WithLabelValues(source).Inc()
	} else {
		metrics.JobsFoundTotal.WithLabelValues(source).Add(float64(len(jobs)))
	}

	select {
	case results <- result{jobs: jobs, err: err}:
	case <-ctx.Done():
	}
}

func logProviderRunStats(runStats *providerRunStats) {
	for _, summary := range runStats.snapshots() {
		attrs := []any{
			"provider", summary.Provider,
			"mode", summary.Mode,
			"produced", summary.Produced,
			"completed", summary.Completed,
			"cancelled", summary.Cancelled,
			"errors", summary.Errors,
			"timeouts", summary.Timeouts,
			"max_concurrency_effective", summary.MaxConcurrencyEffective,
			"duration", summary.Duration.Round(time.Millisecond),
		}
		if summary.StopCause != "" {
			attrs = append(attrs, "stop_cause", summary.StopCause)
		}
		if sample := summary.ErrorSample; sample != nil {
			attrs = append(attrs, slog.Group("error_sample",
				"provider", sample.Provider,
				"source", sample.Source,
				"mode", sample.Mode,
				"error", sample.Error,
			))
		}
		slog.Info("scraper provider execution summary", attrs...)
	}
}

func runAdapterTask(ctx context.Context, t adapterTask, req domain.ScrapeRequest) ([]domain.Job, error) {
	switch t.mode {
	case ports.DiscoveryBatch:
		batchAdapter, ok := t.adapter.(ports.BatchJobSource)
		if !ok {
			return nil, fmt.Errorf("pipeline: provider %s does not implement batch discovery", t.provider)
		}
		return batchAdapter.SearchBatch(ctx, t.keywords, req)
	case ports.DiscoveryCatalog:
		catalogAdapter, ok := t.adapter.(ports.CatalogJobSource)
		if !ok {
			return nil, fmt.Errorf("pipeline: provider %s does not implement catalog discovery", t.provider)
		}
		return catalogAdapter.SearchCatalog(ctx, t.keywords, req)
	}

	keyword := ""
	if len(t.keywords) > 0 {
		keyword = t.keywords[0]
	}

	return t.adapter.Search(ctx, keyword, req)
}

func classificationIndexKeys(job domain.Job) []string {
	if job.Classification == nil {
		return nil
	}

	classification := job.Classification
	if !classification.InScope {
		return nil
	}

	values := make([]string, 0, 1+len(classification.RelatedFamilies)+len(classification.Technologies))

	if classification.PrimaryFamily != "" {
		normalized := normalizeIndexValue(classification.PrimaryFamily)
		if normalized != "" {
			values = append(values,
				fmt.Sprintf("scraper:jobs:family:%s", normalized),
				fmt.Sprintf("scraper:jobs:keyword:%s", normalized),
			)
		}
	}
	for _, family := range classification.RelatedFamilies {
		normalized := normalizeIndexValue(family)
		if normalized != "" {
			values = append(values,
				fmt.Sprintf("scraper:jobs:family:%s", normalized),
				fmt.Sprintf("scraper:jobs:keyword:%s", normalized),
			)
		}
	}
	for _, technology := range classification.Technologies {
		normalized := normalizeIndexValue(technology)
		if normalized != "" {
			values = append(values,
				fmt.Sprintf("scraper:jobs:technology:%s", normalized),
				fmt.Sprintf("scraper:jobs:keyword:%s", normalized),
			)
		}
	}
	if classification.Seniority != "" {
		normalized := normalizeIndexValue(classification.Seniority)
		if normalized != "" {
			values = append(values, fmt.Sprintf("scraper:jobs:seniority:%s", normalized))
		}
	}

	return uniqueStrings(values)
}

func structuredIndexKeys(job domain.Job) []string {
	values := map[string]string{
		"level":    inferLevel(job),
		"model":    inferWorkModel(job),
		"contract": inferContract(job),
	}

	for key, value := range inferLocation(job.Location) {
		values[key] = value
	}

	keys := make([]string, 0, len(values))
	for kind, value := range values {
		normalized := normalizeIndexValue(value)
		if normalized == "" || normalized == "todos" || normalized == "all" {
			continue
		}
		keys = append(keys, fmt.Sprintf("scraper:jobs:%s:%s", kind, normalized))
	}

	return keys
}

func normalizeIndexValue(value string) string {
	t := transform.Chain(norm.NFD, transform.RemoveFunc(func(r rune) bool {
		return unicode.Is(unicode.Mn, r)
	}), norm.NFC)

	result, _, _ := transform.String(t, value)
	result = strings.ReplaceAll(result, "/", " ")

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

func keywordSearchText(job domain.Job) string {
	return normalizeIndexValue(strings.Join([]string{
		job.Title,
		job.Company,
		job.Location,
		job.Modality,
		job.Description,
	}, " "))
}

func searchableJobText(job domain.Job) string {
	return normalizeIndexValue(strings.Join([]string{
		job.Title,
		job.Company,
		job.Location,
		job.Modality,
		job.Description,
	}, " "))
}

func keywordSubTerms(keyword string) []string {
	terms := strings.Fields(normalizeIndexValue(keyword))
	if len(terms) >= 2 && terms[0] == "node" && terms[1] == "js" {
		terms = append(terms, "nodejs")
	}
	return uniqueStrings(terms)
}

func keywordIndexAliases(keyword string) []string {
	sanitized := strings.Join(strings.Fields(strings.ReplaceAll(strings.ToLower(keyword), "/", " ")), " ")
	normalized := normalizeIndexValue(keyword)

	aliases := []string{sanitized, normalized}
	if strings.Contains(normalized, "node js") {
		aliases = append(aliases, strings.ReplaceAll(normalized, "node js", "nodejs"), "nodejs", "node")
	}

	return uniqueStrings(aliases)
}

func keywordMatches(searchText, keyword string) bool {
	terms := strings.Fields(normalizeIndexValue(keyword))
	if len(terms) == 0 {
		return false
	}

	for i := 0; i < len(terms); i++ {
		term := terms[i]
		if term == "node" && i+1 < len(terms) && terms[i+1] == "js" {
			if !containsTokenOrPhrase(searchText, "node js") && !containsTokenOrPhrase(searchText, "nodejs") {
				return false
			}
			i++
			continue
		}
		if !containsTokenOrPhrase(searchText, term) {
			return false
		}
	}

	return true
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func inferLevel(job domain.Job) string {
	text := searchableJobText(job)

	if containsAny(text, "estagio", "intern", "trainee") {
		return "estagio"
	}
	if containsAny(text, "senior", "sr", "especialista", "lead", "principal", "staff") {
		return "senior"
	}
	if containsAny(text, "junior", "jr", "entry level", "assistente") {
		return "junior"
	}

	return "pleno"
}

func inferWorkModel(job domain.Job) string {
	text := searchableJobText(job)

	if containsAny(text, "hibrido", "hybrid") {
		return "hibrido"
	}
	if containsAny(text,
		"remoto",
		"remote",
		"home office",
		"teletrabalho",
		"anywhere",
		"worldwide",
		"global",
	) {
		return "remoto"
	}
	if containsAny(text,
		"presencial",
		"onsite",
		"on site",
		"on-site",
		"in office",
		"escritorio",
	) {
		return "presencial"
	}

	return "presencial"
}

func inferContract(job domain.Job) string {
	text := searchableJobText(job)

	if containsAny(text, "cooperado", "cooperativa") {
		return "cooperado"
	}
	if containsAny(text, "pj", "pessoa juridica", "contractor", "freelance", "freela") {
		return "pj"
	}
	if containsAny(text, "clt", "full time", "full-time", "efetivo", "permanent") {
		return "clt"
	}

	return ""
}

func inferLocation(location string) map[string]string {
	text := normalizeIndexValue(location)
	values := make(map[string]string)
	if text == "" {
		return values
	}

	type countryRule struct {
		country   string
		continent string
		aliases   []string
	}

	rules := []countryRule{
		{"Brasil", "América do Sul", []string{"brasil", "brazil", "br"}},
		{"Estados Unidos", "América do Norte", []string{"estados unidos", "united states", "usa", "us", "eua"}},
		{"Canadá", "América do Norte", []string{"canada", "canadá"}},
		{"México", "América do Norte", []string{"mexico", "méxico"}},
		{"Argentina", "América do Sul", []string{"argentina"}},
		{"Chile", "América do Sul", []string{"chile"}},
		{"Colômbia", "América do Sul", []string{"colombia", "colômbia"}},
		{"Portugal", "Europa", []string{"portugal"}},
		{"Espanha", "Europa", []string{"spain", "espanha", "espana", "españa"}},
		{"Reino Unido", "Europa", []string{"reino unido", "united kingdom", "uk", "england", "london"}},
		{"França", "Europa", []string{"france", "frança", "franca"}},
		{"Alemanha", "Europa", []string{"germany", "alemanha", "deutschland"}},
		{"Países Baixos", "Europa", []string{"netherlands", "paises baixos", "holanda"}},
		{"Índia", "Ásia", []string{"india", "índia"}},
		{"Singapura", "Ásia", []string{"singapore", "singapura"}},
		{"Austrália", "Oceania", []string{"australia", "austrália"}},
		{"Nova Zelândia", "Oceania", []string{"new zealand", "nova zelandia", "nova zelândia"}},
		{"África do Sul", "África", []string{"south africa", "africa do sul", "áfrica do sul"}},
	}

	for _, rule := range rules {
		for _, alias := range rule.aliases {
			if containsTokenOrPhrase(text, normalizeIndexValue(alias)) {
				values["country"] = rule.country
				values["location"] = rule.country
				values["continent"] = rule.continent
				break
			}
		}
		if values["country"] != "" {
			break
		}
	}

	if values["continent"] == "" && containsAny(text, "remote", "remoto", "global", "worldwide") {
		values["continent"] = "Global / Remoto"
		values["location"] = "Global / Remoto"
	}

	if state := inferBrazilianState(text); state != "" {
		values["state"] = state
		if values["country"] == "" {
			values["country"] = "Brasil"
			values["location"] = "Brasil"
			values["continent"] = "América do Sul"
		}
	}
	if city := inferKnownCity(text); city != "" {
		values["city"] = city
	}

	return values
}

func inferBrazilianState(text string) string {
	states := map[string][]string{
		"SP": {"sp", "sao paulo"},
		"RJ": {"rj", "rio de janeiro"},
		"MG": {"mg", "minas gerais", "belo horizonte"},
		"PR": {"pr", "parana", "curitiba"},
		"SC": {"sc", "santa catarina", "florianopolis"},
		"RS": {"rs", "rio grande do sul", "porto alegre"},
		"BA": {"ba", "bahia", "salvador"},
		"PE": {"pe", "pernambuco", "recife"},
		"CE": {"ce", "ceara", "fortaleza"},
		"DF": {"df", "distrito federal", "brasilia"},
	}

	for state, aliases := range states {
		for _, alias := range aliases {
			if containsTokenOrPhrase(text, normalizeIndexValue(alias)) {
				return state
			}
		}
	}

	return ""
}

func inferKnownCity(text string) string {
	cities := []string{
		"sao paulo",
		"rio de janeiro",
		"belo horizonte",
		"curitiba",
		"joinville",
		"florianopolis",
		"porto alegre",
		"salvador",
		"recife",
		"fortaleza",
		"brasilia",
		"lisboa",
		"porto",
		"madrid",
		"barcelona",
		"london",
		"paris",
		"berlin",
		"amsterdam",
		"toronto",
		"vancouver",
		"new york",
		"san francisco",
		"singapore",
		"sydney",
	}

	for _, city := range cities {
		if containsTokenOrPhrase(text, city) {
			return city
		}
	}

	return ""
}

func containsAny(text string, needles ...string) bool {
	for _, needle := range needles {
		if containsTokenOrPhrase(text, normalizeIndexValue(needle)) {
			return true
		}
	}
	return false
}

func containsTokenOrPhrase(text string, needle string) bool {
	if needle == "" {
		return false
	}
	if strings.Contains(needle, " ") {
		return strings.Contains(text, needle)
	}

	return strings.Contains(" "+text+" ", " "+needle+" ")
}
