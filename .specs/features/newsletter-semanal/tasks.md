# Newsletter Semanal Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/newsletter-semanal/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase sampling. Guidelines found: `backend/GUIA_TESTES_AUTOMATIZADOS.md` (comportamento real > detalhe interno; `it.each` para cenários equivalentes), `backend/vitest.config.js` (coverage v8, thresholds 80% linhas/funções/branches/statements). Amostrado de `backend/tests/unit/modules/email/*`, `backend/tests/integration/routes/user.routes.test.ts`, `backend/tests/unit/services/server.test.ts`, `frontend/tests/unit/pages/login/LoginPage.test.tsx`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain/service (`newsletter.service.ts`, `newsFeed.service.ts`, `unsubscribeToken.ts`) | unit | Todos os branches; 1:1 com as ACs da spec (NEWSL-01 a NEWSL-15); todos os edge cases listados | `backend/tests/unit/modules/newsletter/*.test.ts`, `backend/tests/unit/lib/security/unsubscribeToken.test.ts` | `npx vitest run <arquivo>` (de `backend/`) |
| Queue/Worker (BullMQ) | unit | Registro do repeatable job, enfileiramento, dispatch por tipo de job, tratamento de falha — mesmo padrão de `email.queue.test.ts`/`email.worker.test.ts` | `backend/tests/unit/modules/newsletter/newsletter.queue.test.ts`, `newsletter.worker.test.ts` | `npx vitest run <arquivo>` (de `backend/`) |
| Template react-email (`newsletter.tsx` + registry) | unit | Smoke de render (subject correto, conteúdo chave presente — vagas, contagem, notícias, link de unsubscribe) | `backend/tests/unit/modules/email/registry.test.ts` (estende o existente) | `npx vitest run backend/tests/unit/modules/email/registry.test.ts` |
| Route/controller (`POST /newsletter/unsubscribe`) | integration | Happy path + token inválido + token adulterado + método/rota — supertest contra o app real | `backend/tests/integration/routes/newsletter.routes.test.ts` | `npm run test --workspace=backend` |
| Schema/migration (`newsletter_sends`) | none | build gate only | `backend/src/db/schema/newsletterSends.ts`, `backend/drizzle/*` | `npm run test --workspace=backend` |
| Boot wiring (`server.ts`, `app.ts`) | none (plumbing sem teste dedicado hoje — mesmo padrão do `email.worker`/`email.queue` em `server.ts`) | build gate only | `backend/src/server.ts`, `backend/src/app.ts` | `npm run test --workspace=backend` |
| Frontend page (`UnsubscribePage.tsx`) | unit | Renderização + chamada à API + estados sucesso/erro — mesmo padrão de `LoginPage.test.tsx` | `frontend/tests/unit/pages/newsletter/UnsubscribePage.test.tsx` | `npx vitest run <arquivo>` (de `frontend/`) |
| Docs (`BACKEND.md`) | none | — | `BACKEND.md` | — |

**Nota sobre "Build" gate**: nem `backend` nem `frontend` têm script de compilação/typecheck dedicado neste repo (backend roda via `tsx`; `frontend`'s `build` é só `vite build`, sem `tsc`). Ambos os workspaces já têm erros de `tsc --noEmit` pré-existentes e não relacionados (ver memória `ts-errors-auth-module` / PAV-133), fora do escopo desta feature. O gate "Build" aqui é a suíte de testes do workspace (`npm run test --workspace=<pkg>`), não um typecheck completo.

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Após tasks com testes unitários isolados | `npx vitest run <arquivo do teste>` (rodar de dentro de `backend/` ou `frontend/`, conforme a task) |
| Full | Após tasks de integração (rota/controller) ou fim de fase | `npm run test --workspace=backend` (backend) / `npm run test --workspace=frontend` (T13) |
| Build | Tasks só de schema/config/docs | Mesmo comando do Full do workspace correspondente |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Foundation

```
T1 → T2 → T3
```

### Phase 2: Queue Infrastructure

```
T4
```

### Phase 3: Business Logic

```
T5 → T6 → T7 → T8
```

### Phase 4: Template + Worker

```
T9 → T10
```

### Phase 5: Public Endpoint + Wiring

```
T11 → T12 → T13 → T14
```

---

## Task Breakdown

### T1: Schema `newsletter_sends` + migração

**What**: Criar a tabela Drizzle `newsletter_sends` (idempotência por `userId`+`isoWeek`, `status`, `sentJobIds`) e gerar a migração.
**Where**: `backend/src/db/schema/newsletterSends.ts` (+ export em `backend/src/db/schema/index.ts`), `backend/drizzle/000X_*.sql`
**Depends on**: None
**Reuses**: Estrutura de `backend/src/db/schema/applicationEvents.ts` (índice composto, `onDelete: "cascade"`)
**Requirement**: NEWSL-04, NEWSL-09 (idempotência)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Tabela `newsletter_sends` criada com `unique(userId, isoWeek)` e `index(userId, createdAt)`
- [ ] Migração gerada via `npm run db:generate` e revisada (sem alterações manuais divergentes)
- [ ] Tipos `NewsletterSend`/`NewNewsletterSend` exportados
- [ ] Gate check passa: `npm run test --workspace=backend`

**Tests**: none
**Gate**: build

**Commit**: `feat(newsletter): adicionar schema newsletter_sends`

---

### T2: `unsubscribeToken.ts` — geração/validação de token

**What**: Utilitário HMAC pra gerar e validar token de unsubscribe sem sessão, com domain separation a partir de `ENCRYPTION_MASTER_KEY`.
**Where**: `backend/src/lib/security/unsubscribeToken.ts`
**Depends on**: None
**Reuses**: Convenção de `backend/src/lib/security/searchableHash.ts` (`createHmac`, `timingSafeEqual`)
**Requirement**: NEWSL-12, NEWSL-13

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `generateUnsubscribeToken(userId)` retorna token opaco determinístico pro mesmo `userId`
- [ ] `verifyUnsubscribeToken(token)` retorna o `userId` pra token válido
- [ ] `verifyUnsubscribeToken(token)` retorna `null` pra token malformado, adulterado (1 char trocado) ou de outro `userId`
- [ ] Comparação usa `timingSafeEqual` (sem short-circuit por tamanho antes da comparação constante)
- [ ] Gate check passa: `npx vitest run backend/tests/unit/lib/security/unsubscribeToken.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(newsletter): adicionar unsubscribeToken (HMAC sem sessão)`

---

### T3: `newsFeed.service.ts` — ingestão RSS

**What**: Buscar até N itens de notícia de feed(s) RSS configurados, com timeout por feed, dedup por link, ordenação por data desc; nunca lança (feed indisponível é descartado).
**Where**: `backend/src/modules/newsletter/newsFeed.service.ts`; `backend/package.json` (+ `rss-parser`)
**Depends on**: None
**Reuses**: N/A (módulo novo)
**Requirement**: NEWSL-07, NEWSL-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `npm install rss-parser --workspace=backend` (v3.13.0 ou compatível)
- [ ] `fetchTechNews(limit = 5)` retorna no máximo `limit` itens, ordenados por data desc, sem duplicar link
- [ ] Um feed que falha (timeout/erro HTTP/erro de parse) é descartado com `logWarn`, sem derrubar os demais feeds
- [ ] Todos os feeds falhando → retorna `[]` sem lançar
- [ ] Lista de feeds vem de config (env com fallback padrão) — **primeira verificação**: confirmar ao vivo que as URLs escolhidas respondem RSS válido antes de fixar o fallback (ver Risco no `design.md`)
- [ ] Gate check passa: `npx vitest run backend/tests/unit/modules/newsletter/newsFeed.service.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(newsletter): adicionar ingestão de notícias via RSS`

---

### T4: `newsletter.queue.ts` — fila BullMQ + agendamento

**What**: Fila `newsletter` (conexão ioredis dedicada), registro do repeatable job semanal e enfileiramento de jobs filhos por usuário.
**Where**: `backend/src/modules/newsletter/newsletter.queue.ts`
**Depends on**: None (fase própria, mas roda após Phase 1 na ordem sequencial)
**Reuses**: `backend/src/modules/email/email.queue.ts` (estrutura completa: singleton, `attempts`+`backoff`, `close`)
**Requirement**: NEWSL-01 (agendamento)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `getNewsletterQueue()` — singleton lazy
- [ ] `scheduleWeeklyTrigger()` registra repeatable job (`pattern: "0 8 * * 1"`, `tz: "America/Sao_Paulo"`, `jobId` fixo) — chamar duas vezes não duplica o agendamento
- [ ] `enqueueUserSend(userId, isoWeek)` — job filho com `attempts`+`backoff` exponencial (mesmo padrão do e-mail)
- [ ] `closeNewsletterQueue()` fecha fila e conexão
- [ ] Gate check passa: `npx vitest run backend/tests/unit/modules/newsletter/newsletter.queue.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(newsletter): adicionar fila BullMQ e agendamento semanal`

---

### T5: `newsletter.service.ts` — matching de vagas

**What**: `computeMatchedJobsForUser(userId, excludeJobIds, limit)` — busca o índice global de vagas, pontua pelo perfil do usuário, exclui `excludeJobIds`, retorna top `limit` por `matchScore` desc.
**Where**: `backend/src/modules/newsletter/newsletter.service.ts` (novo arquivo)
**Depends on**: None
**Reuses**: `getUserMatchTechnologies`/`scoreJobWithTechnologies` (`backend/src/modules/jobs/services/jobMatch.service.ts`), `cacheAbsoluteSMembers`/`cacheGetJobsByIds` (`backend/src/lib/cache.ts`) — **não** usa `JobProfileMatchService.enrich()` (evita disparar notificação de alto match)
**Requirement**: NEWSL-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Retorna vagas com `matchScore > 0`, ordenadas desc, cortadas em `limit` (5)
- [ ] Vagas em `excludeJobIds` nunca aparecem no resultado
- [ ] Usuário sem tecnologias no perfil → retorna `[]` (não quebra)
- [ ] Índice de vagas vazio → retorna `[]`
- [ ] Não chama `NotificationsService`/`enrich()` em nenhum caminho
- [ ] Gate check passa: `npx vitest run backend/tests/unit/modules/newsletter/newsletter.service.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(newsletter): adicionar matching de vagas para newsletter`

---

### T6: `newsletter.service.ts` — semana ISO + histórico de envio

**What**: `getIsoWeek(date)` (ex.: `"2026-W36"`) e `getRecentlySentJobIds(userId, weeksBack = 8)` (lê `newsletter_sends.sentJobIds` das últimas N semanas do usuário).
**Where**: `backend/src/modules/newsletter/newsletter.service.ts` (mesmo arquivo, aditivo)
**Depends on**: T1 (schema `newsletter_sends`)
**Reuses**: Drizzle query builder no padrão dos outros services (`ownedBy`, etc. de `lib/authorization`)
**Requirement**: NEWSL-02 (dedup de frescor), NEWSL-09 (lookback)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `getIsoWeek` retorna a semana ISO correta pra datas de referência conhecidas (incluindo virada de ano)
- [ ] `getRecentlySentJobIds` agrega `sentJobIds` de todas as linhas do usuário nas últimas `weeksBack` semanas, sem duplicar ids
- [ ] Usuário sem histórico → retorna `[]`
- [ ] Gate check passa: `npx vitest run backend/tests/unit/modules/newsletter/newsletter.service.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(newsletter): adicionar cálculo de semana ISO e histórico de envio`

---

### T7: `newsletter.service.ts` — `sendForUser`

**What**: Idempotência (checa `newsletter_sends` por `userId`+`isoWeek` antes de processar), monta conteúdo (vagas via T5 excluindo T6, contagem de candidaturas via `savedJobs`, notícias do snapshot Valkey da semana, token de unsubscribe via T2), envia via `emailService.send({template:"newsletter", ...})` ou grava `skipped_no_match` se não há vaga.
**Where**: `backend/src/modules/newsletter/newsletter.service.ts` (mesmo arquivo, aditivo)
**Depends on**: T1, T2, T5, T6
**Reuses**: `emailService.send` (`backend/src/modules/email/email.service.ts`), `savedJobs` schema, `generateUnsubscribeToken`
**Requirement**: NEWSL-01, NEWSL-03, NEWSL-04, NEWSL-05, NEWSL-06, NEWSL-09, NEWSL-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Já existe linha `newsletter_sends` pra `(userId, isoWeek)` → retorna sem chamar `emailService.send` (idempotência)
- [ ] Zero vagas com match → grava `status="skipped_no_match"`, não chama `emailService.send`
- [ ] 1+ vaga com match → chama `emailService.send({template:"newsletter", to, data})` com `matchedJobs`, `appliedCount` (contagem `savedJobs` status `applied`/`interviewing`/`accepted`), `news` (do snapshot Valkey; `[]` se ausente/expirado), `unsubscribeUrl` (token de T2)
- [ ] Grava `newsletter_sends` com `status="sent"` e `sentJobIds` = ids das vagas incluídas
- [ ] Usuário inexistente/excluído no meio do processamento → loga aviso, retorna sem lançar (não derruba o job)
- [ ] Snapshot de notícias ausente no Valkey → `news: []`, resto do envio segue normalmente
- [ ] Gate check passa: `npx vitest run backend/tests/unit/modules/newsletter/newsletter.service.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(newsletter): adicionar sendForUser com idempotência e fallback`

---

### T8: `newsletter.service.ts` — `runWeeklyTrigger`

**What**: Busca notícias uma única vez (T3) e cacheia em Valkey (`newsletter:news:{isoWeek}`, TTL 7 dias), lista usuários com `emailNotifications=true` (paginado), enfileira job filho (T4) por usuário elegível ainda sem `newsletter_sends` pra `isoWeek`.
**Where**: `backend/src/modules/newsletter/newsletter.service.ts` (mesmo arquivo, aditivo)
**Depends on**: T1, T3, T4, T6
**Reuses**: `fetchTechNews` (T3), `enqueueUserSend` (T4), `userPreferences`/`users` schema
**Requirement**: NEWSL-01, NEWSL-07, NEWSL-10, NEWSL-11

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Chama `fetchTechNews` exatamente 1x por execução (nunca por usuário)
- [ ] Snapshot de notícias gravado no Valkey com TTL de 7 dias
- [ ] Apenas usuários com `emailNotifications=true` são considerados
- [ ] Usuário já com `newsletter_sends` pra essa `isoWeek` não é reenfileirado
- [ ] Zero usuários elegíveis → conclui sem erro, sem enfileirar nada
- [ ] Gate check passa: `npx vitest run backend/tests/unit/modules/newsletter/newsletter.service.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(newsletter): adicionar runWeeklyTrigger com fan-out por usuário`

---

### T9: Template `newsletter.tsx` + registro

**What**: Componente react-email `Newsletter` (vagas com match, resumo de candidaturas, notícias, link de unsubscribe) sobre `BaseLayout`; registrar como template `newsletter` em `registry.ts`.
**Where**: `backend/src/modules/email/templates/newsletter.tsx`, `backend/src/modules/email/templates/registry.ts` (modificado)
**Depends on**: None
**Reuses**: `backend/src/modules/email/templates/welcome.tsx`, `BaseLayout.tsx`
**Requirement**: NEWSL-01, NEWSL-05, NEWSL-06, NEWSL-07, NEWSL-08, NEWSL-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `NewsletterProps { name, matchedJobs, appliedCount, news, unsubscribeUrl, appUrl }` tipado e exportado
- [ ] Seção de vagas omitida com fallback apropriado quando `matchedJobs` vazio (não deveria ocorrer via `sendForUser`, mas o template não pode quebrar)
- [ ] Seção de notícias omitida (sem quebrar layout) quando `news` vazio
- [ ] Link de unsubscribe presente e usando `unsubscribeUrl`
- [ ] `registry.ts` inclui `newsletter` em `templates` e em `TemplateDataMap`
- [ ] Gate check passa: `npx vitest run backend/tests/unit/modules/email/registry.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(newsletter): adicionar template de e-mail newsletter`

---

### T10: `newsletter.worker.ts`

**What**: Worker BullMQ da fila `newsletter`, despachando por tipo de job: `trigger` → `runWeeklyTrigger()`, `send-user` → `sendForUser(userId, isoWeek)`.
**Where**: `backend/src/modules/newsletter/newsletter.worker.ts`
**Depends on**: T4, T7, T8
**Reuses**: `backend/src/modules/email/email.worker.ts` (estrutura: `worker.on("failed")` só loga, `start`/`stop`)
**Requirement**: NEWSL-01, NEWSL-09

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Job tipo `trigger` chama `runWeeklyTrigger()`
- [ ] Job tipo `send-user` chama `sendForUser(data.userId, data.isoWeek)`
- [ ] Falha final (após retries) só loga via `logError`, não lança pro processo
- [ ] `startNewsletterWorker()`/`stopNewsletterWorker()` seguem o mesmo padrão de singleton do `email.worker.ts`
- [ ] Gate check passa: `npx vitest run backend/tests/unit/modules/newsletter/newsletter.worker.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(newsletter): adicionar worker BullMQ da newsletter`

---

### T11: Endpoint público de unsubscribe

**What**: `POST /newsletter/unsubscribe` (sem `withSession`/`requireAuth`) — valida token (T2), seta `userPreferences.emailNotifications=false`, nunca revela se o `userId` existe.
**Where**: `backend/src/modules/newsletter/newsletter.controller.ts`, `backend/src/routes/newsletter.routes.ts`, `backend/src/app.ts` (modificado: `app.use("/newsletter", newsletterRoutes)`, sem middleware de auth)
**Depends on**: T2
**Reuses**: Padrão de validação Zod dos outros controllers (`backend/src/modules/users/schemas/user.schemas.ts`), Drizzle update em `userPreferences`
**Requirement**: NEWSL-12, NEWSL-13, NEWSL-14, NEWSL-15

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Token válido → `userPreferences.emailNotifications=false` persistido, resposta `{ok: true}`
- [ ] Token malformado/adulterado/de usuário inexistente → resposta `{ok: false}` (nunca 404/mensagem que revele existência do usuário)
- [ ] Rota acessível sem cookie de sessão (nenhum `requireAuth`/`withSession` no caminho)
- [ ] Corpo de request inválido (sem `token`) → `400` com detalhe Zod (mesmo padrão dos outros controllers)
- [ ] Gate check passa: `npm run test --workspace=backend`

**Tests**: integration
**Gate**: full

**Commit**: `feat(newsletter): adicionar endpoint público de unsubscribe`

---

### T12: Wiring de boot (`server.ts`)

**What**: Iniciar worker e agendar o repeatable trigger no boot; fechar fila/worker no graceful shutdown — mesmo padrão do módulo de e-mail.
**Where**: `backend/src/server.ts` (modificado)
**Depends on**: T4, T10
**Reuses**: Blocos existentes de `startEmailWorker()`/`stopEmailWorker()`/`closeEmailQueue()` em `server.ts`
**Requirement**: NEWSL-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `startNewsletterWorker()` + `scheduleWeeklyTrigger()` chamados no boot, no mesmo bloco onde o e-mail é iniciado
- [ ] `stopNewsletterWorker()` + `closeNewsletterQueue()` chamados no `shutdown()` (SIGTERM/SIGINT), antes do processo encerrar
- [ ] Gate check passa: `npm run test --workspace=backend`

**Tests**: none
**Gate**: build

**Commit**: `feat(newsletter): ligar worker e agendamento no boot do servidor`

---

### T13: Página pública `/newsletter/unsubscribe` (frontend)

**What**: Página que lê `?token=` da URL, chama `POST /newsletter/unsubscribe`, mostra confirmação de sucesso/erro — sem exigir login.
**Where**: `frontend/src/domains/newsletter/presentation/pages/UnsubscribePage.tsx` (novo), `frontend/src/app/AppRoutes.tsx` (modificado: rota `/newsletter/unsubscribe` fora de `ProtectedRoute`/`PublicRoute`, mesmo padrão de `/auth/callback`)
**Depends on**: T11
**Reuses**: Padrão de `frontend/src/domains/auth/presentation/pages/AuthCallbackPage.tsx` (página pública com chamada de API no mount), rota pública em `AppRoutes.tsx`
**Requirement**: NEWSL-14, NEWSL-15

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Acessar `/newsletter/unsubscribe?token=X` sem sessão não redireciona pro login
- [ ] Sucesso da API → mensagem de confirmação
- [ ] Falha da API (`{ok:false}`) → mensagem de "link inválido", sem quebrar a página
- [ ] `token` ausente na URL → mensagem de erro, sem chamar a API
- [ ] Gate check passa: `npx vitest run frontend/tests/unit/pages/newsletter/UnsubscribePage.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(newsletter): adicionar página pública de unsubscribe`

---

### T14: Documentação

**What**: Documentar o módulo `newsletter` (arquitetura, variáveis de ambiente novas, decisões AD-005/AD-006) no `BACKEND.md`, mesmo padrão de como PAV-76 documentou o módulo de e-mail.
**Where**: `BACKEND.md` (modificado)
**Depends on**: T7, T8, T9, T10, T11
**Reuses**: Seção existente sobre o módulo de e-mail como modelo de estrutura
**Requirement**: N/A (documentação, não rastreada por AC)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `BACKEND.md` descreve o fluxo trigger→fan-out→envio, a tabela `newsletter_sends`, o endpoint de unsubscribe e as envs novas (feeds RSS, se configuráveis via env)
- [ ] Gate check passa: `npm run test --workspace=backend` (garante que nada foi quebrado, já que o arquivo é só doc)

**Tests**: none
**Gate**: build

**Commit**: `docs(newsletter): documentar módulo de newsletter semanal`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T4
Phase 3:  T5 ──→ T6 ──→ T7 ──→ T8
Phase 4:  T9 ──→ T10
Phase 5:  T11 ──→ T12 ──→ T13 ──→ T14
```

Execution is strictly sequential — there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Schema `newsletter_sends` + migração | 1 tabela + 1 migração | ✅ Granular |
| T2: `unsubscribeToken.ts` | 1 arquivo, 2 funções coesas | ✅ Granular |
| T3: `newsFeed.service.ts` | 1 arquivo, 1 função pública | ✅ Granular |
| T4: `newsletter.queue.ts` | 1 arquivo, mesmo padrão de `email.queue.ts` | ✅ Granular |
| T5: matching (`newsletter.service.ts`) | 1 função | ✅ Granular |
| T6: semana ISO + histórico (`newsletter.service.ts`) | 2 funções pequenas e coesas, mesmo arquivo de T5 | ✅ Granular |
| T7: `sendForUser` (`newsletter.service.ts`) | 1 função (orquestra T5/T6, chamadas já existentes) | ✅ Granular |
| T8: `runWeeklyTrigger` (`newsletter.service.ts`) | 1 função | ✅ Granular |
| T9: Template + registro | 1 componente + 1 edição de registry | ✅ Granular |
| T10: `newsletter.worker.ts` | 1 arquivo, mesmo padrão de `email.worker.ts` | ✅ Granular |
| T11: Endpoint unsubscribe | 1 controller + 1 rota + 1 linha de mount | ✅ Granular |
| T12: Wiring de boot | 1 arquivo, blocos já existentes como modelo | ✅ Granular |
| T13: Página de unsubscribe | 1 página + 1 rota | ✅ Granular |
| T14: Documentação | 1 arquivo de doc | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | Início da Phase 1 | ✅ Match |
| T2 | None | Phase 1, após T1 na ordem sequencial | ✅ Match |
| T3 | None | Phase 1, após T2 na ordem sequencial | ✅ Match |
| T4 | None (fase própria) | Phase 2, isolado | ✅ Match |
| T5 | None | Phase 3, início | ✅ Match |
| T6 | T1 | Phase 3, após T5 na ordem sequencial (T1 já concluído na Phase 1) | ✅ Match |
| T7 | T1, T2, T5, T6 | Phase 3, após T6 (todas as deps já concluídas em fases/tasks anteriores) | ✅ Match |
| T8 | T1, T3, T4, T6 | Phase 3, após T7 na ordem sequencial (deps já concluídas) | ✅ Match |
| T9 | None | Phase 4, início | ✅ Match |
| T10 | T4, T7, T8 | Phase 4, após T9 (deps já concluídas em fases anteriores) | ✅ Match |
| T11 | T2 | Phase 5, início (dep já concluída na Phase 1) | ✅ Match |
| T12 | T4, T10 | Phase 5, após T11 (deps já concluídas) | ✅ Match |
| T13 | T11 | Phase 5, após T12 na ordem sequencial | ✅ Match |
| T14 | T7, T8, T9, T10, T11 | Phase 5, última (todas as deps já concluídas) | ✅ Match |

Nenhuma task depende de uma task de fase posterior — todas as dependências apontam pra trás ou dentro da mesma fase (respeitando a ordem sequencial de tasks).

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1: Schema | Schema/migration | none | none | ✅ OK |
| T2: unsubscribeToken | Domain/service | unit | unit | ✅ OK |
| T3: newsFeed.service | Domain/service | unit | unit | ✅ OK |
| T4: newsletter.queue | Queue/Worker | unit | unit | ✅ OK |
| T5: matching | Domain/service | unit | unit | ✅ OK |
| T6: semana ISO + histórico | Domain/service | unit | unit | ✅ OK |
| T7: sendForUser | Domain/service | unit | unit | ✅ OK |
| T8: runWeeklyTrigger | Domain/service | unit | unit | ✅ OK |
| T9: Template + registro | Template react-email | unit | unit | ✅ OK |
| T10: newsletter.worker | Queue/Worker | unit | unit | ✅ OK |
| T11: Endpoint unsubscribe | Route/controller | integration | integration | ✅ OK |
| T12: Boot wiring | Boot wiring | none | none | ✅ OK |
| T13: UnsubscribePage | Frontend page | unit | unit | ✅ OK |
| T14: Docs | Docs | none | none | ✅ OK |

Nenhuma violação — todas as tasks que criam camada com teste obrigatório incluem o teste na própria task (nenhum teste adiado pra task separada).
