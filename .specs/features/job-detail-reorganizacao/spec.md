# Reorganização do detalhe da candidatura — Specification

_Linear: PAV-92 · "Frontend" (finalizar experiência do detalhe pós PAV-19/90)_

## Problem Statement

O `JobDetailModal` já tem tudo que a PAV-19/90 entregou (status, notas, timeline), mas empilha tudo numa sequência vertical única e ainda expõe um bloco "Payload da vaga" que duplica local/salário/empresa/modalidade já mostrados em cima, com labels técnicas (`ID`, `URL`). O usuário não identifica rápido as informações principais e vê dado repetido/cru.

## Goals

- [ ] Informações principais (empresa, local, modalidade, nível, fonte, salário, match, status, link) reconhecíveis em tiles, sem depender do payload bruto.
- [ ] Payload bruto sem duplicar o que já tem representação amigável.
- [ ] Zero regressão em status, notas, timeline e link — mesmo comportamento, layout melhor.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Migrar de modal para página dedicada | Modal já trata altura/scroll/responsividade (`max-h-[90vh]`, scroll interno, `max-w-3xl`); card só pede migrar se houver ganho claro — não há. |
| Anexos/links extras | Card explicitamente proíbe neste ticket. |
| Evento de nota na timeline | Sem contrato de backend definido; card proíbe. |
| Novo contrato de backend | Nada aqui muda API/schema. |

---

## Assumptions & Open Questions

| Assumption / decisão | Default escolhido | Rationale | Confirmado? |
| --- | --- | --- | --- |
| Onde fica o detalhe | Modal (não migra pra página) | Ver "Out of Scope" — critério do próprio card já resolve. | y (evidência de código) |
| Campos "principais" | empresa, local, modalidade (`job.type`), nível, fonte, salário, match, status, link | São exatamente os campos que hoje só aparecem via badge pequena ou via payload bruto. | n |
| O que sobra no payload | Só campos sem representação amigável hoje (ex. `postedAt`, `id`, `url` só se não coincidir com o link já mostrado) | Evita duplicar sem esconder dado real. | n |
| Feedback de salvar notas | Texto de estado ("Notas salvas ao fechar" / "Salvando notas...") — sem mudar o timing de persistência (ainda só ao fechar) | Card autoriza melhorar "se necessário", sem novo contrato; menor mudança de comportamento. | n |

**Open questions:** nenhuma — resolvidas acima.

---

## User Stories

### P1: Reconhecer as informações principais sem ler payload cru ⭐ MVP

**User Story**: Como candidato, quero ver empresa, local, modalidade, nível, fonte, salário, match e status num layout claro ao abrir o detalhe, sem precisar ler um bloco de dados técnicos.

**Acceptance Criteria**:

1. WHEN o modal abre THEN local, modalidade, nível, fonte, salário (ou "Não informado") e match score SHALL aparecer em tiles rotulados com label visível (ex. `<span>Modalidade</span>`) — não apenas como chip sem rótulo.
2. WHEN o modal abre THEN empresa (já é o subtítulo do modal) e status atual (já tem indicador colorido + controle de troca rotulado "Status") SHALL continuar visíveis sem precisar de um novo tile — não há duplicação a resolver aí.
3. WHEN o link principal da vaga é exibido THEN ele SHALL continuar abrindo `job.jobLink` em nova aba (comportamento inalterado).

**Independent Test**: abrir o modal de uma vaga com todos os campos preenchidos e de uma vaga com campos ausentes (salário nulo); conferir que os tiles aparecem e "Não informado" cobre ausência, sem quebrar layout.

---

### P2: Payload bruto sem duplicar dado já mostrado

**User Story**: Como candidato, quero que o bloco de dados adicionais mostre só o que não apareceu em nenhum outro lugar do detalhe, pra não ver a mesma informação duas vezes.

**Acceptance Criteria**:

1. WHEN um campo do `rawPayload` corresponde a um campo já renderizado nos tiles principais (local, salário, empresa, modalidade) THEN ele SHALL ser omitido do bloco de dados adicionais.
2. WHEN sobram campos sem representação amigável THEN eles SHALL continuar visíveis, num bloco secundário rotulado, preservando o comportamento de link externo para valores que são URL.
3. WHEN não sobra nenhum campo após o filtro THEN o bloco secundário SHALL não renderizar (nem título vazio).

**Independent Test**: vaga com `rawPayload` contendo `location`, `salary`, `company`, `modality` (duplicados) + `postedAt` (extra) → só `postedAt` aparece no bloco secundário.

---

### P3: Feedback de que as notas são salvas

**User Story**: Como candidato, quero saber que minha nota foi salva ao fechar o modal, já que hoje não há nenhuma indicação disso.

**Acceptance Criteria**:

1. WHEN o campo de notas é exibido THEN um texto auxiliar SHALL indicar que a nota é salva ao fechar o modal.

---

## Edge Cases

- WHEN `job.rawPayload` é `null`/`undefined`/`{}` THEN nenhum bloco de dados adicionais SHALL renderizar (como hoje).
- WHEN a vaga não está `isTracked` THEN a seção de timeline SHALL continuar oculta (comportamento inalterado).
- WHEN a timeline tem eventos, está carregando, vazia ou em erro THEN cada estado SHALL renderizar exatamente como hoje (sem regressão) — não é escopo de mudança visual profunda, só preservação.

---

## Requirement Traceability

| ID | Story | Status |
| --- | --- | --- |
| JDM-01 | P1 — tiles de info principal | Pending |
| JDM-02 | P1 — modalidade ganha tile próprio | Pending |
| JDM-03 | P1 — link inalterado | Pending |
| JDM-04 | P2 — payload sem duplicar | Pending |
| JDM-05 | P2 — bloco secundário só com sobra | Pending |
| JDM-06 | P2 — some quando vazio | Pending |
| JDM-07 | P3 — texto de "salva ao fechar" | Pending |
| JDM-08 | Regressão — status/timeline/link intactos | Pending |

**Coverage:** 8 total, mapeado no plano de execução abaixo.

## Success Criteria

- [ ] Suíte do frontend verde, com testes novos cobrindo JDM-01..08.
- [ ] Nenhuma mudança de contrato de backend.
- [ ] Nenhuma regressão nos testes existentes de `JobDetailModal`/timeline.
