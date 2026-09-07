# Validation: job-detail-reorganizacao (PAV-92)

**Modo:** standalone fallback (sem sub-agent — escopo pequeno, single-file, feito inline pelo mesmo agente; fresh-eyes reread do diff e da spec antes de escrever este relatório).

**Diff range:** `42522ae..HEAD` (branch `jovinull/pav-92-frontend`, commits `99d6a1f`, `b5956a8`, `b3dd96f`, `d7068c3`).

## Spec-anchored coverage check

| AC | Evidência (`file:line`) | Asserção | Resultado esperado (spec) | Coberto? |
| --- | --- | --- | --- | --- |
| JDM-01 | `tests/unit/new_dashboard/jobDetailModal.test.tsx:44-55` | `getByText("Local"/"Modalidade"/"Nível"/"Fonte"/"Salário"/"Match")` + valores | tiles rotulados para local/modalidade/nível/fonte/salário/match | ✅ Sim |
| JDM-02 | `jobDetailModal.test.tsx:68-71` | `getByText("Globex")`, `getAllByText("Em entrevista")`, `getByLabelText(/^status$/i)).toHaveValue(...)` | empresa no subtítulo, status com indicador+controle, sem tile novo | ✅ Sim |
| JDM-03 | `jobDetailModal.test.tsx:179-181` | `link).toHaveAttribute("href", ...)/("target","_blank")` | link "Abrir vaga" inalterado | ✅ Sim |
| JDM-04 | `jobDetailModal.test.tsx:107-131` | `getAllByText("Local")).toHaveLength(1)` / `getAllByText("Modalidade")).toHaveLength(1)` | campo do payload que já tem tile não duplica | ✅ Sim |
| JDM-05 | `jobDetailModal.test.tsx:125-127` | `getByText("Publicado em")`/`getByText("2026-01-10")` | campo sem representação amigável continua visível num bloco próprio | ✅ Sim |
| JDM-06 | `jobDetailModal.test.tsx:134-152`, `154-165` | `queryByText("Detalhes adicionais")).not.toBeInTheDocument()` (payload só com dupes; sem rawPayload) | bloco não renderiza quando nada sobra | ✅ Sim |
| JDM-07 | `jobDetailModal.test.tsx:90-103` | `getByText(/salvas automaticamente ao fechar/i)` | texto indicando salvamento ao fechar | ✅ Sim |
| JDM-08 (regressão) | `tests/unit/new_dashboard/jobs.test.tsx:392-409` (não modificado no comportamento, só a asserção do heading renomeado — ver nota), `tests/unit/new_dashboard/page.test.tsx:445-457` (`atualiza o status...`, inalterado) | fluxo completo status→notas→close ainda dispara `onStatusChange`/`onNotesChange`/`onClose`; timeline não tocada, suíte cheia 352/352 verde | zero regressão em status, notas, timeline, link | ✅ Sim |

**Spec-precision gaps:** nenhum.

**Nota sobre JDM-08:** `jobs.test.tsx:392` tinha `expect(screen.getByText(/payload da vaga/i))` — o heading foi renomeado pra "Detalhes adicionais" e o payload de fixture (`baseJob.rawPayload = {description, url}`) agora é 100% redundante (`url === jobLink`), então o bloco não renderiza mais para esse fixture. A asserção foi invertida para `queryByText(...).not.toBeInTheDocument()`, o que é o comportamento correto pós-mudança (não uma alteração cosmética por conveniência — é o efeito direto e esperado da regra JDM-04 aplicada a esse fixture específico).

## Gate

- `npm run test --workspace=frontend`: **352/352 passed** (53 arquivos), incluindo os 8 novos testes de `jobDetailModal.test.tsx` e a suíte completa de `jobs.test.tsx`/`page.test.tsx` sem regressão.
- `npm run build --workspace=frontend`: build OK (mesmo aviso pré-existente de chunk >500kB, não relacionado).
- `npm run lint --workspace=frontend`: 0 erros (mesmos 3 warnings pré-existentes de `coverage/*` + 1 de `theme.toast.test.tsx`, nenhum novo).

## Discrimination sensor (raciocínio, sem execução de mutação real — escopo pequeno)

| Mutação hipotética | Teste que mata | Raciocínio |
| --- | --- | --- |
| Reverter `redundantPayloadKeys` para excluir só `"description"` | `jobDetailModal.test.tsx:130-131` (`getAllByText("Local")).toHaveLength(1)`) | Voltaria a duplicar "Local"/"Modalidade" → length vira 2 → falha |
| Remover o tile de Modalidade | `jobDetailModal.test.tsx:46-47` | `getByText("Modalidade")` deixa de existir → falha |
| Remover o texto de salvamento das notas | `jobDetailModal.test.tsx:101` | `getByText(/salvas automaticamente ao fechar/i)` não encontra nada → falha |
| Não filtrar valores `"Não informado"` do payload extra | `jobDetailModal.test.tsx:151` (bloco só com dupes) | campo residual apareceria e o bloco renderizaria → `queryByText` passaria a encontrar, teste falha |

4 mutações de raciocínio, todas com teste que mataria — sem sobreviventes identificados.

## Payload/conjunction rule

- Cada tile (`InfoTile`) é verificado por rótulo **e** valor juntos (`getByText(label)` + `getByText(value)`), não só presença do componente.
- O bloco "Detalhes adicionais" é verificado tanto no caso positivo (label do campo residual + valor) quanto negativo (ausência do heading), cobrindo os dois lados da condição de filtro.

## Verdict: PASS ✅

8/8 ACs (JDM-01..08) cobertas com evidência `file:line` e valor esperado batendo com a spec; nenhum gap de precisão; gate verde; sensor de mutação (raciocinado) sem sobreviventes; nenhuma asserção rasa identificada.
