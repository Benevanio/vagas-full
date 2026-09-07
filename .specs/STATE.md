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

**Feature concluída:** `job-detail-reorganizacao` (PAV-92) — ✅ Done.
**Estado:** implementada e commitada na branch `jovinull/pav-92-frontend` (4 commits: reorg de tiles, dedup do payload, feedback de notas, docs). Validação standalone PASS (8/8 ACs, gate 352/352 frontend, sensor de mutação raciocinado sem sobreviventes). Relatório em `.specs/features/job-detail-reorganizacao/validation.md`.
**Entregue:** `JobDetailModal` reorganizado — local/modalidade/nível/fonte/salário/match em tiles rotulados; bloco "Payload da vaga" renomeado para "Detalhes adicionais" e sem duplicar dado já mostrado; texto indicando que notas salvam ao fechar. Sem migração de modal pra página (critério do próprio card já resolvia isso) e sem novo contrato de backend.
**Pendências deixadas ao usuário:** push + PR ainda NÃO feitos (aguardando confirmação do usuário).
**Próximo passo:** quando o usuário pedir, abrir PR da PAV-92.

**Feature anterior concluída:** `email-module` (PAV-76) — ✅ Done. 11/11 tasks, branch `feature/pav-76-modulo-email`, Verifier PASS (11/11 ACs, gate 529/0, sensor 5/5). Entregue: `emailService.send/sendWelcome`, fila BullMQ/Valkey, `MailProvider`+Resend+Noop, template `welcome`, boas-vindas no registro. Envs de produção `EMAIL_API_KEY`/`EMAIL_FROM_ADDRESS`/`EMAIL_FROM_NAME` a comunicar ao dev quando for pra prod.
