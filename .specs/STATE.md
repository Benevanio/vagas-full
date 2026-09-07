# Project State

## Decisions

Active project-level architectural decisions (AD-NNN). Each design must conform or explicitly supersede.

| ID | Decision | Status | Source |
| --- | --- | --- | --- |
| AD-001 | E-mails transacionais são enviados via módulo centralizado `src/modules/email` — nenhum outro módulo chama provedor de e-mail diretamente. | active | PAV-76 |
| AD-002 | Envio de e-mail é assíncrono via fila BullMQ sobre Valkey (conexão ioredis dedicada). Callers apenas enfileiram; nunca bloqueiam nem falham por causa de e-mail. | active | PAV-76 |
| AD-003 | Provedor de e-mail acessado por trás da interface `MailProvider`. Implementação inicial: Resend. Trocar de provedor não altera código chamador. | active | PAV-76 |
| AD-004 | Templates de e-mail são componentes react-email tipados, renderizados server-side para HTML. Versões `react`/`react-dom`/`@types/react` fixadas em 19.x para casar com o frontend. | active | PAV-76 |
| AD-005 | Jobs agendados/recorrentes no backend usam BullMQ repeatable job (fila dedicada), nunca cron de SO ou serviço de scheduling externo. | active | PAV-109 |
| AD-006 | Links de ação sem sessão (ex.: unsubscribe) usam token opaco HMAC com chave derivada de `ENCRYPTION_MASTER_KEY` (domain separation por finalidade) e `timingSafeEqual` na validação — mesmo padrão de `lib/security/searchableHash.ts`. Nunca JWT (sem dependência `jsonwebtoken` no projeto). | active | PAV-109 |

## Handoff

<<<<<<< HEAD
**Feature concluída:** `newsletter-semanal` (PAV-109) — ✅ Done.
**Estado:** 14/14 tasks implementadas e commitadas na branch `jovinull/pav-109-newsletter-semanal-com-vagas-que-combinam-do` (criada a partir de `master`), em 2 lotes (Fases 1-3: 8 commits; Fases 4-5: 6 commits + 1 fix). Verifier PASS (15/15 ACs, gate 633 backend + 345 frontend, sensor 3/3 mutantes mortos). Relatório em `.specs/features/newsletter-semanal/validation.md`. Lição candidata L-001 registrada em `.specs/LESSONS.md`.
**Entregue:** job BullMQ `newsletter` (trigger semanal seg 08h America/Sao_Paulo + fan-out por usuário), tabela `newsletter_sends` (idempotência + dedup de frescor por histórico de envio), matching de vagas reaproveitando `jobMatch.service.ts`, ingestão RSS (`rss-parser`, feeds hnrss.org + TabNews), template `newsletter` react-email, endpoint público `POST /newsletter/unsubscribe` (token HMAC sem sessão), página pública `/newsletter/unsubscribe` no frontend, docs no `BACKEND.md`. AD-005/AD-006 registradas (BullMQ repeatable job como padrão de agendamento; token HMAC como padrão de link sem sessão).
**Pendências deixadas ao usuário:** (1) push + PR ainda NÃO feitos; (2) validar ao vivo em produção se os feeds RSS (hnrss.org/frontpage, TabNews) continuam respondendo antes do primeiro envio real; (3) observação não-bloqueante do Verifier: `sendForUser` tem uma corrida teórica na checagem de idempotência sob múltiplos workers em paralelo — fora do escopo atual (deployment single-worker), mas vale considerar se o backend escalar horizontalmente.
**Próximo passo:** quando o usuário pedir, abrir PR da PAV-109.
=======
**Feature concluída:** `job-detail-reorganizacao` (PAV-92) — ✅ Done.
**Estado:** implementada e commitada na branch `jovinull/pav-92-frontend` (4 commits: reorg de tiles, dedup do payload, feedback de notas, docs). Validação standalone PASS (8/8 ACs, gate 352/352 frontend, sensor de mutação raciocinado sem sobreviventes). Relatório em `.specs/features/job-detail-reorganizacao/validation.md`.
**Entregue:** `JobDetailModal` reorganizado — local/modalidade/nível/fonte/salário/match em tiles rotulados; bloco "Payload da vaga" renomeado para "Detalhes adicionais" e sem duplicar dado já mostrado; texto indicando que notas salvam ao fechar. Sem migração de modal pra página (critério do próprio card já resolvia isso) e sem novo contrato de backend.
**Pendências deixadas ao usuário:** push + PR ainda NÃO feitos (aguardando confirmação do usuário).
**Próximo passo:** quando o usuário pedir, abrir PR da PAV-92.

**Feature anterior concluída:** `email-module` (PAV-76) — ✅ Done. 11/11 tasks, branch `feature/pav-76-modulo-email`, Verifier PASS (11/11 ACs, gate 529/0, sensor 5/5). Entregue: `emailService.send/sendWelcome`, fila BullMQ/Valkey, `MailProvider`+Resend+Noop, template `welcome`, boas-vindas no registro. Envs de produção `EMAIL_API_KEY`/`EMAIL_FROM_ADDRESS`/`EMAIL_FROM_NAME` a comunicar ao dev quando for pra prod.
>>>>>>> upstream/develop
