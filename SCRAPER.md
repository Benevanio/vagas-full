# Scraper Go - Documentação

Este documento descreve o scraper implementado em Go localizado em `scraper-go/`.

## Visão geral

O scraper Go concentra a coleta e normalização de vagas. Ele recebe configurações de busca do backend, executa fontes externas habilitadas, aplica deduplicação e classificação local, persiste vagas no Valkey e publica índices para a API consultar com baixa latência.

## Exemplos por adaptador

Abaixo há exemplos simplificados do payload esperado internamente e de como cada adaptador normalmente formata/retorna vagas.

- LinkedIn
  - Comportamento: consulta o endpoint público `jobs-guest` e faz parsing HTML com `goquery`.
  - Exemplo (Job individual retornado pelo adaptador):

```json
{
  "id": "24a1b2c3d4e5f6a7b8c9d0e1",
  "title": "Frontend Engineer",
  "company": "Empresa X",
  "location": "São Paulo, SP",
  "url": "https://www.linkedin.com/jobs/view/123456789/",
  "source": "LinkedIn",
  "sources": ["LinkedIn"],
  "keyword": "react",
  "keywords": ["react"]
}
```

- Adzuna
  - Comportamento: usa API oficial (quando `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` configurados) e retorna JSON com campos estruturados.
  - Operação: suporta `SearchBatch` com slot rotativo de keywords e limite padrão de 5 páginas por keyword.
  - Exemplo (Job adaptado):

```json
{
  "id": "adzuna-987654",
  "title": "Desenvolvedor Backend",
  "company": "ACME",
  "location": "Remoto",
  "url": "https://www.adzuna.com/descricao/987654",
  "source": "Adzuna",
  "sources": ["Adzuna"],
  "keyword": "node",
  "keywords": ["node"]
}
```

- Jooble
  - Comportamento: integra com Jooble API quando `JOOBLE_API_KEY` presente; pode usar Redis para controle de cota.
  - Operação: usa slot rotativo, cota diária e cadência de 12h para proteger a integração.
  - Exemplo (Job adaptado):

```json
{
  "id": "jooble-13579",
  "title": "Data Engineer",
  "company": "Empresa Y",
  "location": "Curitiba, PR",
  "url": "https://jooble.org/vaga/13579",
  "source": "Jooble",
  "sources": ["Jooble"],
  "keyword": "data",
  "keywords": ["data"]
}
```

- Greenhouse / Lever / TheMuse
  - Comportamento: adaptadores per-company que fazem scraping/parsing da vaga ou consomem endpoints públicos por empresa.
  - Exemplo (job adaptado genérico):

```json
{
  "id": "greenhouse-abc123",
  "title": "Product Manager",
  "company": "Startup Z",
  "location": "Los Angeles, CA",
  "url": "https://boards.greenhouse.io/companyz/jobs/321",
  "source": "Greenhouse",
  "sources": ["Greenhouse"],
  "keyword": "product",
  "keywords": ["product"]
}
```

### Descobrir tokens do Greenhouse

O `board_token` é o trecho final da URL pública da Greenhouse. Por exemplo:

- `https://job-boards.greenhouse.io/reddit` → token `reddit`
- `https://job-boards.greenhouse.io/gitlab` → token `gitlab`

Para validar tokens ou testar nomes de empresas, use:

```bash
cd scraper-go
go run ./cmd/greenhouse-discover -names Reddit,GitLab
```

Saída esperada:

```text
OK   gitlab                             186 vagas  https://job-boards.greenhouse.io/gitlab
OK   reddit                             195 vagas  https://job-boards.greenhouse.io/reddit
```

Também é possível validar o JSON atual:

```bash
cd scraper-go
go run ./cmd/greenhouse-discover -file internal/interfaces/greenhouseCompanies.json
```

Tokens com `OK` podem entrar em `internal/interfaces/greenhouseCompanies.json`.
Tokens com `MISS status=404` devem ser removidos ou substituídos.

Esses exemplos ilustram o contrato interno entre adaptadores e pipeline: o pipeline espera `domain.Job` com campos normalizados (URL limpa, título/empresa/local, `Source` e `StableID` calculável). O `jobstore.StableID` deriva o ID a partir de título+empresa+local ou URL.

## Especificação OpenAPI (local)

Criei uma especificação OpenAPI mínima em `openapi.yaml` descrevendo os endpoints HTTP públicos do serviço Go (`/scrape`, `/api/keywords`). Ela pode ser usada para gerar clientes ou documentação interativa.

Arquivo: `scraper-go/openapi.yaml` (no repositório)

---

O scraper é um serviço HTTP em Go que consulta múltiplas fontes de vagas (LinkedIn, Adzuna, Greenhouse, TheMuse, Lever, Jooble, etc.), agrega os resultados, remove duplicatas e persiste/retorna as vagas via cache e índice Redis/Valkey. Ele foi projetado para ser usado internamente pelo backend Node.js, que delega buscas ao serviço Go.

Componentes principais:

- `cmd/server` — inicializador e ponto de entrada.
- `internal/domain` — modelos centrais do scraper (`Job`, `ScrapeRequest`, `ScrapeResponse`, classificação).
- `internal/ports` — contratos internos da aplicação, como fontes de vagas, repositórios, cache e métricas.
- `internal/adapters` — composição de adapters concretos e registry das fontes habilitadas.
- `internal/adapters/<fonte>` — implementação isolada de cada fonte externa (`gupy`, `inhire`, `greenhouse`, `lever`, `jooble`, `linkedin`, `themuse`, `adzuna`).
- `internal/adapters/adapterutil` — helpers compartilhados entre adapters concretos.
- `internal/pipeline` — camada de aplicação do pipeline de scraping, orquestra execução concorrente e indexação.
- `internal/jobstore` — persistência em Redis (valkey) para jobs, índices e IDs estáveis.
- `internal/cache` — abstração de cache com implementação Redis e memória (fallback).
- `internal/dedup` — regras para deduplicação/merge de vagas.
- `internal/keywords` — carregamento e persistência de keywords (configuração).
- `internal/inflight` — deduplicador de requisições concorrentes (singleflight).
- `internal/cronjob` — scheduler de scraping em background e execução manual.
- `internal/metrics` — métricas Prometheus por fonte/execução.
- `cmd/greenhouse-discover` — utilitário Go para validar tokens de empresas Greenhouse antes de atualizar `internal/interfaces/greenhouseCompanies.json`.

## Arquitetura atual

O scraper evolui para uma arquitetura hexagonal de forma incremental. O domínio fica em `internal/domain`, as portas em `internal/ports` e os adapters concretos ficam em subpastas de `internal/adapters`.

A fronteira principal é a porta `ports.JobSource`: cada fonte externa implementa `SourceName`, `Search` e, opcionalmente, `SearchBatch`. O pipeline recebe uma lista de `ports.JobSource` já montada pelo servidor/registry, evitando que a camada de aplicação conheça diretamente as implementações concretas.

Desenho atual:

```text
cmd/server
  monta cache, Valkey, stores, scheduler e adapters

internal/domain
  modelos centrais do scraper

internal/ports
  contratos que a aplicação consome

internal/pipeline
  orquestra scraping, dedupe, classificação e indexação

internal/adapters
  registry e implementações concretas por fonte
```

Ainda há pontos a evoluir: `pipeline` e `cronjob` continuam recebendo `*redis.Client` em fluxos de indexação/cadência, e métricas Prometheus ainda são chamadas diretamente. Os próximos passos naturais são criar adapters outbound para Valkey e Prometheus por trás de portas específicas, reduzindo ainda mais o acoplamento de infraestrutura.

## Como executar

Requisitos: Go >= 1.26, Redis (opcional, mas recomendado)

Construir e executar:

```bash
cd scraper-go
go build ./cmd/server
./server
```

Rodar em desenvolvimento (carregando `.env`):

```bash
cd scraper-go
go run ./cmd/server
```

Docker: há um `Dockerfile` em `scraper-go/`. No Docker Compose, configure `VALKEY_URL=redis://valkey:6379/0` no `.env` da raiz para que o scraper acesse o Valkey pelo nome do serviço na rede Docker.

No Compose da raiz, a porta `8081` fica exposta apenas na rede interna `vagas-net`; ela não é publicada no host. O backend acessa o serviço por `http://scraper-go:8081`. Para testes locais diretos, execute o binário fora do Compose ou use um override de desenvolvimento que publique a porta somente em interface confiável.

### Limites globais de execução

O scraper possui um orçamento global e limites por provider controlados pelo scheduler do pipeline:

- `SCRAPER_MAX_CONCURRENCY`: teto global. Padrão interno `12`.
- `SCRAPER_PROVIDER_MAX_CONCURRENCY`: limite padrão por provider. Padrão interno `2`.
- `SCRAPER_PROVIDER_CONCURRENCY_OVERRIDES`: overrides separados por vírgula no formato `provider=limite`, por exemplo `linkedin=1,gupy=3`.
- IDs aceitos nos overrides: `linkedin`, `adzuna`, `themuse`, `gupy`, `inhire`, `jooble`, `greenhouse` e `lever`.
- Limites devem ser inteiros positivos e não podem superar o teto global. Provider desconhecido, entrada malformada ou duplicada impede o startup.
- Valores inválidos explícitos nas variáveis numéricas (`""`, `0`, negativo ou não numérico) fazem a aplicação falhar no startup, sem fallback silencioso; overrides vazios significam que nenhum provider foi sobrescrito.
- Cron e `POST /admin/scrape` usam o limite global configurado.
- `POST /scrape` preserva o contrato atual: quando `maxConcurrency` não é informado, ou vem como `0`/negativo, usa o limite global; quando vem positivo abaixo do teto, usa o valor solicitado; quando vem acima do teto, usa o teto global.
- A concorrência global efetiva continua fazendo parte da chave de cache. Limites por provider são parâmetros operacionais e não alteram a chave.
- Cada tarefa adquire primeiro o permit do provider e depois o permit global; o limite efetivo do provider é sempre o menor entre seu limite configurado e o global da requisição.
- O lock distribuído abaixo impede que duas execuções mantenham orçamentos independentes ao mesmo tempo.

### Lock distribuído de execução

Todas as origens que iniciam adapters compartilham o lock `scraper:run:lock` no Valkey:

- cron (`source=cron`);
- disparo administrativo (`source=admin_manual`);
- cache miss de `POST /scrape` (`source=public_endpoint`).

Cache hits de `POST /scrape` não executam adapters e, por isso, não adquirem o lock. A aquisição usa `SET ... NX PX` com token aleatório por execução. Renovação e liberação usam scripts Lua que comparam o token; não existe `DEL` incondicional. O estado informativo fica no hash `scraper:run:state`, com `runId`, `source`, `startedAt` e `lockExpiresAt`, e possui o mesmo TTL do lock.

Configuração:

- `SCRAPER_RUN_LOCK_TTL`: padrão `120s`;
- `SCRAPER_RUN_LOCK_RENEW_INTERVAL`: padrão `30s`, obrigatoriamente positivo e menor que o TTL.

No Compose, ambas usam substituição `${VAR-default}` (não `:-`), no mesmo padrão fail-fast de `SCRAPER_MAX_CONCURRENCY`: variável ausente aplica o default; valor explícito vazio ou inválido chega ao parser Go e impede a inicialização.

O mecanismo é fail-closed: se o Valkey não confirmar a aquisição, nenhum adapter é iniciado. Erros temporários de renovação são tolerados até a margem segura; perda confirmada do token ou ausência de confirmação antes dessa margem cancela o contexto da execução. A liberação ocorre no encerramento e só remove chaves pertencentes ao token atual; em crash abrupto, o TTL é a proteção final. No graceful shutdown, o scheduler deixa de aceitar novos disparos e aguarda as execuções ativas liberarem o lock antes do processo encerrar.

O token proprietário nunca é gravado no estado operacional nem nos logs. Um `runId` independente identifica a execução para observabilidade sem expor a credencial usada pelos scripts de renovação e liberação.

No Docker Compose de produção, o serviço `scraper-go` também define:

- `GOMAXPROCS=2`: limita a quantidade de threads do Go executando código simultaneamente.
- `GOMEMLIMIT=1500MiB`: define uma meta de memória para o runtime e influencia o garbage collector.
- `mem_limit: 2g`: limite externo do container. `GOMEMLIMIT` não substitui esse limite; ele fica abaixo de `2g` para preservar margem operacional.
- `cpus: 1.5`: limita o container a 1,5 CPU.

## Endpoints HTTP

O serviço expõe endpoints HTTP (implementação em `cmd/server` e arquivos associados). Principais rotas:

- POST `/scrape` — body JSON com `ScrapeRequest` para disparar uma busca em todas as fontes configuradas. Retorna `ScrapeResponse` com `jobs`, `total`, `cachedAt` e `fromCache`.
- GET `/health` — verifica se o scraper está online e qual cache está em uso.
- GET `/metrics` — métricas Prometheus.
- GET `/api/keywords` — retorna as keywords atualmente carregadas.
- POST `/api/keywords` — atualiza/persiste as keywords (aceita `keywords: string[]`).
- POST `/admin/scrape` — dispara uma execução manual em background; retorna `409` com `SCRAPER_ALREADY_RUNNING` se já houver execução e `503` com `SCRAPER_RUN_LOCK_UNAVAILABLE` se o Valkey não confirmar a aquisição.
- GET `/admin/scrape/status` — informa se existe uma execução em andamento.
- GET `/admin/jobs/count` — retorna a quantidade de vagas persistidas no Valkey.
- GET `/admin/jobs` — lista uma amostra das vagas persistidas no Valkey; aceita `limit`.

Exemplo de `ScrapeRequest` (JSON):

```json
{
  "keywords": ["react", "node"],
  "searchLocation": "Brasil",
  "searchGeoId": "106057199",
  "searchLanguage": "pt",
  "jobTypes": "C,F",
  "timeFilter": "r604800",
  "remoteOnly": true,
  "resultsPerPage": 25,
  "maxPagesPerKeyword": 5,
  "waitBetweenSearchesMs": 3000,
  "pageTimeoutMs": 15000,
  "maxConcurrency": 50
}
```

Exemplo de `ScrapeResponse` (JSON):

```json
{
  "jobs": [
    {
      "id": "...",
      "title": "Frontend Engineer",
      "company": "Empresa X",
      "location": "São Paulo, SP",
      "url": "https://...",
      "source": "LinkedIn",
      "sources": ["LinkedIn"],
      "keyword": "react",
      "keywords": ["react"]
    }
  ],
  "total": 1,
  "cachedAt": "2026-05-26T10:00:00Z",
  "fromCache": false
}
```

> Observação: os endpoints acima refletem a implementação atual em `scraper-go/cmd/server`.

## Pipeline de scraping

Fluxo principal:

1. Recebe `ScrapeRequest` com keywords e configuração.
2. Verifica cache (`internal/cache`). Se encontrado, retorna resultado cacheado.
3. Caso contrário, executa `pipeline.ScrapeAllSources` que:
   - Recebe a lista de fontes já montada pelo servidor/registry.
   - Valida o ID, o modo de descoberta e a interface declarada por cada fonte antes de iniciar workers.
   - Produz tarefas sob demanda em round-robin para uma fila limitada, consumida por um conjunto fixo de workers.
   - Cria uma tarefa por keyword no modo `keyword`, uma tarefa com o conjunto controlado no modo `batch` e uma tarefa por catálogo/instância no modo `catalog`.
   - Cada adaptador realiza requisições HTTP específicas, parseia HTML/JSON quando necessário e retorna `domain.Job`.
   - Agrega resultados e aplica deduplicação (`dedup.DedupeJobs`).
   - Classifica vagas por família, tecnologias e senioridade antes da indexação.
   - Persiste vagas novas no `jobstore` (Redis) e atualiza índices invertidos (função `IndexJobsInValkey`).
   - Escreve resultado no cache para próximas requisições.

Concorrência e resiliência:

- Orçamento global e por provider aplicado pelo pipeline; adapters não criam fan-out concorrente independente.
- Fila de tarefas limitada a duas vezes o teto global e workers fixos evitam materializar `adapters × keywords` ou abrir uma goroutine por tarefa.
- O produtor round-robin evita que um provider com muitas instâncias monopolize a fila.
- Cancelamento interrompe produção, espera por permits, paginação, retries e requisições HTTP; tarefas novas não começam após a perda do contexto/lock.
- Tratamento de status 429 com backoff; aborta apenas a keyword afetada em caso de falhas persistentes.
- Uso de `inflight` para evitar que múltiplas requisições idênticas disparem scrapes simultâneos.
- Slots rotativos reduzem o número de keywords/queries por rodada em fontes caras, preservando cobertura progressiva em execuções futuras.

## Adaptadores

Cada adaptador em `internal/adapters/<fonte>` implementa `ports.JobSource` e declara `ProviderID` e `DiscoveryMode`. Fontes `batch` implementam `ports.BatchJobSource`; fontes `catalog` implementam `ports.CatalogJobSource`. Fontes legadas sem capacidade explícita usam o fallback `keyword`.
Implementações incluem:

- `internal/adapters/linkedin` — busca via endpoint público `jobs-guest` do LinkedIn; parsing com `goquery`.
- `internal/adapters/adzuna` — integra via API Adzuna (se configurada com `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`).
- `internal/adapters/jooble` — integra com Jooble API (se `JOOBLE_API_KEY` configurada); pode usar Redis para quota.
- `internal/adapters/greenhouse`, `internal/adapters/lever`, `internal/adapters/themuse` — adaptadores por empresa/plataforma com parsing/integração próprios.
- `internal/adapters/gupy`, `internal/adapters/inhire` — adaptadores para fontes usadas no fluxo atual de vagas.

### Estratégia por fonte

- LinkedIn: sempre habilitado; `SearchBatch` seleciona um slot rotativo de keywords por execução. Defaults atuais: 5 páginas por keyword e 30 keywords por rodada.
- Adzuna: habilitado quando `ADZUNA_APP_ID` e `ADZUNA_APP_KEY` existem; `SearchBatch` usa slot rotativo. Defaults atuais: 5 páginas por keyword e 30 keywords por rodada.
- Gupy: habilitado com `GUPY_ENABLED=true`; usa queries expandidas, descoberta por termos amplos e sweep opcional. O default atual limita o sweep a offset 10000 e processa 60 queries por rodada.
- Jooble: habilitado com `JOOBLE_API_KEY`; usa cota diária, slot rotativo e cadência de 12h.
- Greenhouse: habilitado com `GREENHOUSE_ENABLED=true`; cria um catálogo por empresa listada em `internal/interfaces/greenhouseCompanies.json`, consulta cada catálogo uma vez e agrega todas as keywords correspondentes sem duplicar a vaga.
- Lever: habilitado com `LEVER_ENABLED=true`; cria catálogos por empresa a partir de `internal/interfaces/leverCompanies.json`.
- The Muse: consulta o catálogo uma vez por execução e filtra todas as keywords localmente.
- InHire: habilitado com `INHIRE_ENABLED=true`; consulta tenants serialmente e só enriquece detalhes quando `INHIRE_ENRICH_DETAILS=true`.

Boas práticas nos adaptadores:

- Normalização de campos (URL, título, empresa, localização).
- Derivação de `ID` estável via `jobstore.StableID` (título+empresa+local ou URL normalizada).
- Dedupe local antes de retornar ao pipeline.

## Persistência e índice (Valkey)

- `jobstore.SaveBatch` persiste vagas no Redis com TTL e mantém um índice global (`scraper:jobs:index`).
- `pipeline.IndexJobsInValkey` cria índices invertidos por keyword e sub-termos (`scraper:jobs:keyword:<term>`), além de manter TTL para índices.
- A classificação local também gera índices estruturados: `scraper:jobs:family:<family>`, `scraper:jobs:technology:<technology>` e `scraper:jobs:seniority:<seniority>`.
- Filtros estruturados de localização, modelo, contrato e senioridade continuam em chaves como `scraper:jobs:country:<value>`, `scraper:jobs:model:<value>` e `scraper:jobs:contract:<value>`.
- `jobstore.StableID` garante IDs determinísticos para permitir identificação e deduplicação entre execuções.

## Cache e configuração

- Cache é abstraído por `internal/cache` com implementações Redis (`NewRedisCache`) e memória (fallback para testes).
- Chave de cache do scraper é construída por `pipeline.BuildCacheKey` (consistente com os parâmetros de busca).

## Testes

- Há testes e fixtures (ex.: `internal/keywords/keywords.test.json`) para validar normalização.
- Recomenda-se executar `go test ./...` dentro de `scraper-go`.
- Para validar a configuração final do Compose, execute na raiz:

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  config
```

Confirme no serviço `scraper-go` os equivalentes de `SCRAPER_MAX_CONCURRENCY=12`, `SCRAPER_PROVIDER_MAX_CONCURRENCY=2`, `SCRAPER_PROVIDER_CONCURRENCY_OVERRIDES=""`, `GOMAXPROCS=2`, `GOMEMLIMIT=1500MiB`, `cpus: 1.5` e `mem_limit: 2g`.

## Variáveis de ambiente importantes

- `VALKEY_URL` — conexão Redis/Valkey. Em Docker Compose, use `redis://valkey:6379/0`; em execução local fora do Docker, use uma URL acessível pelo host, por exemplo `redis://localhost:6379/0`.
- `SCRAPER_MAX_CONCURRENCY` — teto global de concorrência por execução. Padrão: `12`. Configuração explícita inválida impede a inicialização.
- `SCRAPER_PROVIDER_MAX_CONCURRENCY` — limite padrão por provider. Padrão: `2`. Deve ser positivo e não pode superar `SCRAPER_MAX_CONCURRENCY`.
- `SCRAPER_PROVIDER_CONCURRENCY_OVERRIDES` — lista opcional `provider=limite`, separada por vírgulas. Vazio significa nenhum override; entrada inválida, duplicada, desconhecida ou acima do teto global impede a inicialização.
- `SCRAPER_RUN_LOCK_TTL` — duração do lock distribuído. Padrão: `120s`. Variável ausente usa o default; valor explícito vazio ou inválido impede a inicialização. No Compose, usa `${SCRAPER_RUN_LOCK_TTL-120s}` (mesmo padrão fail-fast de `SCRAPER_MAX_CONCURRENCY`).
- `SCRAPER_RUN_LOCK_RENEW_INTERVAL` — intervalo de renovação. Padrão: `30s`; deve ser menor que `SCRAPER_RUN_LOCK_TTL`. Variável ausente usa o default; valor explícito vazio ou inválido impede a inicialização. No Compose, usa `${SCRAPER_RUN_LOCK_RENEW_INTERVAL-30s}`.
- `GOMAXPROCS` — limite efetivo de threads executando código Go simultaneamente. Valor inicial no Compose: `2`.
- `GOMEMLIMIT` — meta de memória do runtime/GC. Valor inicial no Compose: `1500MiB`; não substitui `mem_limit` do container.
- `JOOBLE_API_KEY` — Jooble integration.
- `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` — Adzuna API.
- `LINKEDIN_KEYWORD_SLOT_SIZE` — quantidade máxima de keywords do LinkedIn por execução quando a busca vier com uma lista grande. Padrão: `30`.
- `ADZUNA_KEYWORD_SLOT_SIZE` — quantidade máxima de keywords do Adzuna por execução. Padrão: `30`.
- `GUPY_ENABLED` — habilita o adapter Gupy.
- `GUPY_RAW_DISCOVERY_ENABLED` — adiciona queries amplas de tecnologia na Gupy.
- `GUPY_FULL_SWEEP_ENABLED` / `GUPY_FULL_REMOTE_SWEEP_ENABLED` — controla sweeps amplos na Gupy.
- `GUPY_QUERY_LIMIT` — limita quantas queries expandidas da Gupy rodam por execução. Padrão: `60`.
- `INHIRE_ENABLED`, `INHIRE_TENANTS_FILE`, `INHIRE_ENRICH_DETAILS`, `INHIRE_DETAILS_MODE`, `INHIRE_DETAILS_TIMEOUT_MS` — controlam fonte e enriquecimento InHire. `INHIRE_DETAILS_CONCURRENCY` foi removida; detalhes seguem o orçamento do provider.
- `GREENHOUSE_ENABLED`, `GREENHOUSE_COMPANIES_FILE` — controlam fonte Greenhouse.
- `LEVER_ENABLED`, `LEVER_COMPANIES_FILE`, `LEVER_INCLUDE_ALL_JOBS` — controlam fonte Lever.
- Configurações de logging, quota e performance podem ser definidas via `.env`.

## Observações operacionais

- Projetado para rodar frequentemente; use caching e indexação para reduzir chamadas repetidas.
- Monitorar erros 429 e ajustar `WaitBetweenSearchesMs` e os limites globais/por provider.
- Verifique logs estruturados (slog JSON) e `/metrics` para métricas de sucesso/falhas por adaptador.
- O log `scraper concurrency budget` registra uma vez por execução o teto global, o default por provider e os overrides; `scraper provider execution summary` registra modo, tarefas produzidas/concluídas/canceladas, erros, timeouts e duração agregada.
- Logs `scraper run lock acquired`, `scraper execution skipped`, `scraper run lock lost` e `scraper run lock released` identificam `source` e `run_id`.

### Verificação operacional do lock

Durante uma execução controlada:

```bash
docker exec vagas-valkey valkey-cli GET scraper:run:lock
docker exec vagas-valkey valkey-cli PTTL scraper:run:lock
docker exec vagas-valkey valkey-cli HGETALL scraper:run:state
```

Uma segunda execução manual deve retornar conflito sem iniciar adapters. Após o término, as duas chaves devem desaparecer. Nunca remova a chave manualmente apenas porque ela existe: primeiro confirme que não há processo correspondente ativo e registre valor e TTL.
