# Guia de Testes Automatizados

Este documento foi criado para quem nunca trabalhou com testes automatizados.

Se voce esta contribuindo pela primeira vez no projeto, começe por aqui.

## O que e um teste automatizado?

Um teste automatizado e um pequeno programa que verifica se uma funcionalidade continua funcionando como esperado.

Em vez de testar tudo manualmente toda vez, o teste automatizado executa cenarios e confirma o resultado por voce.

## Por que escrevemos testes?

Escrevemos testes para:

- evitar quebrar funcionalidades antigas
- dar seguranca para melhorar o codigo
- documentar como o sistema deve se comportar
- facilitar revisao de Pull Request
- ajudar novos contribuidores a entender o projeto

## O que acontece quando um teste falha?

Quando um teste falha, isso e um alerta.

Pode significar:

- bug novo
- comportamento mudou sem querer
- regra esperada deixou de ser atendida

Em geral, um teste falhando e uma protecao do projeto, nao um incomodo.

## Como testes ajudam novos desenvolvedores

Testes funcionam como documentacao viva.

Ao ler um teste, voce entende:

- qual entrada foi usada
- qual comportamento era esperado
- o que nao pode regredir

---

## Conceitos basicos

### O que e um cenario de teste?

Cenario de teste e uma situacao real do sistema.

Exemplo simples:

"Quando faco login com senha correta, espero entrar no sistema."

Isso vira:

- Cenario: usuario informa senha correta
- Resultado esperado: sistema permite acesso

---

## O que e um TC (Test Case)

TC significa Test Case (Caso de Teste).

Um TC responde:

"Qual comportamento do sistema estou garantindo?"

Importante:

- TC nao e uma linha de codigo isolada
- TC e um comportamento relevante

Exemplo real do projeto:

- backend/tests/unit/adapters/goScrapper/goScraper.TC01.ts

Responsabilidade desse TC:

- garantir que o adapter retorna vagas quando o Go Scraper responde com dados validos

---

## O que e um TP (Test Plan)

TP significa Test Plan (Plano de Testes).

TP e um documento/arquivo que organiza:

- o que sera testado
- quais cenarios existem
- quais TCs pertencem ao plano
- resultados esperados

Exemplo real do projeto:

- backend/tests/unit/adapters/TP-01.goScraper.test.ts

Esse arquivo representa o planejamento dos testes do adapter Go Scraper.

Ele define:

- qual funcionalidade sera validada
- qual o objetivo dos testes
- quais cenarios precisam ser protegidos
- quais TCs fazem parte desse plano

Antes de escrever codigo de teste, o primeiro passo e entender quais comportamentos precisam ser garantidos.

---

## Relacao entre TP e TC

O projeto utiliza esta relacao:

TP (Test Plan)
->
TC (Test Case)
->
Teste automatizado executavel

Explicando de forma simples:

- TP: planeja os cenarios
- TC: implementa cada cenario
- Suite de testes: executa tudo e valida o comportamento

### Estrutura de relacionamento (Go Scraper)

```text
Go Scraper Adapter

TP-01.goScraper.test.ts

Define os cenarios:

|- TC-01
|  |- Resposta valida
|
|- TC-02
|  |- Erro HTTP
|
|- TC-03
|  |- Contrato invalido
|
|- TC-04
|  |- Parametros invalidos
|
|- TC-05
|  |- Envio de parametros
|
|- TC-06
|  |- Variavel de ambiente
```

---

## Explicacao dos TCs reais do projeto

Arquivos reais atualmente:

- backend/tests/unit/adapters/goScrapper/goScraper.TC01.ts
- backend/tests/unit/adapters/goScrapper/goScraper.TC02.ts
- backend/tests/unit/adapters/goScrapper/goScraper.TC03.ts
- backend/tests/unit/adapters/goScrapper/goScraper.TC04.ts
- backend/tests/unit/adapters/goScrapper/goScraper.TC05.ts
- backend/tests/unit/adapters/goScrapper/goScraper.TC06.ts

Resumo de cada cenario:

- TC01
  - Cenario: resposta valida do Go Scraper
  - Esperado: adapter retorna vagas corretamente

- TC02
  - Cenario: servico externo retorna erro HTTP
  - Esperado: adapter trata e propaga erro corretamente

- TC03
  - Cenario: resposta nao segue contrato esperado
  - Esperado: sistema rejeita resposta invalida

- TC04
  - Cenario: parametros invalidos de entrada
  - Esperado: falha antes de chamar servico externo

- TC05
  - Cenario: envio de parametros para o servico
  - Esperado: payload preserva dados esperados

- TC06
  - Cenario: URL do Go Scraper via variavel de ambiente
  - Esperado: adapter usa GO_SCRAPER_URL configurada

---

## Primeiro exemplo do projeto (passo a passo)

Use como referencia:

- backend/tests/unit/adapters/goScrapper/goScraper.TC01.ts

Passo a passo do que ele faz:

1. prepara uma resposta simulada (mock) da API externa
2. executa o adapter
3. verifica os dados retornados
4. confirma que o comportamento esperado aconteceu

---

## Regra de qualidade dos testes

Teste unitario nao deve validar apenas uma linha ou chamada isolada.

Exemplo ruim:

```ts
it("deve chamar funcao", () => {
  expect(mock.execute).toHaveBeenCalled();
});
```

Por que e ruim:

- valida detalhe interno
- nao prova comportamento real

Exemplo melhor:

```ts
it("deve retornar vagas quando a resposta do Go Scraper for valida", async () => {
  // cenario completo
});
```

Pergunta que todo bom teste deve responder:

"Qual comportamento do sistema estou garantindo?"

---

## Quando usar varios testes e quando usar it.each

Use TCs separados quando os cenarios sao diferentes.

Exemplo:

- resposta valida
- erro HTTP
- contrato invalido

Use `it.each` quando a regra e a mesma e so os dados mudam.

Exemplo:

```ts
it.each([
  { keyword: "Java" },
  { keyword: "Node.js" },
])( "deve buscar vagas corretamente", async ({ keyword }) => {
  // mesma regra, dados diferentes
});
```

Isso evita copiar e colar testes quase iguais.

---

## Processo para criar novos testes

1. Identificar a funcionalidade
2. Criar ou atualizar o TP
3. Definir cenarios
4. Criar TCs necessarios
5. Implementar os testes
6. Executar testes localmente
7. Abrir Pull Request

Comando util para backend:

```bash
npm run test --workspace=backend
```

Outros comandos úteis (todos existem em `package.json`/workspace correspondente): `npm run test:coverage --workspace=backend`, `npm run test --workspace=frontend`, `npm run test --workspace=front_admin`, `npm run test:watch --workspace=<workspace>`.

### O que o CI realmente valida

O workflow `.github/workflows/ci.yml` roda, nesta ordem: `test:coverage` no frontend, `test:coverage` no backend, `lint` no frontend e `build` no frontend. Backend e frontend têm meta de cobertura de **80%** (lines/functions/branches/statements) configurada em `backend/vitest.config.js` e `frontend/vitest.config.js` — PRs que reduzirem a cobertura abaixo disso falham o CI. `front_admin` tem os mesmos scripts de teste/lint disponíveis (`front_admin/package.json`), mas **não está incluído** no workflow de CI atual; rode `npm run test --workspace=front_admin` manualmente ao alterar esse workspace.

---

## Beneficios desse padrao

Para iniciantes:

- facilita entender o projeto
- funciona como documentacao viva
- ajuda na primeira contribuicao

Para o projeto:

- melhora manutencao
- facilita revisao de PR
- reduz regressao
- mantem qualidade com crescimento da comunidade

---

## Checklist para novos contribuidores

Antes de abrir PR, confirme:

- Existe um TP documentando o objetivo?
- O TC representa um comportamento real?
- O nome do teste esta claro?
- Evitei testar detalhes internos?
- Usei it.each quando os cenarios sao equivalentes?

---

## Nota de consistencia sobre nomes dos arquivos

Este guia usa os caminhos reais encontrados no repositorio no momento da escrita.

No prompt de referencia, alguns nomes aparecem como:

- TC-01.goScraper.test.ts
- TP-01.goScraper.test.ts (como documento)

No codigo atual, os arquivos de TC estao nomeados como:

- goScraper.TC01.ts ate goScraper.TC06.ts

Isso nao muda o conceito.

O importante e manter a relacao:

TP planeja -> TC implementa -> teste automatizado protege comportamento.
