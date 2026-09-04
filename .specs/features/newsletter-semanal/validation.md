# Newsletter Semanal Validation

**Date**: 2026-09-03
**Spec**: `.specs/features/newsletter-semanal/spec.md`
**Diff range**: `4bd3b35..58bae80` (branch `jovinull/pav-109-newsletter-semanal-com-vagas-que-combinam-do`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1: Schema `newsletter_sends` + migração | ✅ Done | `backend/drizzle/0014_concerned_blue_shield.sql`, `newsletterSends.ts` |
| T2: `unsubscribeToken.ts` | ✅ Done | Commit `f540f77` |
| T3: `newsFeed.service.ts` | ✅ Done | Commit `35e7874`; feeds verified live per design note |
| T4: `newsletter.queue.ts` | ✅ Done | Commit `f19d94a` |
| T5: matching (`computeMatchedJobsForUser`) | ✅ Done | Commit `711c082` |
| T6: `getIsoWeek` + `getRecentlySentJobIds` | ✅ Done | Commit `bb18718` |
| T7: `sendForUser` | ✅ Done | Commit `e62551e` — introduced temporary `SPEC_DEVIATION` (type cast), closed in T9 |
| T8: `runWeeklyTrigger` | ✅ Done | Commit `1655a8c` |
| T9: Template + registry | ✅ Done | Commit `b2deef1` — closed out T7's type-cast deviation |
| T10: `newsletter.worker.ts` | ✅ Done | Commit `448af59` |
| T11: Endpoint unsubscribe | ✅ Done | Commit `fd367c7` |
| T12: Wiring de boot | ✅ Done | Commit `ff137d1`; follow-up fix `06e7a79` (SPEC_DEVIATION: ephemeral connection for `scheduleWeeklyTrigger`) |
| T13: `UnsubscribePage.tsx` | ✅ Done | Commit `169e081` |
| T14: Documentação | ✅ Done | Commit `58bae80` |

All 14 tasks committed atomically (15 feature commits total including the follow-up fix and the initial spec/design/tasks doc commit). None blocked or partial.

---

## Spec-Anchored Acceptance Criteria

### P1: Vagas com match

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| NEWSL-01: WHEN job semanal roda THEN considerar apenas usuários com `emailNotifications=true` | Only opt-in users are fanned out | `backend/src/modules/newsletter/newsletter.service.ts:246-253` (`getEligibleUserIds` filters `eq(userPreferences.emailNotifications, true)`); behavioral evidence `backend/tests/unit/modules/newsletter/newsletter.service.test.ts:420-436` — asserts `enqueueUserSend` called only for non-already-sent eligible users | ✅ PASS |
| NEWSL-02: WHEN usuário tem 1+ vaga match últimos 7d THEN incluir até 5, `matchScore` desc | Top-5 desc, exact scores | `newsletter.service.test.ts:166-173` — `expect(result.map(j=>j.id)).toEqual(["job-2","job-3"])`, `result[0].matchScore).toBe(90)` | ✅ PASS |
| NEWSL-03: WHEN sem vaga match THEN pular envio (nenhum e-mail) | `emailService.send` not called; row `status="skipped_no_match"` | `newsletter.service.test.ts:314-326` — `expect(emailServiceMocks.send).not.toHaveBeenCalled()`, `insertValues` called with exact `{status:"skipped_no_match", sentJobIds:[]}` | ✅ PASS |
| NEWSL-04: WHEN job executa THEN enfileirar via módulo `email` existente | `emailService.send({template:"newsletter",...})` called, never a provider directly | `newsletter.service.test.ts:328-343` — exact payload match via `toHaveBeenCalledWith` | ✅ PASS |

### P1: Resumo de candidaturas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| NEWSL-05: contagem total `applied`/`interviewing`/`accepted` | exact count included in email data | `newsletter.service.test.ts:328-343` — `appliedCount: 4` exact; `backend/tests/unit/modules/email/registry.test.ts:69` — html contains `"Você já se candidatou a 4 vagas."` | ✅ PASS |
| NEWSL-06: 0 candidaturas → estado vazio, seção não omitida | exact empty-state copy rendered, template doesn't break | `registry.test.ts:75-87` — `expect(html).toContain("Você ainda não se candidatou a nenhuma vaga.")` | ✅ PASS |

### P1: Notícias do mercado tech

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| NEWSL-07: buscar RSS, incluir no máx 5, mais recentes | exact ordering + cap | `backend/tests/unit/modules/newsletter/newsFeed.service.test.ts:56-70` (order desc exact), `:72-87` (cap at 5 of 8); `newsletter.service.test.ts:404-408` — `fetchTechNews` called exactly 1x | ✅ PASS |
| NEWSL-08: falha RSS → envia mesmo assim, omite seção | `fetchTechNews` never throws; template omits section | `newsFeed.service.test.ts:105-131` — partial/total feed failure resolves `[]`/partial without throw; `registry.test.ts:89-102` — `expect(html).not.toContain("Notícias do mercado tech")` | ✅ PASS |
| NEWSL-09: sem itens novos → omite seção sem quebrar | same as above, empty array case | `registry.test.ts:89-102` (exact); `newsFeed.service.test.ts` covers empty-feed case implicitly via all-fail test | ✅ PASS |

### P1: Opt-out via perfil

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| NEWSL-10: desmarcar → excluído da próxima execução | Spec explicitly declares this reuses NEWSL-01's coverage ("nenhum teste novo de UI é necessário") | `newsletter.service.ts:246-253` (`eq(emailNotifications, true)` filter) + NEWSL-01 evidence above | ✅ PASS (by spec's own reuse declaration) |
| NEWSL-11: reabilitar → volta a ser incluído se elegível | Same reuse declaration | Same as above | ✅ PASS (by spec's own reuse declaration) |

### P1: Unsubscribe pelo corpo do e-mail

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| NEWSL-12: link de unsubscribe com token assinado no corpo | exact URL with token present in template | `registry.test.ts:44-73` — `expect(html).toContain(href="${unsubscribeUrl}")`; `newsletter.service.test.ts:339` — exact `unsubscribeUrl: "https://app.com/newsletter/unsubscribe?token=TOKEN123"` | ✅ PASS |
| NEWSL-13: token válido → `emailNotifications=false`, sem sessão | exact DB update + response shape, no session required | `backend/tests/integration/routes/newsletter.routes.test.ts:43-55` — `res.body` exact `{ok:true}`, `dbMocks.set` called with `{emailNotifications:false}`; `:81-92` — 200 without session cookie | ✅ PASS |
| NEWSL-14: token inválido/adulterado → rejeita sem revelar usuário | same `{ok:false}` shape for tampered token and for valid-token-but-deleted-user | `newsletter.routes.test.ts:57-67` and `:69-79` — both assert identical `{ok:false}` shape; `backend/tests/unit/lib/security/unsubscribeToken.test.ts:66-95` — malformed/tampered/forged tokens all return `null` exact | ✅ PASS |
| NEWSL-15: página de confirmação simples sem login | exact success/error copy, no auth required | `frontend/tests/unit/pages/newsletter/UnsubscribePage.test.tsx:24-73` — exact text assertions (`"Inscrição cancelada"`, `"Link inválido"`), renders without `useAuth`/`ProtectedRoute` | ✅ PASS |

**Status**: ✅ All 15 ACs covered — 15/15 matched spec-defined outcome, 0 spec-precision gaps.

---

## Discrimination Sensor

Ran in scratch state on the real tree via `Edit` + `git checkout -- <file>` (verified clean before and after each mutation).

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `backend/src/modules/newsletter/newsletter.service.ts:168` | Idempotency guard flipped: `if (existing) return;` → `if (!existing) return;` | ✅ Killed (7/26 tests in `newsletter.service.test.ts` failed) |
| 2 | `backend/src/modules/newsletter/newsletter.service.ts:202` | `skipped_no_match` fallback inverted: `matchedJobs.length === 0` → `matchedJobs.length >= 0` (always true) | ✅ Killed (4/26 tests failed) |
| 3 | `backend/src/lib/security/unsubscribeToken.ts:55-56` | `timingSafeEqual` bypass: `isValid = candidate.length === expected.length && timingSafeEqual(...)` → `isValid = true` | ✅ Killed (3/9 tests in `unsubscribeToken.test.ts` failed) |

**Sensor depth**: lightweight (3 targeted mutations on highest-risk new behaviors: idempotency guard, no-match fallback, timing-safe token comparison).
**Result**: 3/3 killed — PASS ✅

All mutations reverted via `git checkout --`; working tree confirmed clean (`git status --short` empty) before and after the sensor run.

---

## Interactive UAT Results

N/A — infrastructure feature (cron job, queue, RSS ingestion) plus one small public page with no complex interactive flow. Per `validate.md` step 7, interactive UAT is skipped for backend-heavy infrastructure work; automated checks (spec-anchored AC check + sensor + full gate) are sufficient.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — no speculative abstractions; `newsletter.service.ts` is one file per design, functions are small and single-purpose |
| Surgical changes | ✅ — diff touches only files required by tasks.md; `app.ts`/`server.ts` changes are additive, mirroring existing email blocks |
| No scope creep | ✅ — no analytics/tracking, no extra channels, matches Out of Scope table in spec.md |
| Matches patterns | ✅ — `newsletter.queue.ts`/`newsletter.worker.ts` closely mirror `email.queue.ts`/`email.worker.ts` (singleton, dedicated ioredis connection, `attempts`+`backoff`, `close()`); `unsubscribeToken.ts` mirrors `searchableHash.ts` (HMAC + `timingSafeEqual`, `Buffer.from(...).length` guard before compare) |
| Spec-anchored outcome check (asserted values match spec) | ✅ — see AC table above, all exact-value assertions |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — `newsletter.routes.test.ts` covers happy (valid token), edge (valid token/deleted user), error (malformed/tampered, missing body → 400) |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — spot-checked all 8 test files; every `it()` title either cites a NEWSL-ID, an edge case, or a Done-when bullet from tasks.md |
| Documented guidelines followed | ✅ — `backend/GUIA_TESTES_AUTOMATIZADOS.md` (`it.each` used for `getIsoWeek` year-boundary cases and malformed-token cases; behavior-over-implementation-detail style followed) |

**Observation (non-blocking)**: `sendForUser` (`newsletter.service.ts:158-236`) does a check-then-act idempotency pattern (`findFirst` existing row, then later `insert`) without a transaction/lock. The DB `unique(userId, isoWeek)` index prevents a duplicate *row*, and BullMQ's default worker concurrency is 1 (sequential) per process, so under the feature's actual deployment shape (single in-process worker) this is safe. Under a hypothetical multi-process/horizontally-scaled worker deployment, two concurrent `sendForUser` calls for the same `(userId, isoWeek)` could both pass the `existing` check before either inserts, causing two `emailService.send()` calls (the second insert would then fail on the unique constraint and retry, but the duplicate email would already be sent). This scenario is outside the feature's stated scope (design assumes single in-process worker, matching the existing email module's architecture) and is not a spec AC — not raised as a ranked gap, noted for future reference only.

---

## Edge Cases

- [x] Job semanal roda duas vezes na mesma semana ISO (reprocessamento/crash+retry) → evita duplicata: `unique(userId, isoWeek)` DB constraint (`newsletterSends.ts:37-39`) + `sendForUser`'s existing-row early return (test: `newsletter.service.test.ts:301-312`) + `runWeeklyTrigger`'s already-sent exclusion filter (test: `:420-436`)
- [x] Usuário excluído (LGPD, PAV-41) entre cálculo e processamento → falha graciosamente sem derrubar o job: `newsletter.service.test.ts:356-363` — `usersFindFirst` returns `undefined` → `logWarn` + resolves without throwing
- [x] E-mail ausente/inválido no momento do envio → pula usuário, loga aviso: `newsletter.service.test.ts:365-372` — invalid email → `logWarn` + resolves without sending
- [x] Nenhum usuário elegível → conclui normalmente, sem erro: `newsletter.service.test.ts:438-444` — empty eligible list → resolves undefined, `enqueueUserSend` never called

All 4 spec.md edge cases handled and covered by tests.

---

## Gate Check

- **Gate command**: `npm run test --workspace=backend` / `npm run test --workspace=frontend`
- **Result (backend)**: 633 passed, 0 failed, 0 skipped (66 test files)
- **Result (frontend)**: 345 passed, 0 failed, 0 skipped (53 test files)
- **Test count before feature**: not independently measurable from this diff alone (pre-feature baseline not checked out separately); the diff adds 8 new test files (`newsletter.service.test.ts`, `newsletter.queue.test.ts`, `newsletter.worker.test.ts`, `newsFeed.service.test.ts`, `unsubscribeToken.test.ts`, `newsletter.routes.test.ts`, extensions to `registry.test.ts`, `UnsubscribePage.test.tsx`) totaling well over 100 new test cases across backend+frontend
- **Delta**: net-positive, all new tests passing
- **Skipped tests**: none
- **Failures**: none

---

## SPEC_DEVIATION Review

Two inline `SPEC_DEVIATION` markers found in the diff history:

1. **`newsletter.service.ts` (commit `e62551e`, closed in `b2deef1`)**: temporary `template: "newsletter" as never` cast in `sendForUser`, because the `newsletter` template wasn't yet registered in `templates/registry.ts` (that happens in T9, a later task in the same sequential phase plan). Closed out correctly once T9 landed — verified via `git log -p` that the cast is gone from the current tree and `registry.ts` now includes `newsletter` in `TemplateDataMap`. **Judged**: legitimate, self-resolving artifact of sequential task ordering within one phase — not a code smell, not left behind.
2. **`newsletter.queue.ts:80-89` (commit `06e7a79`, still present in current tree)**: `scheduleWeeklyTrigger()` uses its own ephemeral `IORedis`+`Queue` instance (with a 5s timeout, closed in a `finally`) instead of the shared singleton connection used by `getNewsletterQueue()`/`enqueueUserSend()`. Reasoning documented in the comment: reusing the singleton meant a Valkey outage at boot left the boot-time call retrying indefinitely (ioredis default retry behavior on a singleton connection), which would also poison the same connection object used later by the worker for job processing — violating AD-002's "infra indisponível nunca bloqueia o boot" principle. **Judged**: legitimate and well-reasoned architectural fix for a real resource-leak/boot-hang bug found while wiring T12; not a shortcut or a spec gap. This is exactly the kind of deviation that's worth generalizing — recorded as lesson L-001 (see below).

---

## Fix Plans

None. No gaps found.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| NEWSL-01 | Pending | ✅ Verified |
| NEWSL-02 | Pending | ✅ Verified |
| NEWSL-03 | Pending | ✅ Verified |
| NEWSL-04 | Pending | ✅ Verified |
| NEWSL-05 | Pending | ✅ Verified |
| NEWSL-06 | Pending | ✅ Verified |
| NEWSL-07 | Pending | ✅ Verified |
| NEWSL-08 | Pending | ✅ Verified |
| NEWSL-09 | Pending | ✅ Verified |
| NEWSL-10 | Pending | ✅ Verified |
| NEWSL-11 | Pending | ✅ Verified |
| NEWSL-12 | Pending | ✅ Verified |
| NEWSL-13 | Pending | ✅ Verified |
| NEWSL-14 | Pending | ✅ Verified |
| NEWSL-15 | Pending | ✅ Verified |

---

## Lessons Distilled

One grounded signal (SPEC_DEVIATION #2 above, judged as worth generalizing) → recorded via `scripts/lessons.py`:

```
L-001 (candidate, recurrence=1)
feature: newsletter-semanal | signal: spec_deviation
source: backend/src/modules/newsletter/newsletter.queue.ts:80-89 (SPEC_DEVIATION)
text: Boot-time one-shot scheduling calls against Redis/Valkey (e.g. registering a BullMQ
repeatable job) should use a short-lived connection with a timeout, not the shared
long-lived singleton, so a broker outage at boot cannot leave the singleton connection
stuck retrying and block subsequent worker/queue use.
scope: queue
```

SPEC_DEVIATION #1 (temporary type cast, `newsletter.service.ts`) was **not** recorded as a lesson — it's a normal, self-resolving artifact of sequential task ordering within a single phase (T7 before T9), not a codebase-general execution gotcha a future feature could apply guidance from. Recording it would be a methodology observation about task sequencing, which is out of this layer's scope per `lessons.md`'s scope-discipline rule.

No surviving mutants, no failed/uncovered ACs, no spec-precision gaps — nothing else to distill.

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 15/15 ACs matched spec-defined outcome, 0 spec-precision gaps
**Sensor**: 3/3 mutations killed
**Gate**: 633 passed (backend), 345 passed (frontend), 0 failed, 0 skipped

**What works**: Full trigger→fan-out→send pipeline with correct idempotency (unique DB constraint + check-then-act guard), correct opt-out enforcement, correct match-job selection/exclusion/ordering, correct applied-count summary with empty state, resilient RSS ingestion (never blocks send on failure), HMAC-based unsubscribe token with proper `timingSafeEqual` comparison and no user-enumeration leak, public unsubscribe endpoint and page both accessible without a session, and full boot/shutdown wiring mirroring the existing email module's pattern.

**Issues found**: None blocking. One non-blocking architectural observation noted above (check-then-act idempotency race under a hypothetical multi-process worker deployment — out of the feature's stated single-worker scope).

**Next steps**: None required. Feature is ready to merge/ship as-is.
