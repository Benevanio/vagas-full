# Relatórios/KPIs do candidato — Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/relatorios-kpis/design.md`
**Status**: Done — T1–T13 implementadas e commitadas. Verificação independente a seguir.

**Batch B — T7–T13 (frontend): ✅ Done.**
- T7 `6e6a186` · T8 `7e001c5` · T9 `9828847` · T10 `41193d2` · T11 `38ccc3e` · T12 `12777f1` · T13 `41d108f`
- Frontend: 344→377 testes (todos passam). Backend seguiu 608/609 (mesmo flake pré-existente e não relacionado). Build (`vite build`) confirma code-splitting: `ReportsTab` vira chunk lazy separado (`ReportsTab-*.js`, ~108kB gzip), não pesa o bundle principal. Lint 0 erros (só warnings pré-existentes). `tsc --noEmit` backend: só os 5 erros pré-existentes de auth.
- Deviations do design: (1) `StageDurationsChart` usa barras em CSS puro, não Recharts — precisão em distinguir `null` ("—", sem barra) de `0` real (barra + "0,0 d") não é natural com `<Bar>` do Recharts; (2) loading da `ReportsTab` usa texto inline (padrão já usado em `JobDetailModal`), não o componente `Loading` global — este é um overlay fullscreen que esconderia a sidebar, regressão de UX para um loading dentro de uma aba; (3) `reports.routes.ts` constrói o schema Zod por request (`buildReportsKpisQuerySchema()` a cada `GET`), não uma instância única de módulo como o design sugeriu — uma instância fixa congelaria o default de "hoje" no horário em que o processo subiu.
- Um teste pré-existente (`dashboard.layout.test.tsx`) tinha `toHaveLength(4)` hardcoded para o nº de abas da tab bar mobile; atualizado para `5` (consequência direta e mecânica de T13, não uma mudança de comportamento).

**Batch A — T1–T6 (backend): ✅ Done.**
- T1 `747b532` · T2 `85df508` · T3 `7ee0761` · T4 `e1e3cca` · T5 `f856f37` · T6 `15316dd`
- Backend: 570→609 testes (608 passam; 1 falha intermitente pré-existente e não relacionada em `tests/unit/services/server.test.ts` — passa isolado, timing-based, não introduzida por esta feature). Frontend: 344/344. `tsc --noEmit` no backend: só os 5 erros pré-existentes de `src/modules/auth` (ver `memory/ts-errors-auth-module.md`); zero erros novos em `src/modules/reports`.
- Nota: o worker original do Batch A (sub-agent) caiu por rate limit da sessão logo após escrever T1 (implementação + teste, sem gate/commit). T1 foi retomado, teve 1 bug de fixture no teste corrigido (semana ISO somada errada em um cenário), e T1–T6 seguiram inline a partir daí.

Commits: **português, conventional commits, sem `Co-Authored-By` / trailer de sessão** (instrução do usuário). Um commit atômico por task.

---

## Test Coverage Matrix

> Gerada de: `vitest.config.js` (backend e frontend — thresholds 80% lines/functions/branches/statements), `AGENTS.md` (commits PT, nunca commitar sem pedir — pré-autorizado nesta feature), `LOCAL_DEVELOPMENT.md §14` (checklist de PR), amostragem de `backend/tests/integration/routes/savedJobs.routes.test.ts`, `backend/tests/unit/modules/admin/dashboard.repository.test.ts`, `frontend/tests/unit/new_dashboard/{api,hooks,page}.test.*`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Núcleo puro de KPI (`reports.kpis.ts`) | unit | Todos os ramos; 1:1 com ACs KPI-02..05; todos os edge cases da spec; helpers de semana ISO com casos de borda | `backend/tests/unit/modules/reports/reports.kpis.test.ts` | `npm run test --workspace=backend` |
| Schema/validação de query (`reports.schemas.ts`) | unit | KPI-08 (400) e KPI-09 (normalização de janela + defaults) — todos os ramos | `backend/tests/unit/modules/reports/reports.schemas.test.ts` | `npm run test --workspace=backend` |
| Service (`reports.service.ts`) | unit | Orquestração: repassa `userId` e janela ao repo/core; retorna o `KpiReport` do core | `backend/tests/unit/modules/reports/reports.service.test.ts` | `npm run test --workspace=backend` |
| Repository (`reports.repository.ts`) | unit (mock `db/client`) | Caminhos de query + isolamento por `user_id` (KPI-06); ordenação de eventos | `backend/tests/unit/modules/reports/reports.repository.test.ts` | `npm run test --workspace=backend` |
| Route + Controller (`reports.routes.ts`, `reports.controller.ts`) | integration | Todas as rotas do escopo: happy (KPI-01), vazio (KPI-04), `?from&to` ecoado (KPI-09), 401 sem sessão (KPI-07), 400 inválido / `from>to` (KPI-08), isolamento (KPI-06) | `backend/tests/integration/routes/reports.routes.test.ts` | `npm run test --workspace=backend` |
| Adapter de API frontend (`reportsApi.ts`) | unit | Mapeamento resposta→`ReportsKpis`, tolerância a shape parcial, montagem de `params` por preset | `frontend/tests/unit/new_dashboard/reportsApi.test.ts` | `npm run test --workspace=frontend` |
| Hook (`useReportsKpis.ts`) | unit (`renderHook`) | KPI-11 (fetch default + loading), KPI-13 (troca de preset refaz fetch), KPI-15 (erro), `reload` | `frontend/tests/unit/new_dashboard/reportsHook.test.tsx` | `npm run test --workspace=frontend` |
| Componentes de gráfico/tela (`ReportsTab`, `PeriodSelector`, `*Chart`, `ReportsSummary`) | unit (componente) | KPI-12 (3 gráficos com dados), KPI-14 (empty por card), KPI-15 (erro + tentar novamente), KPI-16 (`null`→"—"), KPI-17 (tiles) | `frontend/tests/unit/new_dashboard/reports*.test.tsx` | `npm run test --workspace=frontend` |
| Wiring de rota/navegação (`AppRoutes`, `NewDashboardPage`, `Sidebar`, `MobileTabBar`, `Icons`, `app.ts`, `vite.config.ts`) | unit (componente) p/ o que é observável | KPI-10 (`/relatorios` sob guard, item ativo na sidebar/tabbar) | `frontend/tests/unit/new_dashboard/reportsRoute.test.tsx` | `npm run test --workspace=frontend` |
| Docs (`BACKEND.md`), env/proxy | none | build gate apenas | — | — |
| Schema Drizzle | none | sem coluna nova — nada a testar | — | — |

## Gate Check Commands

> Confirmar antes do Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick (backend) | Após task com só testes unit de backend | `npm run test --workspace=backend` |
| Quick (frontend) | Após task com só testes unit de frontend | `npm run test --workspace=frontend` |
| Full | Após task com teste de integração, ou que cruza back/front | `npm run test --workspace=backend && npm run test --workspace=frontend` |
| Build | Fim de fase / tasks de wiring / docs | `npm run test --workspace=backend && npm run test --workspace=frontend && npm run build --workspace=frontend && npm run lint --workspace=frontend` + `npx tsc --noEmit -p backend/tsconfig.json` (tolera os 5 erros pré-existentes em `src/modules/auth` — ver `memory/ts-errors-auth-module.md`; nenhum erro novo no escopo `src/modules/reports`) |

---

## Execution Plan

Fases ordenadas, sequenciais. Tasks dentro da fase em ordem.

### Phase 1: Backend — núcleo puro + validação

```
T1 → T2
```

### Phase 2: Backend — dados, rota e docs

```
T3 → T4 → T5 → T6
```

### Phase 3: Frontend — camada de dados

```
T7 → T8
```

### Phase 4: Frontend — componentes de UI

```
T9 → T10 → T11
```

### Phase 5: Frontend — wiring de rota e navegação

```
T12 → T13
```

**Batches previstos (packing ~7 tasks/worker):**
- Batch A = Phase 1 + Phase 2 (6 tasks) — backend.
- Batch B = Phase 3 + Phase 4 + Phase 5 (7 tasks) — frontend.

→ 2 batches ⇒ oferta de sub-agents no Execute.

---

## Task Breakdown

### T1: Núcleo puro `computeKpis` + helpers de semana ISO

**What**: Criar o módulo puro que transforma linhas cruas de `saved_jobs` + `application_events` em `KpiReport` para uma janela `[from,to]`, incluindo helpers `isoWeekLabel`/`isoWeekStart` (UTC).
**Where**: `backend/src/modules/reports/reports.kpis.ts` (novo)
**Depends on**: None
**Reuses**: `JobStatus` de `backend/src/db/schema/savedJobs.ts`. Algoritmo documentado em `design.md` §"Algoritmo de agregação".
**Requirement**: KPI-02, KPI-03, KPI-04, KPI-05, KPI-09 (parcial: monta `range`), edge cases

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `computeKpis({ savedJobs, events, from, to }): KpiReport` implementado conforme algoritmo (submissão via evento `from_status='saved'` + fallback legado; série semanal só de semanas não-vazias e ordenada; `interviewRate` com `insufficientData`; `stageDurations` 3 baldes com `null`).
- [ ] `isoWeekLabel`/`isoWeekStart` exportados; algoritmo ISO-8601 (segunda = início, semana 1 = a da 1ª quinta-feira).
- [ ] Tipos `KpiReport`, `KpiInput`, `KpiSavedJob`, `KpiEvent` exportados.
- [ ] Unit tests cobrindo: soma da série = total submetido (KPI-02); ordenação por `weekStart`; taxa `round(Y/X*100)` (KPI-03); denominador 0 → `{value:0,insufficientData:true}` + série `[]` (KPI-04); 3 chaves de duração, média em dias 1 casa, `null` sem transição (KPI-05); vaga `saved→interviewing` direto conta em contagem, não em duração; dado legado sem eventos; janela recorta durações pelo evento de saída; helpers com 1º/4 jan, 31 dez, semana 53/2026, ano bissexto.
- [ ] Gate check passa: `npm run test --workspace=backend`
- [ ] Test count: +N testes passam (sem deleção silenciosa)

**Tests**: unit
**Gate**: quick (backend)

**Commit**: `feat(reports): núcleo de cálculo de KPIs do candidato`

---

### T2: Schema Zod da query (`from`/`to`) com defaults e normalização

**What**: Criar `buildReportsKpisQuerySchema(now)` (factory determinística) + instância default, validando `from`/`to` `YYYY-MM-DD`, aplicando default de 90 dias, ancorando `[00:00:00.000Z, 23:59:59.999Z]` e rejeitando `from > to`.
**Where**: `backend/src/modules/reports/schemas/reports.schemas.ts` (novo)
**Depends on**: None
**Reuses**: padrão de `backend/src/modules/savedJobs/schemas/savedJobs.schemas.ts`; `AppError.fromZodError` já tratado pelo `validate`.
**Requirement**: KPI-08, KPI-09

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `buildReportsKpisQuerySchema(now = new Date())` retorna schema Zod que `.transform` para `{ from: Date; to: Date }`.
- [ ] Sem query → janela = `[hoje-90d 00:00:00.000Z, hoje 23:59:59.999Z]`.
- [ ] `from`/`to` válidos → ancorados a início/fim de dia UTC.
- [ ] `from`/`to` fora de `^\d{4}-\d{2}-\d{2}$` ou data irreal ou `from > to` → `ZodError` (→ 400).
- [ ] `type ReportsKpisQuery` exportado.
- [ ] Unit tests: default sem params; ancoragem de horário; `from>to` rejeitado; formato inválido rejeitado; `from==to` aceito.
- [ ] Gate check passa: `npm run test --workspace=backend`
- [ ] Test count: +N testes passam

**Tests**: unit
**Gate**: quick (backend)

**Commit**: `feat(reports): validação de período do endpoint de KPIs`

---

### T3: Repository `fetchUserActivity`

**What**: Criar o repositório que busca `saved_jobs` e `application_events` do usuário (2 selects por `user_id`, eventos ordenados por `created_at,id`), projetando só as colunas que o core usa.
**Where**: `backend/src/modules/reports/reports.repository.ts` (novo)
**Depends on**: T1 (usa tipos `KpiSavedJob`/`KpiEvent`)
**Reuses**: `db` de `backend/src/db/client.ts`; schema; estilo de `backend/src/modules/admin/dashboard/dashboard.repository.ts`.
**Requirement**: KPI-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `fetchUserActivity(userId): Promise<{ savedJobs: KpiSavedJob[]; events: KpiEvent[] }>`.
- [ ] `where eq(user_id, userId)` nas duas queries; eventos `orderBy asc(createdAt), asc(id)`.
- [ ] Unit tests (mock `db/client` no estilo `dashboard.repository.test.ts`): confirma filtro por `userId` nas duas tabelas e a ordenação dos eventos; mapeia linhas para o shape esperado.
- [ ] Gate check passa: `npm run test --workspace=backend`
- [ ] Test count: +N testes passam

**Tests**: unit
**Gate**: quick (backend)

**Commit**: `feat(reports): repositório de atividade do usuário para KPIs`

---

### T4: Service `getKpis`

**What**: Criar o service que injeta o repositório, chama `fetchUserActivity`, delega a `computeKpis` com a janela recebida e retorna o `KpiReport`.
**Where**: `backend/src/modules/reports/reports.service.ts` (novo)
**Depends on**: T1, T3
**Reuses**: padrão de construtor com injeção de `SavedJobsService(tx = db)`.
**Requirement**: KPI-01, KPI-06 (repassa userId), KPI-09 (repassa janela)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `getKpis(userId, { from, to }): Promise<KpiReport>`; construtor `constructor(private repo = new ReportsRepository())`.
- [ ] Unit tests (repo mockado): repassa `userId` ao repo; repassa `from`/`to` ao `computeKpis`; devolve exatamente o retorno do core.
- [ ] Gate check passa: `npm run test --workspace=backend`
- [ ] Test count: +N testes passam

**Tests**: unit
**Gate**: quick (backend)

**Commit**: `feat(reports): serviço de agregação de KPIs`

---

### T5: Controller + rota `/reports/kpis` + mount no app

**What**: Criar `reports.controller.ts` (sessão→userId, 401 sem sessão, lê query já validada, chama service, `res.json`), `reports.routes.ts` (`GET /kpis` com `validate({ query })`), e montar `app.use("/reports", withSession, requireAuth, reportsRoutes)` em `app.ts`.
**Where**: `backend/src/modules/reports/reports.controller.ts` (novo), `backend/src/routes/reports.routes.ts` (novo), `backend/src/app.ts` (modificar)
**Depends on**: T2, T4
**Reuses**: `getIronSession<Session>`/`sessionOptions` e `requireUserId` de `SavedJobsController`; `validate`; mounts existentes em `app.ts`.
**Requirement**: KPI-01, KPI-04, KPI-06, KPI-07, KPI-08, KPI-09

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `GET /reports/kpis` responde 200 com `{ range, weeklyApplications, interviewRate, stageDurations }`.
- [ ] Sem sessão → 401 e service NÃO é chamado.
- [ ] `from`/`to` inválido ou `from>to` → 400 e service NÃO é chamado.
- [ ] `?from&to` válidos → `range` ecoado normalizado.
- [ ] Integration tests em `reports.routes.test.ts` (estilo `savedJobs.routes.test.ts`: mock `ReportsService`, mock `iron-session`, `supertest`): happy default (KPI-01), resposta vazia (KPI-04), `?from&to` ecoado (KPI-09), 401 (KPI-07), 400 formato + 400 `from>to` (KPI-08), service recebe o `userId` da sessão (KPI-06).
- [ ] Gate check passa: `npm run test --workspace=backend && npm run test --workspace=frontend`
- [ ] Test count: +N testes passam

**Tests**: integration
**Gate**: full

**Commit**: `feat(reports): endpoint GET /reports/kpis`

---

### T6: Documentar o endpoint no `BACKEND.md`

**What**: Adicionar `/reports/kpis` à lista de rotas do `BACKEND.md` e uma linha descrevendo os KPIs, período e formato de resposta.
**Where**: `BACKEND.md` (modificar)
**Depends on**: T5
**Reuses**: seções e formato existentes do `BACKEND.md`.
**Requirement**: Success Criteria (doc)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `BACKEND.md` lista `GET /reports/kpis` com params `from`/`to`, default 90d, e o shape `{ range, weeklyApplications, interviewRate, stageDurations }`.
- [ ] Sem segredo/credencial no diff.
- [ ] Gate check passa (build): backend+frontend testes + build+lint frontend + `tsc --noEmit` backend sem erro novo no escopo.

**Tests**: none
**Gate**: build

**Commit**: `docs(reports): documentar endpoint de KPIs no BACKEND.md`

---

### T7: `recharts` + adapter `reportsApi.ts`

**What**: Adicionar `recharts` às dependências do frontend e criar o adapter: tipos `ReportsKpis`, `ApiReportsKpisSchema` (Zod tolerante), `toReportsKpis`, `getReportsKpis(params)` e `periodToRange(preset)`.
**Where**: `frontend/package.json` (modificar), `frontend/src/domains/new_dashboard/infrastructure/reportsApi.ts` (novo)
**Depends on**: T5 (contrato da resposta)
**Reuses**: `api` de `@/shared/lib/apiClient`; padrão Zod de `infrastructure/userDashboardApi.ts`.
**Requirement**: KPI-11, KPI-13 (montagem de params)

**Tools**:
- MCP: `context7` (API atual do `recharts` — só para confirmar versão/entradas, o uso vem nas tasks de componente)
- Skill: NONE

**Done when**:
- [ ] `recharts` em `dependencies` do `frontend/package.json` (versão estável fixada) e instalado (`package-lock` atualizado).
- [ ] `getReportsKpis({ from?, to? })` chama `api.get("/reports/kpis", { params })` e retorna `toReportsKpis(data)`.
- [ ] `periodToRange("30d"|"90d"|"12m"|"tudo")` → `{ from?, to? }` (tudo → `{}`).
- [ ] `ApiReportsKpisSchema` tolera campos ausentes → normaliza para `[]`/`null`.
- [ ] Unit tests (mock `@/shared/lib/apiClient`): mapeia resposta completa; tolera resposta parcial; `periodToRange` para os 4 presets; `getReportsKpis` monta `params` corretos.
- [ ] Gate check passa: `npm run test --workspace=frontend`
- [ ] Test count: +N testes passam

**Tests**: unit
**Gate**: quick (frontend)

**Commit**: `feat(reports): adapter de API de KPIs no frontend`

---

### T8: Hook `useReportsKpis`

**What**: Criar o hook que gerencia `period` (default `"90d"`), dispara `getReportsKpis` no mount e a cada troca de período, e expõe `data`/`isLoading`/`error`/`setPeriod`/`reload`.
**Where**: `frontend/src/domains/new_dashboard/hooks/useReportsKpis.ts` (novo)
**Depends on**: T7
**Reuses**: padrão de `hooks/useUserDashboardData.ts` (`isMounted`, try/catch, estados).
**Requirement**: KPI-11, KPI-13, KPI-15

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Monta → chama `getReportsKpis` com range do preset default e `isLoading` true até resolver (KPI-11).
- [ ] `setPeriod(p)` → nova chamada com o range do novo preset; `data` re-setado (KPI-13).
- [ ] Falha → `error` preenchido, `data` preservado/`null`, sem throw (KPI-15).
- [ ] `reload()` re-dispara a chamada do período atual.
- [ ] Unit tests (`renderHook` + adapter mockado): default fetch + loading; `setPeriod` refaz com params certos; erro; `reload`.
- [ ] Gate check passa: `npm run test --workspace=frontend`
- [ ] Test count: +N testes passam

**Tests**: unit
**Gate**: quick (frontend)

**Commit**: `feat(reports): hook de dados de KPIs`

---

### T9: `PeriodSelector` + `WeeklyApplicationsChart`

**What**: Criar o seletor de período (4 botões controlados) e o gráfico de barras verticais de candidaturas por semana (Recharts), com empty state.
**Where**: `frontend/src/domains/new_dashboard/components/reports/PeriodSelector.tsx` (novo), `frontend/src/domains/new_dashboard/components/reports/WeeklyApplicationsChart.tsx` (novo)
**Depends on**: T7 (tipos + recharts)
**Reuses**: tokens/tailwind e `cn`; estilo de botões da toolbar existente.
**Requirement**: KPI-13 (UI do seletor), KPI-12 (gráfico), KPI-14 (empty)

**Tools**:
- MCP: `context7` (`recharts` `BarChart`/`ResponsiveContainer` API atual)
- Skill: NONE

**Done when**:
- [ ] `PeriodSelector({ value, onChange })` renderiza 30d/90d/12m/Tudo; clique chama `onChange` com o preset; item ativo marcado.
- [ ] `WeeklyApplicationsChart({ data })`: com dados → barras (uma por semana, rótulo = `week`); `data: []` → empty state textual ("sem dados no período"), sem gráfico (KPI-14).
- [ ] Recharts testável em jsdom (container com tamanho fixo ou `ResponsiveContainer` mockado no teste).
- [ ] Unit tests: presets renderizam e selecionam; chart com N semanas rende N barras/labels; `[]` → empty state.
- [ ] Gate check passa: `npm run test --workspace=frontend`
- [ ] Test count: +N testes passam

**Tests**: unit
**Gate**: quick (frontend)

**Commit**: `feat(reports): seletor de período e gráfico de candidaturas por semana`

---

### T10: `InterviewRateChart` + `StageDurationsChart`

**What**: Criar o donut da taxa de entrevista (valor central `%`, empty em `insufficientData`) e o gráfico de barras horizontais de tempo médio por etapa (`null` → "—", não `0`).
**Where**: `frontend/src/domains/new_dashboard/components/reports/InterviewRateChart.tsx` (novo), `frontend/src/domains/new_dashboard/components/reports/StageDurationsChart.tsx` (novo)
**Depends on**: T7
**Reuses**: tokens/tailwind, `cn`.
**Requirement**: KPI-12, KPI-14, KPI-16

**Tools**:
- MCP: `context7` (`recharts` `PieChart`/`BarChart layout="vertical"`)
- Skill: NONE

**Done when**:
- [ ] `InterviewRateChart({ rate })`: `insufficientData` → empty state ("sem dados no período"); senão donut + label central `${value}%`.
- [ ] `StageDurationsChart({ durations })`: 3 categorias (`savedToApplied`, `appliedToInterviewing`, `interviewingToOutcome`) com rótulos legíveis em PT; valor `number` → barra + `"X,X d"`/`"X.X d"`; valor `null` → linha "—" sem barra (KPI-16, nunca `0`).
- [ ] Unit tests: donut mostra `%`; `insufficientData` → empty; 3 etapas rendem; etapa `null` mostra "—" e não `0`; etapa `0`(real) mostra `0`, não "—".
- [ ] Gate check passa: `npm run test --workspace=frontend`
- [ ] Test count: +N testes passam

**Tests**: unit
**Gate**: quick (frontend)

**Commit**: `feat(reports): gráficos de taxa de entrevista e tempo por etapa`

---

### T11: `ReportsSummary` + `ReportsTab`

**What**: Criar os 3 tiles de sumário (P3) e a tela `ReportsTab` que compõe o hook, o `PeriodSelector`, os 3 gráficos e os estados loading / empty / erro-com-retry.
**Where**: `frontend/src/domains/new_dashboard/components/reports/ReportsSummary.tsx` (novo), `frontend/src/domains/new_dashboard/components/reports/ReportsTab.tsx` (novo)
**Depends on**: T8, T9, T10
**Reuses**: visual de `CounterCard` (`components/home/StatusCounters.tsx`); `Loading` de `@/shared/ui/Loading`.
**Requirement**: KPI-12, KPI-14, KPI-15, KPI-17

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `ReportsSummary({ data })`: tiles "Candidaturas no período" (= soma da série), "Taxa de entrevista" (`value%`), "Semana mais ativa" (`week` de maior `count`, ou "—" se série vazia) (KPI-17).
- [ ] `ReportsTab`: usa `useReportsKpis`; `isLoading` → `Loading`; erro → mensagem + botão "Tentar novamente" que chama `reload` (KPI-15); dados → `ReportsSummary` + 3 gráficos (KPI-12); resposta vazia → cada card em empty state (KPI-14); troca de preso no `PeriodSelector` chama `setPeriod`.
- [ ] Unit tests: loading→dados renderiza os 3 gráficos + tiles; vazio → empty states; erro → retry chama `reload`; "Semana mais ativa" com série vazia → "—".
- [ ] Gate check passa: `npm run test --workspace=frontend`
- [ ] Test count: +N testes passam

**Tests**: unit
**Gate**: quick (frontend)

**Commit**: `feat(reports): tela de relatórios com sumário e estados`

---

### T12: Wiring de rota `/relatorios` + lazy no dashboard + proxy

**What**: Registrar a rota `/relatorios` (`AppRoutes.tsx` reusando `dashboardElement`), adicionar `"relatorios"` a `getSection` e um `case` com `React.lazy` + `Suspense` em `NewDashboardPage.tsx`, e incluir `reports` no regex do proxy do `vite.config.ts`.
**Where**: `frontend/src/app/AppRoutes.tsx` (modificar), `frontend/src/domains/new_dashboard/NewDashboardPage.tsx` (modificar), `frontend/vite.config.ts` (modificar)
**Depends on**: T11
**Reuses**: `dashboardElement`, `getSection`, `renderContent`, `Loading`.
**Requirement**: KPI-10

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `/relatorios` renderiza o shell do dashboard sob `ProtectedRoute` e mostra `ReportsTab` (lazy) na área de conteúdo.
- [ ] `getSection("/relatorios")` → `"relatorios"`.
- [ ] `vite.config.ts` proxy regex inclui `reports`.
- [ ] Unit test (`reportsRoute.test.tsx`): navegar para `/relatorios` renderiza a tela de relatórios (mock do hook/adapter) dentro do shell; sem sessão → não renderiza (guard).
- [ ] Gate check passa: `npm run test --workspace=frontend`
- [ ] Test count: +N testes passam

**Tests**: unit (componente)
**Gate**: quick (frontend)

**Commit**: `feat(reports): registrar rota /relatorios no dashboard`

---

### T13: Item de navegação "Relatórios" (sidebar + tab bar + ícone)

**What**: Adicionar o item "Relatórios" ao `Sidebar` e ao `MobileTabBar` (ajustando `grid-cols-4`→`grid-cols-5`), com um ícone novo em `Icons.tsx`.
**Where**: `frontend/src/domains/new_dashboard/components/layout/Sidebar.tsx` (modificar), `frontend/src/domains/new_dashboard/components/layout/MobileTabBar.tsx` (modificar), `frontend/src/domains/new_dashboard/components/shared/Icons.tsx` (modificar)
**Depends on**: T12
**Reuses**: array `items`/`tabs`; set `lucide-react` já importado em `Icons.tsx`.
**Requirement**: KPI-10

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `Sidebar` mostra "Relatórios" → `/relatorios`, ativo quando `pathname === "/relatorios"`.
- [ ] `MobileTabBar` mostra "Relatórios"; grid ajustado para 5 colunas sem quebrar truncamento.
- [ ] `Icons.Relatorios` definido (ex.: `BarChart3` do `lucide-react`).
- [ ] Unit test (estende `reportsRoute.test.tsx` ou novo): item presente e com destaque ativo na sidebar e na tab bar quando em `/relatorios` (KPI-10).
- [ ] Gate check passa (build): `npm run test --workspace=backend && npm run test --workspace=frontend && npm run build --workspace=frontend && npm run lint --workspace=frontend` + `npx tsc --noEmit -p backend/tsconfig.json` (sem erro novo no escopo).
- [ ] Test count: +N testes passam

**Tests**: unit (componente)
**Gate**: build

**Commit**: `feat(reports): adicionar Relatórios à navegação do dashboard`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ──→ T2
Phase 2:  T3 ──→ T4 ──→ T5 ──→ T6
Phase 3:  T7 ──→ T8
Phase 4:  T9 ──→ T10 ──→ T11
Phase 5:  T12 ──→ T13
```

Execução estritamente sequencial. Batch A = Phase 1+2 (backend, 6 tasks); Batch B = Phase 3+4+5 (frontend, 7 tasks).

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: núcleo `computeKpis` + helpers | 1 módulo puro coeso (1 função pública + helpers de mesmo domínio) | ✅ Granular |
| T2: schema de query | 1 arquivo, 1 conceito | ✅ Granular |
| T3: repository | 1 função | ✅ Granular |
| T4: service | 1 função | ✅ Granular |
| T5: controller + rota + mount | 1 endpoint (controller+router+mount são a unidade mínima testável — merge backward do wiring para não gerar código não testado) | ✅ Granular (cohesivo) |
| T6: doc | 1 arquivo | ✅ Granular |
| T7: recharts + adapter | 1 adapter + 1 entrada em package.json (dep do adapter) | ✅ Granular (cohesivo) |
| T8: hook | 1 hook | ✅ Granular |
| T9: PeriodSelector + WeeklyApplicationsChart | 2 componentes pequenos e relacionados, mesmo arquivo-vizinho | ⚠️ OK (coeso — seletor + 1º gráfico) |
| T10: InterviewRateChart + StageDurationsChart | 2 componentes de gráfico irmãos | ⚠️ OK (coeso) |
| T11: ReportsSummary + ReportsTab | tile + tela que o compõe | ⚠️ OK (coeso — tela + seu tile) |
| T12: rota + lazy + proxy | 1 deliverable (registrar a seção) em 3 arquivos de wiring trivial | ✅ Granular (cohesivo) |
| T13: nav (sidebar+tabbar+icon) | 1 deliverable (item de menu) | ✅ Granular (cohesivo) |

Nenhum ❌. Os ⚠️ são pares coesos no mesmo subdiretório `components/reports/`, dentro de "2–3 coisas relacionadas = OK".

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram | Status |
| --- | --- | --- | --- |
| T1 | None | (início Phase 1) | ✅ Match |
| T2 | None | (Phase 1, após T1 por ordem, sem dep de dados) | ✅ Match |
| T3 | T1 | T1→…→T3 (Phase 2 depende de Phase 1) | ✅ Match |
| T4 | T1, T3 | T3→T4 | ✅ Match |
| T5 | T2, T4 | T4→T5 (T2 na fase anterior) | ✅ Match |
| T6 | T5 | T5→T6 | ✅ Match |
| T7 | T5 | Phase 3 após Phase 2 | ✅ Match |
| T8 | T7 | T7→T8 | ✅ Match |
| T9 | T7 | Phase 4 após Phase 3 (T7) | ✅ Match |
| T10 | T7 | T9→T10 (ordem); dep real T7 | ✅ Match |
| T11 | T8, T9, T10 | T10→T11 | ✅ Match |
| T12 | T11 | Phase 5 após Phase 4 | ✅ Match |
| T13 | T12 | T12→T13 | ✅ Match |

Todas as deps apontam para trás ou dentro da fase. Sem dep para fase posterior.

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Núcleo puro de KPI | unit | unit | ✅ OK |
| T2 | Schema de query | unit | unit | ✅ OK |
| T3 | Repository | unit (mock db) | unit | ✅ OK |
| T4 | Service | unit | unit | ✅ OK |
| T5 | Route + Controller | integration | integration | ✅ OK |
| T6 | Docs | none | none | ✅ OK |
| T7 | Adapter de API frontend | unit | unit | ✅ OK |
| T8 | Hook | unit | unit | ✅ OK |
| T9 | Componentes de gráfico | unit (componente) | unit | ✅ OK |
| T10 | Componentes de gráfico | unit (componente) | unit | ✅ OK |
| T11 | Componentes de tela | unit (componente) | unit | ✅ OK |
| T12 | Wiring de rota (observável) | unit (componente) | unit | ✅ OK |
| T13 | Wiring de navegação (observável) | unit (componente) | unit | ✅ OK |

Nenhuma ❌ VIOLATION. `package.json` (T7) e `app.ts`/`vite.config.ts`/`BACKEND.md` são wiring/config cobertos por build gate ou pelo teste observável da mesma task; sem deferral de testes.

---

## Requirement Coverage

| Req | Task(s) |
| --- | --- |
| KPI-01 | T4, T5 |
| KPI-02 | T1 |
| KPI-03 | T1 |
| KPI-04 | T1, T5 |
| KPI-05 | T1 |
| KPI-06 | T3, T5 |
| KPI-07 | T5 |
| KPI-08 | T2, T5 |
| KPI-09 | T1 (range), T2, T5 |
| KPI-10 | T12, T13 |
| KPI-11 | T7, T8 |
| KPI-12 | T9, T10, T11 |
| KPI-13 | T8, T9 |
| KPI-14 | T9, T10, T11 |
| KPI-15 | T8, T11 |
| KPI-16 | T10 |
| KPI-17 | T11 |

17/17 mapeados. **Coverage:** 17 total, 17 mapeados a tasks, 0 não mapeados.
