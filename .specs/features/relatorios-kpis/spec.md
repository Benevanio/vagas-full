# Relatórios/KPIs do candidato — Specification

_Linear: PAV-30 · EPIC 6 — Exportação e Relatórios_

## Problem Statement

O candidato acompanha vagas salvas e move status (`saved → applied → interviewing → rejected/accepted`), mas não tem nenhuma visão agregada da própria evolução: quantas candidaturas fez por semana, que fração chega a entrevista, quanto tempo cada etapa costuma levar. Hoje o dashboard mostra contadores calculados no browser a partir da lista carregada — sem período, sem série temporal, sem endpoint dedicado. Falta uma tela de relatórios que responda "como está indo minha busca?".

## Goals

- [ ] Endpoint agregado por usuário `GET /reports/kpis` que devolve, para um período: candidaturas por semana (série), taxa de entrevista (%), tempo médio por etapa (dias) — números coerentes com os dados reais de `saved_jobs` / `application_events`.
- [ ] Nova seção `/relatorios` no dashboard, com gráficos (Recharts) e seletor de período, que consome o endpoint e re-renderiza ao trocar o período.
- [ ] Estados de carregamento, vazio e erro tratados na tela.
- [ ] Cobertura de testes: núcleo de agregação (funções puras) por AC; rota (integração) com sucesso/validação/auth; componentes de tela (render, troca de período, empty/error).

## Out of Scope

| Item | Motivo |
| --- | --- |
| Exportação (CSV/PDF) dos relatórios | Outro card do EPIC 6; aqui só visualização. |
| KPIs de recrutador / visão admin | `admin/dashboard` já existe e tem outra audiência; este é o portal do candidato. |
| Novos tipos de `application_event` (ex.: evento de nota, evento de candidatura sem mudança de status) | Não há contrato de backend para isso; PAV-92 explicitamente barra. Usamos só `status_changed`. |
| Persistência/cache dos agregados (tabela materializada, job) | Volume por usuário é baixo (dezenas a centenas de linhas); cálculo on-read é suficiente. Reavaliar se virar gargalo. |
| Comparação entre períodos / metas / projeções | Nice-to-have não pedido; mantém o card "direto". |
| Filtro por fonte, palavra-chave ou empresa dentro do relatório | Card pede filtro **por período**. Outras dimensões ficam para follow-up. |
| Timezone configurável pelo usuário | Buckets semanais em UTC (ver Assumptions). |

---

## Assumptions & Open Questions

| Assumption / decisão | Default escolhido | Racional | Confirmado? |
| --- | --- | --- | --- |
| Definição de "candidatura submetida" | Vaga que **saiu do status `saved`** — i.e. existe `application_event` com `from_status='saved'`, OU (dado legado sem evento) `saved_jobs.status != 'saved'`. Momento da candidatura = `created_at` do evento `from_status='saved'`; no fallback legado = `saved_jobs.applied_at ?? saved_jobs.created_at`. | `applied_at` não é preenchido automaticamente no `PATCH`, então é não-confiável sozinho; a trilha `application_events` é a fonte de verdade das transições. Cobrir dado legado evita zerar relatório de quem já usava o produto. | y (via AskUserQuestion — endpoint agregado + eventos) |
| Bucket semanal | ISO week, segunda 00:00:00 UTC a domingo 23:59:59.999 UTC. Rótulo `YYYY-Www`. | Consistente com `created_at` (timestamp sem tz, tratado como UTC no resto do backend). Semana ISO é padrão previsível. | n |
| "Taxa de entrevista" | `(nº de vagas que atingiram `interviewing` em qualquer momento dentro do período) / (nº de candidaturas submetidas dentro do período) × 100`, arredondado a inteiro. Denominador 0 ⇒ taxa `0` + flag `insufficientData: true`. | Fração das candidaturas do período que evoluíram para entrevista. Denominador é o conjunto de candidaturas do período (não o total histórico) para casar com o filtro. | n |
| "Tempo médio por etapa" | Média, em dias (1 casa decimal), da duração de permanência em cada `status`, medida por transições **consecutivas** em `application_events` cujo evento de saída caiu no período. Etapas reportadas: `saved→applied`, `applied→interviewing`, `interviewing→rejected/accepted` (agrupado como "interviewing→desfecho"). Etapa sem nenhuma transição concluída ⇒ `null`. | Só transições concluídas têm duração definida; vaga parada numa etapa não contribui. Agrupar os dois desfechos evita duas barras quase sempre vazias. | n |
| Vaga que pula etapas (ex.: `saved→interviewing` direto) | Conta como candidatura (saiu de `saved`) e como "atingiu interviewing". A duração `saved→interviewing` entra em… nada (não é uma das 3 etapas nomeadas) — ignorada no tempo por etapa. | Transições não-lineares são raras e distorceriam médias; contam para os KPIs de contagem, não para o de duração. | n |
| Parâmetros de período | Query `from` e `to`, ambos `YYYY-MM-DD` opcionais. Ausentes ⇒ últimos 90 dias até hoje (UTC). `from > to` ⇒ 400. Sem limite máximo de janela. | 90 dias é janela útil default para busca ativa de emprego. | n (default 90d veio do AskUserQuestion) |
| Presets de período na UI | `30 dias`, `90 dias` (default), `12 meses`, `Tudo`. "Tudo" = sem `from` (backend usa a data da 1ª atividade do usuário como início efetivo, ou 90d se não houver). | Cobre os recortes comuns sem date-picker livre nesta entrega. | n |
| Comportamento sem nenhum dado | 200 com `weeklyApplications: []`, `interviewRate: { value: 0, insufficientData: true }`, `stageDurations` com todas as etapas `null`. UI mostra empty state por card. | Ausência de dados não é erro. | n |
| Fuso do rótulo de semana na UI | Exibe o rótulo `YYYY-Www` calculado no backend; UI não recomputa datas. | Evita divergência de bucket entre server e client. | n |
| Biblioteca de gráficos | `recharts` (versão estável corrente), lazy-carregada na rota. | Escolha do usuário (AskUserQuestion). Tree-shakeable, SVG, tema-aware via props. | y |

**Open questions:** nenhuma — todos os itens acima resolvidos ou registrados como assumption. Os `n` em "Confirmado?" são defaults que serão validados na revisão da spec e/ou do design; nenhum bloqueia o início.

---

## User Stories

### P1: Ver meus KPIs de candidatura num período ⭐ MVP

**User Story**: Como candidato, quero abrir uma tela de relatórios e ver candidaturas por semana, taxa de entrevista e tempo por etapa de um período, para entender se minha busca está progredindo.

**Why P1**: É o card inteiro. Sem isto não há entrega.

**Acceptance Criteria**:

1. WHEN o candidato autenticado faz `GET /reports/kpis` sem query THEN o sistema SHALL responder 200 com `{ range: { from, to }, weeklyApplications: [...], interviewRate: {...}, stageDurations: {...} }` calculado sobre os últimos 90 dias (UTC).
2. WHEN existem candidaturas submetidas no período THEN `weeklyApplications` SHALL conter um item por semana ISO **com pelo menos uma candidatura**, cada item `{ week: "YYYY-Www", weekStart: "YYYY-MM-DD", count: N }`, ordenado crescente por `weekStart`, e a soma dos `count` SHALL igualar o total de candidaturas submetidas no período.
3. WHEN `X` vagas foram submetidas no período e `Y` delas atingiram `interviewing` em qualquer momento THEN `interviewRate.value` SHALL ser `round(Y / X * 100)` e `interviewRate.insufficientData` SHALL ser `false`.
4. WHEN nenhuma vaga foi submetida no período THEN `interviewRate` SHALL ser `{ value: 0, insufficientData: true }` e `weeklyApplications` SHALL ser `[]`.
5. WHEN há transições `status_changed` concluídas no período THEN `stageDurations` SHALL ter as chaves `savedToApplied`, `appliedToInterviewing`, `interviewingToOutcome`, cada uma `number` (dias, 1 casa decimal, média das durações) ou `null` se não houver transição concluída daquela etapa.
6. WHEN um usuário faz a chamada THEN o resultado SHALL considerar **apenas** vagas/eventos cujo `user_id` é o dele (isolamento por usuário).
7. WHEN a requisição não tem sessão válida THEN o sistema SHALL responder 401 e não executar agregação.
8. WHEN `from` ou `to` não são `YYYY-MM-DD`, ou `from > to` THEN o sistema SHALL responder 400 com erro de validação e não executar agregação.
9. WHEN `from`/`to` válidos são passados THEN a agregação SHALL usar `[from 00:00:00 UTC, to 23:59:59.999 UTC]` como janela e ecoar `range` normalizado na resposta.

**Independent Test**: `curl` autenticado em `/reports/kpis` com dados semeados (vagas em vários status + eventos) → conferir série, taxa e durações contra cálculo manual; repetir com `?from=&to=`, com janela vazia, sem auth, com `from>to`.

---

### P2: Tela `/relatorios` com gráficos e troca de período

**User Story**: Como candidato, quero uma seção "Relatórios" na navegação com gráficos e um seletor de período, para explorar meus números visualmente.

**Why P2**: Sem P1 não há dados; a tela é o consumo. Testável isolada com o endpoint mockado.

**Acceptance Criteria**:

1. WHEN o candidato acessa `/relatorios` THEN a UI SHALL renderizar item "Relatórios" ativo na sidebar e na tab bar mobile, e a rota SHALL exigir autenticação (mesmo guard das outras seções do dashboard).
2. WHEN a tela carrega THEN ela SHALL chamar o endpoint com o período default (90 dias) e exibir um estado de carregamento até a resposta.
3. WHEN a resposta chega com dados THEN a UI SHALL renderizar: um gráfico de barras de candidaturas por semana, um indicador de taxa de entrevista (donut/gauge com o `%`), e um gráfico de barras horizontais de tempo médio por etapa.
4. WHEN o candidato troca o preset de período (30d / 90d / 12m / Tudo) THEN a UI SHALL refazer a chamada com o novo `from`/`to` e re-renderizar os três gráficos com o resultado.
5. WHEN o endpoint responde vazio (`weeklyApplications: []` e `insufficientData`) THEN cada card SHALL mostrar um empty state ("sem dados no período") em vez de um gráfico vazio.
6. WHEN a chamada falha THEN a tela SHALL mostrar um estado de erro com ação de "tentar novamente", sem quebrar o resto do dashboard.
7. WHEN `stageDurations` tem etapas `null` THEN a barra correspondente SHALL aparecer como "—" / sem barra, não como `0`.

**Independent Test**: montar `ReportsTab` com respostas fixas (com dados / vazia / erro) e verificar render dos três gráficos, empty states, e que trocar preset dispara nova fetch com os parâmetros certos.

---

### P3: Sumário numérico no topo da tela

**User Story**: Como candidato, quero ver de relance os números-chave (total de candidaturas no período, taxa de entrevista, semana mais ativa) antes dos gráficos.

**Why P3**: Melhora leitura mas os gráficos já entregam a informação; pode ficar de fora sem descaracterizar o card.

**Acceptance Criteria**:

1. WHEN a tela tem dados THEN o topo SHALL mostrar 3 tiles: "Candidaturas no período" (= soma da série), "Taxa de entrevista" (= `interviewRate.value`%), "Semana mais ativa" (= `week` de maior `count`, ou "—" se série vazia).

---

## Edge Cases

- WHEN o usuário nunca salvou nenhuma vaga THEN endpoint 200 com estruturas zeradas e UI em empty state (AC P1-4, P2-5).
- WHEN todas as vagas do usuário ainda estão em `saved` THEN `weeklyApplications: []`, `interviewRate.insufficientData: true`, `stageDurations` tudo `null`.
- WHEN uma vaga tem eventos mas nenhuma transição saiu de `saved` (impossível pelo modelo atual, mas defensivo) THEN não conta como candidatura.
- WHEN há eventos fora do período mas a vaga foi submetida dentro THEN só as transições com evento de saída **dentro** do período entram no tempo por etapa; a contagem de candidatura usa o evento `from_status='saved'`.
- WHEN `to` é uma data futura THEN aceita (janela só não terá dados além de hoje).
- WHEN o período é um único dia (`from == to`) THEN válido; janela de 24h.
- WHEN duas transições do mesmo par de status existem para a mesma vaga (ida e volta de status) THEN cada segmento consecutivo conta como uma amostra de duração daquela etapa.
- WHEN o payload de `application_events.metadata` é nulo/ausente THEN irrelevante — não é usado nos KPIs.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| KPI-01 | P1 — endpoint default 90d, shape da resposta | Design | Pending |
| KPI-02 | P1 — série semanal (buckets, ordenação, soma consistente) | Design | Pending |
| KPI-03 | P1 — taxa de entrevista (fórmula) | Design | Pending |
| KPI-04 | P1 — estado sem candidaturas (insufficientData, série vazia) | Design | Pending |
| KPI-05 | P1 — tempo por etapa (3 chaves, média em dias, null) | Design | Pending |
| KPI-06 | P1 — isolamento por `user_id` | Design | Pending |
| KPI-07 | P1 — 401 sem sessão, sem agregação | Design | Pending |
| KPI-08 | P1 — 400 em `from`/`to` inválidos ou `from > to` | Design | Pending |
| KPI-09 | P1 — janela `[from 00:00Z, to 23:59:59.999Z]` e `range` ecoado | Design | Pending |
| KPI-10 | P2 — rota `/relatorios` + nav (sidebar/tabbar) + auth guard | Design | Pending |
| KPI-11 | P2 — fetch no load com período default + loading state | Design | Pending |
| KPI-12 | P2 — render dos 3 gráficos com dados | Design | Pending |
| KPI-13 | P2 — troca de preset refaz fetch e re-renderiza | Design | Pending |
| KPI-14 | P2 — empty state por card | Design | Pending |
| KPI-15 | P2 — error state com "tentar novamente" | Design | Pending |
| KPI-16 | P2 — etapa `null` renderiza "—", não `0` | Design | Pending |
| KPI-17 | P3 — 3 tiles de sumário no topo | Design | Pending |

**ID format:** `KPI-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 17 total, 0 mapeados a tasks, 17 não mapeados ⚠️ (Tasks pendente)

---

## Success Criteria

- [ ] `GET /reports/kpis` retorna números que batem com verificação manual sobre dados semeados, em ≤ 3 cenários (com dados, janela parcial, vazio).
- [ ] KPIs na tela atualizam ao trocar o período (AC P2-4) sem recarregar a página.
- [ ] Suíte do backend e do frontend verdes; sem novos erros de TS no escopo.
- [ ] Núcleo de agregação coberto por testes unitários que assertam os valores das ACs (não a implementação).
- [ ] `BACKEND.md` documenta o endpoint; nada de segredo/credencial no diff.
