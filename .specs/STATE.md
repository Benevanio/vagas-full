# Project State

## Decisions

Active project-level architectural decisions (AD-NNN). Each design must conform or explicitly supersede.

| ID | Decision | Status | Source |
| --- | --- | --- | --- |
| AD-001 | E-mails transacionais são enviados via módulo centralizado `src/modules/email` — nenhum outro módulo chama provedor de e-mail diretamente. | active | PAV-76 |
| AD-002 | Envio de e-mail é assíncrono via fila BullMQ sobre Valkey (conexão ioredis dedicada). Callers apenas enfileiram; nunca bloqueiam nem falham por causa de e-mail. | active | PAV-76 |
| AD-003 | Provedor de e-mail acessado por trás da interface `MailProvider`. Implementação inicial: Resend. Trocar de provedor não altera código chamador. | active | PAV-76 |
| AD-004 | Templates de e-mail são componentes react-email tipados, renderizados server-side para HTML. Versões `react`/`react-dom`/`@types/react` fixadas em 19.x para casar com o frontend. | active | PAV-76 |

## Handoff

**Feature concluída:** `relatorios-kpis` (PAV-30) — ✅ Done.
**Estado:** 13/13 tasks implementadas e commitadas na branch `jovinull/pav-30-relatorios-kpis-do-candidato` (Batch A backend T1–T6: 6 commits; Batch B frontend T7–T13: 7 commits; +3 commits de docs/planejamento). Verifier PASS (17/17 ACs, gate backend 608/609 — 1 flake pré-existente não relacionado em `server.test.ts` —, frontend 377/377, build+lint limpos, sensor 3/3 mutantes mortos). Relatório em `.specs/features/relatorios-kpis/validation.md`.
**Entregue:** `GET /reports/kpis` (candidaturas por semana, taxa de entrevista, tempo médio por etapa; período via `from`/`to`, default 90d) sobre `saved_jobs`/`application_events`; núcleo puro `computeKpis` + helpers de semana ISO; seção `/relatorios` no dashboard (sidebar + tab bar mobile) com Recharts lazy-loaded (chunk separado, ~108kB gzip), seletor de período, sumário e estados loading/empty/erro-com-retry. Docs no `BACKEND.md`.
**Desvios do design (sem violar spec):** `StageDurationsChart` usa barras CSS em vez de Recharts (precisão null-vs-zero do KPI-16); loading da aba é texto inline, não o componente `Loading` global (que é overlay fullscreen); schema Zod da query é construído por request, não uma instância única de módulo (evita congelar o default "hoje").
**Pendências deixadas ao usuário:** push + PR ainda NÃO feitos (a pedido do fluxo padrão — aguardando confirmação do usuário).
**Próximo passo:** quando o usuário pedir, abrir PR da PAV-30.

**Feature anterior concluída:** `email-module` (PAV-76) — ✅ Done. 11/11 tasks, branch `feature/pav-76-modulo-email`, Verifier PASS (11/11 ACs, gate 529/0, sensor 5/5). Entregue: `emailService.send/sendWelcome`, fila BullMQ/Valkey, `MailProvider`+Resend+Noop, template `welcome`, boas-vindas no registro. Envs de produção `EMAIL_API_KEY`/`EMAIL_FROM_ADDRESS`/`EMAIL_FROM_NAME` a comunicar ao dev quando for pra prod.
