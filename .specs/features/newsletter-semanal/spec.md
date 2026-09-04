# Newsletter Semanal Specification

**Linear:** [PAV-109](https://linear.app/candidateappbr/issue/PAV-109/newsletter-semanal-com-vagas-que-combinam-com-o-perfil-do-usuario) — In Progress, assignee Felipe Jovino
**Branch:** `jovinull/pav-109-newsletter-semanal-com-vagas-que-combinam-com-o-perfil-do`

## Problem Statement

Usuários com conta cadastrada não têm hoje um canal proativo que os traga de volta ao produto. Depois do cadastro/login inicial, nada convida o usuário a voltar, mesmo quando surgem vagas novas alinhadas ao perfil dele. Uma newsletter semanal automática resolve isso, aumentando engajamento e recorrência sem exigir ação do usuário.

## Goals

- [ ] Usuário opt-in (não desabilitou) recebe, toda segunda 08:00 (America/Sao_Paulo), um e-mail com vagas recentes que combinam com o perfil dele.
- [ ] Usuário consegue desabilitar o recebimento a qualquer momento (perfil ou link no e-mail) e para de receber a partir da próxima execução.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Curadoria manual editorial de notícias | Decisão do usuário: fonte é RSS automatizado, não lista mantida à mão |
| Notificação por outros canais (push, SMS, WhatsApp) | Card pede apenas e-mail |
| Personalização de horário/dia por usuário | Card pede um job semanal único para todos; por-usuário fica fora de escopo |
| Digest imediato de "alto match" (`matchScore ≥ 85`) | Já existe via `NotificationsService.createHighMatchIfMissing`; não é este card |
| Analytics/tracking de abertura e clique do e-mail | Não pedido nos critérios de aceite |
| Novo mecanismo de e-mail transacional | Reaproveita o módulo `src/modules/email` (AD-001 a AD-004) — nenhum envio paralelo |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Fonte de notícias tech | Feed(s) RSS curados para audiência dev/tech | Escolha do usuário na clarificação | y |
| Agendamento do job | Toda segunda-feira, 08:00 America/Sao_Paulo, via BullMQ repeatable job | Escolha do usuário; consistente com fila já usada pelo módulo de e-mail (AD-002) | y |
| Janela do resumo de candidaturas | Total acumulado de `savedJobs` com status `applied`/`interviewing`/`accepted`, sem filtro de data | Escolha do usuário | y |
| Fallback sem vaga com match | Usuário é pulado nessa execução (nenhum e-mail enviado) — nunca envia e-mail vazio na seção de vagas | Escolha do usuário | y |
| Falha ao buscar RSS na semana | E-mail é enviado mesmo assim, omitindo a seção de notícias (falha de dependência externa nunca bloqueia o fluxo principal, mesmo padrão do resto do sistema — ver EMAIL-05/10 em `email.service.ts`) | Nenhuma feature deve travar por indisponibilidade de terceiro; segue o padrão já estabelecido no módulo de e-mail | n — assumido, revisitável no Design |
| Seleção de vagas com match | Vagas adicionadas ao índice nos últimos 7 dias, com `matchScore > 0` calculado via `jobProfileMatchService`/`jobMatch.service`, ordenadas por `matchScore` desc, até 5 vagas | Reaproveita o motor de matching já existente (usado hoje para notificação de alto match); teto de 5 espelha o teto de notícias do card | n — assumido, revisitável no Design |
| Feeds RSS concretos (URLs) | A definir no Design — não são uma decisão de produto, são configuração | Card só pede "notícias do mercado tech", sem citar fonte específica | n — decisão adiada para Design |
| Mecanismo de unsubscribe sem login | Link com token assinado (HMAC, contém `userId`) que desativa `userPreferences.emailNotifications` via endpoint público, sem exigir sessão | Usuário abre o e-mail deslogado; exigir login pra descadastrar quebraria o critério de aceite | n — assumido, decisão técnica revisitável no Design |
| Idempotência do job semanal | Uma execução por usuário por semana ISO; se o job rodar de novo na mesma semana (retry/crash), usuários já processados não recebem duplicata | Job roda sobre fila/worker que pode reiniciar; sem controle de idempotência haveria risco de e-mail duplicado | n — assumido, decisão técnica revisitável no Design |

**Open questions:** nenhuma sem resposta — tudo acima foi resolvido com o usuário ou logado como assumption revisitável no Design (que é o próximo passo, dado o escopo Large/Complex desta feature).

---

## User Stories

### P1: Vagas com match na newsletter ⭐ MVP

**User Story**: Como candidato com conta ativa, quero receber semanalmente as vagas mais recentes que combinam com meu perfil, para não precisar voltar ao produto manualmente pra descobrir novidades.

**Why P1**: É o núcleo do valor do card — sem isso não há newsletter, só um digest genérico.

**Acceptance Criteria**:

1. WHEN o job semanal roda THEN o sistema SHALL considerar apenas usuários com `userPreferences.emailNotifications = true` no momento da execução.
2. WHEN um usuário elegível tem 1+ vaga adicionada nos últimos 7 dias com `matchScore > 0` para o perfil dele THEN o sistema SHALL incluir no e-mail até 5 dessas vagas, ordenadas por `matchScore` desc.
3. WHEN um usuário elegível não tem nenhuma vaga com match nos últimos 7 dias THEN o sistema SHALL pular o envio da newsletter para esse usuário nesta execução (nenhum e-mail é enviado).
4. WHEN o job semanal executa THEN o sistema SHALL enfileirar o envio através do módulo `src/modules/email` existente (nunca chamar o provedor de e-mail diretamente).

**Independent Test**: Rodar o job manualmente para um usuário com `emailNotifications=true` e vaga recente com match; verificar um e-mail enfileirado com essa vaga. Rodar para um usuário sem match; verificar que nada foi enfileirado.

---

### P1: Resumo de candidaturas ⭐ MVP

**User Story**: Como candidato, quero ver no e-mail um resumo das vagas que já apliquei, para acompanhar meu progresso sem abrir o dashboard.

**Why P1**: Critério de aceite explícito do card; é o segundo bloco de conteúdo obrigatório do e-mail.

**Acceptance Criteria**:

1. WHEN o e-mail é montado para um usuário THEN o sistema SHALL incluir a contagem total acumulada de `savedJobs` do usuário com status `applied`, `interviewing` ou `accepted`.
2. WHEN o usuário não tem nenhuma candidatura nesses status THEN o sistema SHALL exibir um estado vazio apropriado nessa seção (não omitir a seção, não quebrar o template).

**Independent Test**: Usuário com 3 vagas `applied` e 1 `interviewing` vê "4" no resumo; usuário sem nenhuma candidatura vê o estado vazio, sem erro de renderização.

---

### P1: Notícias do mercado tech ⭐ MVP

**User Story**: Como candidato, quero ver até 5 notícias relevantes do mercado tech no e-mail, para me manter informado sem sair da newsletter.

**Why P1**: Critério de aceite explícito do card.

**Acceptance Criteria**:

1. WHEN o job monta o e-mail THEN o sistema SHALL buscar itens de notícia de feed(s) RSS curados e incluir no máximo 5 no e-mail, ordenados por mais recentes.
2. WHEN a busca RSS falha (feed indisponível, timeout, erro de parse) THEN o sistema SHALL enviar o e-mail mesmo assim, omitindo a seção de notícias — a falha nunca bloqueia o envio da newsletter.
3. WHEN não há itens de notícia novos disponíveis THEN o sistema SHALL omitir a seção de notícias sem quebrar o template.

**Independent Test**: Mockar o feed RSS retornando 8 itens; verificar que só 5 aparecem no e-mail. Mockar o feed indisponível; verificar que o e-mail ainda é enviado, sem a seção de notícias.

---

### P1: Opt-out via perfil ⭐ MVP

**User Story**: Como candidato, quero poder desabilitar a newsletter no meu perfil, para parar de receber quando não tiver mais interesse.

**Why P1**: Critério de aceite explícito; **infraestrutura já existe** — `userPreferences.emailNotifications` já é lido/gravado hoje via `PreferencesForm.tsx` (frontend) e `user.schemas.ts` (backend). Este card só precisa consumir esse campo no job, não recriar o toggle.

**Acceptance Criteria**:

1. WHEN o usuário desmarca "Notificações por e-mail" no perfil THEN o sistema SHALL, a partir da próxima execução do job semanal, não incluir esse usuário no envio.
2. WHEN o usuário reabilita a opção THEN o sistema SHALL voltar a incluí-lo na próxima execução, se elegível.

**Independent Test**: Verificado por reuso — a leitura de `emailNotifications=false` no job (P1 "Vagas com match", AC1) já cobre este comportamento; nenhum teste novo de UI é necessário pois o toggle já existe e já é testado.

---

### P1: Unsubscribe pelo corpo do e-mail ⭐ MVP

**User Story**: Como candidato que recebeu a newsletter, quero um link de descadastro direto no e-mail, para não precisar logar no produto pra parar de receber.

**Why P1**: Critério de aceite explícito do card.

**Acceptance Criteria**:

1. WHEN a newsletter é montada para um usuário THEN o sistema SHALL incluir no corpo um link de unsubscribe contendo um token assinado específico daquele usuário.
2. WHEN o link de unsubscribe é acessado com um token válido THEN o sistema SHALL setar `userPreferences.emailNotifications = false` para o usuário correspondente, sem exigir sessão autenticada.
3. WHEN o link de unsubscribe é acessado com um token inválido, expirado ou adulterado THEN o sistema SHALL rejeitar a operação sem revelar qual usuário o token pertencia.
4. WHEN o unsubscribe é confirmado THEN o sistema SHALL mostrar uma página de confirmação simples (sem exigir login).

**Independent Test**: Gerar token válido para um usuário, acessar o link, confirmar `emailNotifications=false` no banco. Acessar com token adulterado; confirmar que nada muda e nenhum erro vaza qual usuário seria afetado.

---

## Edge Cases

- WHEN o job semanal roda duas vezes na mesma semana ISO (reprocessamento, crash + retry) THEN o sistema SHALL evitar enviar a newsletter duplicada ao mesmo usuário nessa semana.
- WHEN um usuário é excluído (fluxo LGPD, PAV-41) entre o cálculo do envio e o processamento da fila THEN o sistema SHALL falhar graciosamente esse item da fila sem derrubar o restante do job (mesmo padrão de isolamento de falha já usado no módulo de e-mail).
- WHEN o e-mail do usuário está ausente/inválido no momento do envio THEN o sistema SHALL pular esse usuário e logar um aviso, sem interromper os demais.
- WHEN não há nenhum usuário elegível na execução (todos opt-out ou sem match) THEN o sistema SHALL concluir o job normalmente, sem erro, logando zero envios.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| NEWSL-01 | P1: Vagas com match | Design | Pending |
| NEWSL-02 | P1: Vagas com match | Design | Pending |
| NEWSL-03 | P1: Vagas com match | Design | Pending |
| NEWSL-04 | P1: Vagas com match | Design | Pending |
| NEWSL-05 | P1: Resumo de candidaturas | Design | Pending |
| NEWSL-06 | P1: Resumo de candidaturas | Design | Pending |
| NEWSL-07 | P1: Notícias tech | Design | Pending |
| NEWSL-08 | P1: Notícias tech | Design | Pending |
| NEWSL-09 | P1: Notícias tech | Design | Pending |
| NEWSL-10 | P1: Opt-out via perfil | Design | Pending |
| NEWSL-11 | P1: Opt-out via perfil | Design | Pending |
| NEWSL-12 | P1: Unsubscribe no e-mail | Design | Pending |
| NEWSL-13 | P1: Unsubscribe no e-mail | Design | Pending |
| NEWSL-14 | P1: Unsubscribe no e-mail | Design | Pending |
| NEWSL-15 | P1: Unsubscribe no e-mail | Design | Pending |

**Coverage:** 15 total, 0 mapped to tasks, 15 unmapped ⚠️ (esperado — Design/Tasks ainda não rodaram)

---

## Success Criteria

- [ ] Usuário opt-in com match recebe e-mail toda segunda 08:00 (America/Sao_Paulo) com até 5 vagas, resumo de candidaturas e até 5 notícias.
- [ ] Usuário opt-out ou sem match nenhum não recebe e-mail naquela semana.
- [ ] Unsubscribe funciona sem login e é imediato (efetivo a partir da próxima execução).
- [ ] Reexecutar o job na mesma semana não duplica envios.
- [ ] Falha de RSS não impede o envio do restante do conteúdo.
