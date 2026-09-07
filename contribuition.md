# Guia de Contribuicao

Este documento define o processo oficial de contribuicao no monorepo para manter qualidade, previsibilidade e historico limpo.

## 1. Fluxo obrigatorio

1. Criar/selecionar um card no board oficial.
2. Atualizar a branch principal local.
3. Criar branch de feature a partir da master.
4. Implementar mudancas com testes.
5. Commitar em blocos pequenos e coerentes.
6. Abrir PR para develop.
7. Ajustar feedback de review.
8. Fazer merge somente apos aprovacao.

## 2. Padrao de branch

Formato recomendado:

- feature/<id-card>-<descricao-curta>
- fix/<id-card>-<descricao-curta>
- chore/<id-card>-<descricao-curta>

Exemplo:

- feature/123-corrigir-contrato-keywords

Comandos base:

```bash
git checkout master
git pull origin master
git checkout -b feature/123-corrigir-contrato-keywords
```

## 3. Responsabilidades por papel

### Desenvolvedor(a)

- Implementar somente o escopo do card.
- Garantir build e testes locais antes do commit.
- Atualizar documentacao quando contrato/API mudar.
- Descrever claramente impacto tecnico no PR.

### Revisor(a)

- Validar regressao funcional e tecnica.
- Verificar padrao de codigo e clareza do diff.
- Bloquear merge se houver risco de quebra nos fluxos criticos.

### QA

- Executar roteiro QA no estado da branch.
- Reportar bug com passos, evidencia e severidade.
- Aprovar somente apos criterios de aceite serem atendidos.

## 4. Convencao de commit

Usar Conventional Commits:

- feat: nova funcionalidade
- fix: correcao de bug
- chore: manutencao
- refactor: refatoracao sem mudar comportamento
- test: testes
- docs: documentacao

Formato:

```text
tipo(escopo): descricao curta no imperativo
```

Exemplos:

- feat(frontend): adicionar estado vazio para tabela
- fix(backend): corrigir metodo da rota jobs search
- docs(repo): atualizar guia de testes

Quando o commit estiver ligado a um card do Linear, inclua o identificador no fim da descrição (ver [GUIA-LINEAR-GITHUB.md](GUIA-LINEAR-GITHUB.md)):

- docs: cria guia de uso do Linear e integracao com GitHub (PAV-93)

Essa convenção é validada automaticamente pelo hook `commit-msg` (Husky + commitlint, `commitlint.config.cjs`) a cada commit — não é algo para lembrar manualmente.

## 5. Checklist antes do commit

Executar na raiz:

```bash
npm run lint --workspace=frontend
npm run test --workspace=backend
npm run build --workspace=frontend
```

Se alterou backend com banco:

```bash
npm run db:generate
npm run db:migrate
```

## 6. Husky (hooks locais obrigatorios)

O projeto esta preparado para usar Husky com os hooks:

- pre-commit: `lint-staged` (roda eslint apenas nos arquivos alterados de `frontend/src`)
- commit-msg: valida a mensagem do commit com `commitlint` (`commitlint.config.cjs`, ver seção 4)
- pre-push: `npm run validate` (teste do backend + lint do frontend + build do frontend)

Arquivos de hook:

- .husky/pre-commit
- .husky/commit-msg
- .husky/pre-push

> **Nota:** o Git não tem um hook que dispare no `git add`. O equivalente automático é o `pre-commit`: ele roda o `lint-staged` sobre exatamente os arquivos que você deu `git add` e está prestes a commitar, toda vez que você roda `git commit`. Ou seja, "rodar a cada `git add .`" na prática significa "rodar a cada commit sobre o que foi adicionado" — e isso já acontece automaticamente, sem nenhuma ação manual.

### Instalacao inicial

Depois de clonar o repositorio:

```bash
npm install
```

O script prepare configura o Husky automaticamente.

### Rodar hooks manualmente (debug)

Não há scripts npm dedicados para isso; rode o próprio arquivo de hook:

```bash
sh .husky/pre-commit
sh .husky/pre-push
```

### `--no-verify` é proibido

**Nunca use `git commit --no-verify`, `git push --no-verify` ou qualquer flag equivalente para pular os hooks.** Eles existem justamente para pegar problemas antes de chegarem ao PR (lint, testes, build, formato da mensagem de commit).

Isso não é só uma regra de conduta: como o git não permite bloquear tecnicamente o uso de `--no-verify` no lado do desenvolvedor, o próprio CI (`.github/workflows/ci.yml`, step "Validar mensagens de commit") revalida a mensagem de **todos os commits do PR** com o mesmo `commitlint.config.cjs`. Ou seja, pular o hook local com `--no-verify` só adia o erro — o PR não passa no CI mesmo assim.

Se um hook falhar, corrija o problema (lint, teste, mensagem de commit) em vez de pular a verificação.

## 7. Regras de Pull Request

Toda PR deve conter:

1. Link do card/issue.
2. Resumo objetivo das alteracoes.
3. Evidencias de teste (logs, prints ou comandos executados).
4. Riscos conhecidos e plano de rollback, quando aplicavel.

Checklist minimo da PR:

- [ ] Escopo limitado ao card
- [ ] Sem arquivos temporarios/gerados desnecessarios
- [ ] Sem segredo/token em codigo
- [ ] Testes locais executados
- [ ] Documentacao atualizada (quando necessario)

## 8. Regras de merge

- Nao fazer commit direto em master ou develop.
- Nao fazer merge sem review.
- Nao usar squash sem preservar contexto da PR (descricao clara).
- Corrigir conflitos localmente e rerodar checklist antes do merge.

## 9. Politica de qualidade minima

- Cobertura minima de 80% (linhas, statements, functions, branches) conforme TESTING.md.
- Qualquer mudanca em contrato de API deve vir com ajuste de frontend e testes relacionados.
- Bugs bloqueantes ou criticos impedem merge.

## 10. Template rapido de mensagem de PR

```markdown
## Card
- [link do card]

## O que foi feito
- item 1
- item 2

## Validacao
- comando 1
- comando 2

## Riscos
- risco 1

## Evidencias
- print/log/link
```
