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

**Feature concluída:** `email-module` (PAV-76) — ✅ Done.
**Estado:** 11/11 tasks implementadas e commitadas na branch `feature/pav-76-modulo-email` (Batch A: 5 commits; Batch B: 6 commits). Verifier PASS (11/11 ACs, gate 529/0, sensor 5/5 mutantes mortos). Relatório em `.specs/features/email-module/validation.md`.
**Entregue:** API interna `emailService.send/sendWelcome`, fila BullMQ/Valkey (ioredis), worker in-process, `MailProvider`+Resend+Noop, template `welcome` react-email com CTA (`FRONTEND_URL`), boas-vindas no registro (`CredentialsService.register`), docs no `BACKEND.md`.
**Pendências deixadas ao usuário:** (1) push + PR ainda NÃO feitos (a pedido); (2) envs de produção `EMAIL_API_KEY`/`EMAIL_FROM_ADDRESS`/`EMAIL_FROM_NAME` a comunicar ao dev quando for pra prod — sem elas o `NoopProvider` só loga.
**Próximo passo:** quando o usuário pedir, abrir PR da PAV-76.
