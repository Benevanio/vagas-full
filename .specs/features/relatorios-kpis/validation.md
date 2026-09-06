# Relatórios/KPIs do candidato — Validation

**Date**: 2026-09-06
**Spec**: `.specs/features/relatorios-kpis/spec.md`
**Diff range**: `42522ae..HEAD` (commits `8c7a930`..`08971ac`, 16 commits)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `reports.kpis.ts` — commit `747b532` |
| T2   | ✅ Done | `reports.schemas.ts` — commit `85df508` |
| T3   | ✅ Done | `reports.repository.ts` — commit `7ee0761` |
| T4   | ✅ Done | `reports.service.ts` — commit `e1e3cca` |
| T5   | ✅ Done | controller + rota + mount — commit `f856f37` |
| T6   | ✅ Done | `BACKEND.md` — commit `15316dd` |
| T7   | ✅ Done | `reportsApi.ts` + `recharts` dep — commit `6e6a186` |
| T8   | ✅ Done | `useReportsKpis.ts` — commit `7e001c5` |
| T9   | ✅ Done | `PeriodSelector` + `WeeklyApplicationsChart` — commit `9828847` |
| T10  | ✅ Done | `InterviewRateChart` + `StageDurationsChart` — commit `41193d2` |
| T11  | ✅ Done | `ReportsSummary` + `ReportsTab` — commit `38ccc3e` |
| T12  | ✅ Done | rota `/relatorios` + lazy + proxy — commit `12777f1` |
| T13  | ✅ Done | nav sidebar/tabbar/icon — commit `41d108f` |

All 13 tasks done. 3 documented deviations from `design.md` (see tasks.md Batch B notes) — checked against spec.md: none contradict a spec AC (StageDurationsChart uses CSS bars, not Recharts — spec's AC P2-3 only requires "gráfico de barras horizontais", not a specific library; inline loading text instead of global `Loading` — no AC mandates a specific loading component; per-request Zod schema construction — pure implementation detail, no AC affected). Treated as accepted per tasks.md instruction.

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| KPI-01: GET sem query → 200 shape completo, janela 90d | `{range,weeklyApplications,interviewRate,stageDurations}`, range = últimos 90d UTC | `backend/tests/integration/routes/reports.routes.test.ts:85-93` — `expect(res.body).toEqual(fixtureReport)`; `expect(mockReportsService.getKpis).toHaveBeenCalledWith("user_abc", {from: 2025-12-15T00:00Z, to: 2026-03-15T23:59:59.999Z})` | ✅ PASS |
| KPI-02: série semanal, 1 item/semana não-vazia, ordenada, soma=total | itens ordenados por `weekStart`, `sum(count)===submitted.length` | `backend/tests/unit/modules/reports/reports.kpis.test.ts:71-75` (soma=3), `:107-115` (ordenação exata `[{2026-W02,count:2},{2026-W04,count:1}]`), `:159-163` (fora da janela excluído) | ✅ PASS |
| KPI-03: taxa = round(Y/X*100), insufficientData=false | 2/3 → round(66.66)=67 | `reports.kpis.test.ts:214` — `expect(report.interviewRate).toEqual({value:67, insufficientData:false})` | ✅ PASS |
| KPI-04: sem candidatura → série `[]` + `{value:0,insufficientData:true}` | valores exatos | `reports.kpis.test.ts:249-256` (unit) + `reports.routes.test.ts:104-110` (integração, `emptyReport`) | ✅ PASS |
| KPI-05: 3 chaves, média em dias 1 casa, null sem transição | `savedToApplied:3.5, appliedToInterviewing:3, interviewingToOutcome:null` (fixture manual) | `reports.kpis.test.ts:293-297` | ✅ PASS |
| KPI-06: isolamento por `user_id` | queries filtradas por `userId` da sessão, não vazam entre usuários | `backend/tests/unit/modules/reports/reports.repository.test.ts:74,82-91,98-99` (`eq` chamado com `savedJobs.userId`/`applicationEvents.userId`, valores distintos por usuário) + `reports.routes.test.ts:95-102` (service chamado com `"user_abc"` da sessão) | ✅ PASS |
| KPI-07: sem sessão → 401, sem agregação | `401`, body `{code:"UNAUTHORIZED", message:"Não autenticado."}`, service não chamado | `reports.routes.test.ts:124-136` — `.expect(401)`, `expect(res.body).toEqual({code:"UNAUTHORIZED", message:"Não autenticado."})`, `expect(mockReportsService.getKpis).not.toHaveBeenCalled()` | ✅ PASS |
| KPI-08: 400 em from/to inválidos ou from>to | `400`, service não chamado | `reports.routes.test.ts:138-145` (formato) + `:147-155` (`from>to`, body `{code:"VALIDATION_ERROR"}`) + `reports.schemas.test.ts:49-63` (unit) | ✅ PASS |
| KPI-09: janela `[00:00Z,23:59:59.999Z]`, range ecoado | valores exatos ancorados | `reports.schemas.test.ts:15-21` (`from=00:00:00.000Z`, `to=23:59:59.999Z`) + `reports.routes.test.ts:112-122` (integração, mesmos valores) | ✅ PASS |
| KPI-10: `/relatorios` item ativo sidebar/tabbar; rota exige auth (mesmo guard) | guard idêntico às outras seções; item destacado em ambos os menus | `frontend/tests/unit/app/AppRoutes.test.tsx` (novos testes, redireciona a login sem user / renderiza shell com user) + `frontend/tests/unit/new_dashboard/reportsRoute.test.tsx:146-164` (2 links "Relatórios", um com `bg-primary` outro com `aria-current="page"`, ambos `href="/relatorios"`) | ✅ PASS |
| KPI-11: fetch no load com período default + loading state | `getReportsKpis` chamado com range de "90d"; `isLoading` true até resolver | `frontend/tests/unit/new_dashboard/reportsHook.test.tsx:36-49` — `expect(result.current.isLoading).toBe(true)` antes do resolve; `expect(reportsApiMock.periodToRange).toHaveBeenCalledWith("90d")` | ✅ PASS |
| KPI-12: render dos 3 gráficos com dados | barras semanais, donut, barras horizontais de etapa, todos presentes | `frontend/tests/unit/new_dashboard/reportsCharts.test.tsx:49-62,73-80,100-115` + `reportsTab.test.tsx:93-108` | ✅ PASS |
| KPI-13: trocar preset refaz fetch e re-renderiza | nova chamada com novos params | `reportsHook.test.tsx:51-69` (`setPeriod("30d")` → `getReportsKpis` chamado com range de 30d) + `reportsTab.test.tsx:134-144` (clique dispara `setPeriod("30d")`) | ✅ PASS |
| KPI-14: resposta vazia → empty state por card | texto "Sem dados no período." em vez de gráfico vazio | `reportsCharts.test.tsx:64-69` (weekly), `:82-90` (interview rate, sem "0%") + `reportsTab.test.tsx:110-119` (≥2 empty states simultâneos) | ✅ PASS |
| KPI-15: erro → estado de erro + "tentar novamente" chama reload | botão chama `reload` exatamente 1x | `reportsHook.test.tsx:71-80` (hook: `error` preenchido, `data` null, sem throw) + `reportsTab.test.tsx:121-132` (`fireEvent.click` → `expect(reload).toHaveBeenCalledTimes(1)`) | ✅ PASS |
| KPI-16: etapa `null` → "—", nunca `0` | distingue `null` de `0` real | `reportsCharts.test.tsx:117-133` — `null` → texto "—" e SEM `data-testid="stage-bar-appliedToInterviewing"`; valor real `0` → texto "0,0 d" E `data-testid="stage-bar-interviewingToOutcome"` presente | ✅ PASS (teste forte — cobre exatamente a distinção que a spec exige) |
| KPI-17: 3 tiles (soma, taxa, semana mais ativa/"—") | valores exatos calculados | `frontend/tests/unit/new_dashboard/reportsTab.test.tsx:64-70` (total=5, taxa=67%, semana=2026-W10 = maior count) + `:72-77` (série vazia → "—") | ✅ PASS |

**Status**: ✅ All 17/17 ACs covered with spec-precise assertions. No spec-precision gaps found — every criterion with a defined outcome in spec.md has a test asserting that exact value (not just "assertion exists").

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `backend/src/modules/reports/reports.kpis.ts:148` | `Math.round((numer/denom)*100)` → `Math.floor(...)` | ✅ Killed — `reports.kpis.test.ts` "value = round(Y / X * 100)" failed: expected 67, got 66 |
| 2 | `backend/src/modules/reports/reports.kpis.ts:50` | ISO-week Monday boundary `day === 0 ? -6 : 1 - day` → `day === 0 ? 1 : 1 - day` | ✅ Killed — 6 of 6 `isoWeekStart`/`isoWeekLabel` boundary tests failed (Sunday/year-boundary/W53 cases) |
| 3 | `frontend/src/domains/new_dashboard/components/reports/StageDurationsChart.tsx:46` | `null` render `"—"` → `"0,0 d"` | ✅ Killed — 2 of 10 `reportsCharts.test.tsx` tests failed: "—" no longer found; "0,0 d" now ambiguous (multiple matches) |

**Sensor depth**: lightweight (3 targeted mutations, per default tier)
**Result**: 3/3 killed — PASS ✅
**Tree state**: confirmed clean (`git status --porcelain` empty, `git diff --stat` empty) after each revert and at session end.

---

## Payload/Conjunction Rule Check

Verified that tests assert actual **returned values**, not just that a mock was called:

- `reports.routes.test.ts:88` — `expect(res.body).toEqual(fixtureReport)` (full object equality, not `toHaveBeenCalled()` alone).
- `reports.routes.test.ts:131-134` — 401 body asserted exactly: `{code:"UNAUTHORIZED", message:"Não autenticado."}`.
- `reports.routes.test.ts:153` — 400 body asserted: `{code:"VALIDATION_ERROR"}` (`toMatchObject`).
- `reports.routes.test.ts:89-92,118-121` — service-call args asserted with concrete computed `Date` objects (`from`/`to`), not `expect.anything()` (except the KPI-06-focused test at line 98-101 which intentionally isolates the `userId` assertion with `expect.anything()` for the second arg — the window itself is covered precisely by the adjacent KPI-01/KPI-09 tests).
- `reportsApi.test.ts:32-44` — `toReportsKpis` mapping asserted field-by-field with `toEqual` against concrete values.
- `reportsHook.test.tsx:46-48,64-68` — hook state (`data`, calls to `getReportsKpis`/`periodToRange`) asserted with concrete arguments, not just call presence.

Conclusion: conjunction rule satisfied — no test in the reports scope asserts "a mock was called" without also (in the same test or an adjacent one covering the same AC) asserting on the concrete value/shape.

---

## Code Quality

| Principle        | Status |
| ---------------- | ------ |
| Minimum code     | ✅ |
| Surgical changes | ✅ (only `backend/src/modules/reports/**`, `backend/src/routes/reports.routes.ts`, `backend/src/app.ts` mount, frontend `reports/**`, wiring files listed in design.md) |
| No scope creep   | ✅ |
| Matches patterns | ✅ (router→controller→service mirrors `savedJobs`; adapter/hook mirror `userDashboardApi`/`useUserDashboardData`) |
| Spec-anchored outcome check (asserted values match spec) | ✅ (see table above) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — route test covers 200/200-empty/400×2/401/500 |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — every test file/describe block references a KPI-NN in its title |
| Documented guidelines followed | `vitest.config.js` thresholds, `AGENTS.md` commit conventions (PT, conventional, no co-author — confirmed via `git log`) |

---

## Edge Cases (spec.md)

- [x] Usuário nunca salvou vaga → 200 zerado + UI empty state (KPI-04, KPI-14)
- [x] Todas as vagas em `saved` → `weeklyApplications:[]`, `insufficientData:true`, `stageDurations` tudo `null` (`reports.kpis.test.ts:241-256`)
- [x] Vaga sem evento saindo de `saved` (defensivo) → não conta como candidatura (implícito no algoritmo: `submittedAt` retorna `null` se `job.status==="saved"` e sem evento `fromStatus==="saved"`)
- [x] Eventos fora do período mas vaga submetida dentro → só durações com evento de saída dentro da janela contam (`reports.kpis.test.ts:361-388`, `savedToApplied: null`, `appliedToInterviewing: 7`)
- [x] `to` no futuro → aceito (nenhuma validação de limite superior no schema; `dateStringSchema` só valida formato/calendário)
- [x] Período de 1 dia (`from===to`) → aceito (`reports.schemas.test.ts:39-45`)
- [x] Ida-e-volta do mesmo par de status → cada segmento consecutivo conta (`reports.kpis.test.ts:328-359`, média `[2,4]`=3)
- [x] `application_events.metadata` nulo/ausente → irrelevante (não é lido em `KpiEvent`, coerente por construção de tipo)

---

## Gate Check

- **Gate command**: Build gate — `npm run test --workspace=backend && npm run test --workspace=frontend && npm run build --workspace=frontend && npm run lint --workspace=frontend` + `npx tsc --noEmit -p backend/tsconfig.json`
- **Backend result**: 608 passed, 1 failed (`tests/unit/services/server.test.ts > server entry > inicializa app e chama listen` — timed out at 5000ms; this is the documented pre-existing flake, timing-based, unrelated to `reports`; confirmed no other failures and nothing under `reports` failed). Total 609 tests, 65 test files (64 passed, 1 file w/ 1 failing test).
- **Frontend result**: 377 passed, 0 failed, 57 test files passed.
- **Build**: succeeded. Separate lazy chunk confirmed: `dist/assets/ReportsTab-CTwt285F.js` — 374.36 kB / gzip 107.80 kB — not merged into `dist/assets/index-*.js` (1,236.80 kB / gzip 296.31 kB main bundle). Matches tasks.md's ~108kB gzip note.
- **Lint**: 0 errors, 4 pre-existing warnings (unrelated: `coverage/*.js` generated files, `theme.toast.test.tsx` exhaustive-deps).
- **tsc --noEmit (backend)**: exactly 5 errors, all under `src/modules/auth/` (`auth.service.ts:72`, `connections.controller.ts:21,25`, `credentials.service.ts:89,90`) — matches the known pre-existing baseline (`memory/ts-errors-auth-module.md`). Zero errors under `src/modules/reports` or any other file touched by this feature.
- **Test count before feature**: backend 570, frontend ~344 (per tasks.md Batch A/B notes).
- **Test count after feature**: backend 609 (+39), frontend 377 (+33).
- **Delta**: +72 new tests total, no deletions.
- **Skipped tests**: none.
- **Failures**: 1, pre-existing flake, justified above.

---

## Fix Plans

None. No gaps found.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| KPI-01 | Pending | ✅ Verified |
| KPI-02 | Pending | ✅ Verified |
| KPI-03 | Pending | ✅ Verified |
| KPI-04 | Pending | ✅ Verified |
| KPI-05 | Pending | ✅ Verified |
| KPI-06 | Pending | ✅ Verified |
| KPI-07 | Pending | ✅ Verified |
| KPI-08 | Pending | ✅ Verified |
| KPI-09 | Pending | ✅ Verified |
| KPI-10 | Pending | ✅ Verified |
| KPI-11 | Pending | ✅ Verified |
| KPI-12 | Pending | ✅ Verified |
| KPI-13 | Pending | ✅ Verified |
| KPI-14 | Pending | ✅ Verified |
| KPI-15 | Pending | ✅ Verified |
| KPI-16 | Pending | ✅ Verified |
| KPI-17 | Pending | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 17/17 ACs matched spec-defined outcome, 0 spec-precision gaps
**Sensor**: 3/3 mutations killed
**Gate**: backend 608/609 passed (1 documented pre-existing flake unrelated to `reports`), frontend 377/377 passed, build OK (lazy chunk confirmed), lint 0 errors, tsc scoped clean (only the 5 pre-existing `auth` errors)

**What works**: Full `computeKpis` pure-core algorithm (weekly series, interview rate, stage durations, ISO-week helpers with boundary cases), Zod query schema (defaults, anchoring, `from>to` rejection), repository/service/controller/route wiring with correct 200/400/401/500 behavior and per-user isolation, frontend adapter/hook/components (loading/empty/error states, `null` vs `0` distinction in `StageDurationsChart`, period-preset refetch, nav wiring with auth guard).

**Issues found**: None.

**Next steps**: None — feature ready to merge from a verification standpoint.
