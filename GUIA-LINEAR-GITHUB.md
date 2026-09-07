# Guia do Usuário — Linear e integração automática com GitHub

Este guia explica, do ponto de vista de quem usa no dia a dia, como o time **Painel Vagas (PAV)** trabalha com o [Linear](https://linear.app/tatame/team/PAV/all) e como aproveitar a integração que já está ativa com o GitHub, que movimenta os cards automaticamente conforme o fluxo de desenvolvimento.

> O objetivo é o **uso**: a integração já está implementada e funcionando. Você não precisa configurar nada — só entender como usá-la a seu favor.

## Sumário

- [1. Conceitos básicos do Linear](#1-conceitos-básicos-do-linear)
- [2. Passo a passo: usando suas tasks no fluxo do time](#2-passo-a-passo-usando-suas-tasks-no-fluxo-do-time)
- [3. Como vincular um card a um branch, PR ou commit](#3-como-vincular-um-card-a-um-branch-pr-ou-commit)
- [4. Quais ações no GitHub movem os cards (e para onde)](#4-quais-ações-no-github-movem-os-cards-e-para-onde)
- [5. Exemplo prático de ponta a ponta](#5-exemplo-prático-de-ponta-a-ponta)
- [6. Perguntas frequentes](#6-perguntas-frequentes)

---

## 1. Conceitos básicos do Linear

O Linear é a ferramenta oficial de gestão de tasks do time. Alguns conceitos que você usa todo dia:

### Time (Team)

Um agrupamento de pessoas e trabalho. O nosso é o **Painel Vagas**, cujo prefixo é **`PAV`**. Por isso todo card recebe um identificador como `PAV-93`, `PAV-94`, etc. Esse identificador é a "chave" que conecta o Linear ao GitHub — guarde bem esse conceito, ele aparece na seção 3.

### Issue / Card

Uma unidade de trabalho: uma feature, um bug, uma tarefa de documentação. Cada card tem:

- **Identificador** único (ex: `PAV-93`).
- **Título** e **descrição** (contexto, o que fazer e os **critérios de aceite**).
- **Responsável (assignee)** — quem está tocando o card.
- **Prioridade** e **estado**.

### Estados (Status)

O estado indica em que ponto do fluxo o card está. No time PAV os estados são:

| Estado                  | Tipo       | Significado                                                        |
| ----------------------- | ---------- | ----------------------------------------------------------------- |
| **Backlog**             | backlog    | Ideia/tarefa registrada, ainda não priorizada para execução.      |
| **Todo**                | unstarted  | Priorizada e pronta para começar.                                 |
| **In Progress**         | started    | Em desenvolvimento ativo.                                         |
| **In Review**           | started    | Código pronto, aguardando revisão (PR aberto).                    |
| **Blocked / Dependent** | unstarted  | Parada por dependência ou impedimento externo.                    |
| **Done**                | completed  | Concluída e integrada.                                            |
| **Canceled**            | canceled   | Descartada, não será feita.                                       |
| **Duplicate**           | duplicate  | Repetida de outro card.                                           |

O fluxo típico de uma task saudável é:

```
Backlog → Todo → In Progress → In Review → Done
```

A boa notícia: da parte **In Progress → In Review → Done** você quase nunca precisa mover o card na mão — o GitHub faz isso por você (seção 4).

### Prioridade

Cada card pode ter uma prioridade: **Urgent, High, Medium, Low** ou **No priority**. Ela orienta a ordem de execução dentro do Backlog/Todo. Ao pegar trabalho, prefira os de maior prioridade.

### Ciclos (Cycles)

Ciclos são janelas de tempo (semelhantes a sprints) usadas para organizar o que o time pretende entregar em um período. Cards podem ser associados a um ciclo para dar visibilidade do que está no radar agora versus depois.

---

## 2. Passo a passo: usando suas tasks no fluxo do time

O fluxo oficial do projeto (alinhado ao [contribuition.md](contribuition.md) e ao README) é:

1. **Escolher ou criar um card no Linear.**
   - No board do PAV, pegue um card em **Todo** (ou **Backlog**, se for algo novo priorizado com o time).
   - Para criar um card rápido, você pode usar o comando `/criar-task-linear` no Claude Code.

2. **Se atribuir o card.**
   - Defina você como **assignee**. Isso deixa claro para o time quem está tocando aquilo.

3. **Iniciar o trabalho criando o branch.**
   - Crie um branch de feature **a partir da master**, usando o identificador do card no nome (detalhes na seção 3).
   - **Ao criar esse branch, o card sai de Todo/Backlog e vai para `In Progress` automaticamente** (seção 4). Você não precisa arrastar o card.

4. **Desenvolver e commitar em blocos pequenos.**
   - Faça commits coerentes usando Conventional Commits (`tipo: descrição`, ver [contribuition.md](contribuition.md) seção 4), incluindo o identificador do card na mensagem (ex: `docs: cria guia de uso do Linear e integração com GitHub (PAV-93)`).
   - Rode os testes/lint localmente antes de subir (ver [contribuition.md](contribuition.md) e [TESTING.md](TESTING.md)). O hook `commit-msg` (Husky + commitlint) valida o formato automaticamente e **não deve ser pulado com `--no-verify`** — o CI revalida as mensagens do PR de qualquer forma.

5. **Abrir o Pull Request.**
   - Abra o PR do seu fork (`origin`) para o `upstream` na branch **`develop`**.
   - Você pode usar o comando `/abrir-pr-jobs-scraper`, que já monta o PR padronizado e inclui o link do card.
   - **Com o PR aberto e vinculado, o card avança para `In Review`.**

6. **Revisão e ajustes.**
   - O revisor comenta; você ajusta e atualiza o PR. O card permanece em **In Review** enquanto isso acontece.

7. **Merge.**
   - Após aprovação, o PR é mergeado em `develop`. **O card vai para `Done` automaticamente.**
   - Depois, no fluxo de release, abre-se o PR de `develop` para `master` (PRs para `master` só são aceitos a partir de `develop` — isso é garantido pelo workflow `block-master-pr.yml`).

> **Movimentação manual ainda existe:** você pode arrastar um card entre estados no Linear a qualquer momento (por exemplo, mover de **Backlog** para **Todo**, ou marcar como **Blocked / Dependent** quando ficar travado). A automação do GitHub cuida principalmente das transições **In Progress → In Review → Done**.

---

## 3. Como vincular um card a um branch, PR ou commit

A integração conecta Linear ↔ GitHub pelo **identificador do card** (ex: `PAV-93`). Sempre que esse identificador aparece em um lugar que a integração observa, o card e o trabalho no GitHub ficam vinculados. Há três formas, e você normalmente usa as três juntas:

### a) Pelo nome do branch (forma principal)

Inclua o identificador no nome do branch. Convenção oficial do projeto:

```
feature/<id-do-card>-<descricao-curta>
fix/<id-do-card>-<descricao-curta>
chore/<id-do-card>-<descricao-curta>
```

Exemplo real deste repositório:

```bash
git checkout master
git pull origin master
git checkout -b feature/pav-93-doc-linear-github
```

> **Dica:** o próprio Linear sugere um nome de branch pronto no card (botão de copiar branch name). Usar o identificador `PAV-93` no nome é o que dispara o vínculo e o "In Progress".

### b) Pela mensagem de commit

Coloque o identificador do card na mensagem de commit, seguindo o padrão Conventional Commits exigido pelo `commit-msg` hook (ver [contribuition.md](contribuition.md) seção 4):

```bash
git commit -m "docs: cria guia de uso do Linear e integração com GitHub (PAV-93)"
```

Isso deixa o histórico rastreável, reforça o vínculo do trabalho com o card e passa na validação automática do commitlint.

### c) Pelo Pull Request

Referencie o card no **título** ou na **descrição** do PR. O PR padronizado do projeto já faz isso:

- **Título:** `PAV-93: <título da task no Linear>`
- **Descrição:** inclui o **link do card** do Linear.

Se quiser que o merge **feche** o card automaticamente, use uma palavra-chave de fechamento seguida do identificador na descrição do PR, por exemplo:

```
Closes PAV-93
```

> Na prática, no fluxo deste time o PR já é criado com o identificador no título e o link do card no corpo (via `/abrir-pr-jobs-scraper`), o que é suficiente para o Linear reconhecer o vínculo e movimentar o card.

---

## 4. Quais ações no GitHub movem os cards (e para onde)

Esta é a parte que economiza seu tempo: uma vez que o card está vinculado (seção 3), as ações no GitHub empurram o estado no Linear automaticamente.

| Ação no GitHub                                         | Estado do card no Linear |
| ------------------------------------------------------ | ------------------------ |
| **Branch criado** com o identificador do card         | → **In Progress**        |
| **Pull Request aberto** e vinculado ao card            | → **In Review**          |
| **PR mergeado** (na `develop`)                         | → **Done**               |

Observações práticas:

- A transição **Branch criado → In Progress** é o comportamento que você observa neste próprio time: o card `PAV-93`, por exemplo, saiu de **Backlog** e entrou em **In Progress** no exato momento em que seu branch foi criado.
- Enquanto o PR está aberto e recebendo revisão, o card permanece em **In Review** — você não precisa ficar movendo nada durante o vai-e-vem de review.
- O **merge** é o gatilho de conclusão: ao integrar o PR, o card fecha em **Done**.

> **Nota:** o mapeamento exato de cada ação para cada estado é definido nas configurações da integração GitHub dentro do workspace do Linear (feito pelos administradores). Os estados **In Progress**, **In Review** e **Done** existem no time PAV justamente para suportar esse fluxo. Se alguma transição não acontecer como esperado, confirme se o identificador do card (`PAV-XX`) está presente no branch/PR — é a ausência do identificador o motivo mais comum de o card "não se mover sozinho".

---

## 5. Exemplo prático de ponta a ponta

Cenário: você vai desenvolver o card **`PAV-93 — Criar documento de guia do usuário sobre Linear e integração automática com GitHub`**.

**1. No Linear:** o card está em **Todo**. Você se atribui como assignee.

**2. Cria o branch** a partir da master, com o identificador no nome:

```bash
git checkout master
git pull origin master
git checkout -b feature/pav-93-doc-linear-github
```

➡️ No Linear, o card `PAV-93` muda sozinho de **Todo** para **In Progress**.

**3. Desenvolve e commita** em blocos, com Conventional Commits e o identificador na mensagem:

```bash
git add GUIA-LINEAR-GITHUB.md
git commit -m "docs: cria guia de uso do Linear e integração com GitHub (PAV-93)"
```

**4. Sobe o branch e abre o PR** para `develop` (ex.: via `/abrir-pr-jobs-scraper`):

- Título: `PAV-93: Criar documento de guia do usuário sobre Linear e integração automática com GitHub`
- Descrição: resumo das mudanças + **link do card** `PAV-93`.

➡️ No Linear, o card avança de **In Progress** para **In Review**.

**5. Revisão:** o revisor pede um ajuste; você corrige, commita e atualiza o PR. O card segue em **In Review**.

**6. Merge:** aprovado, o PR é mergeado em `develop`.

➡️ No Linear, o card `PAV-93` fecha automaticamente em **Done**.

**7. Release:** no momento da release, abre-se o PR de `develop` para `master` (obrigatoriamente a partir de `develop`, conforme o workflow `block-master-pr.yml`).

Resultado: você tocou o card do início ao fim tendo movido o Linear manualmente **apenas uma vez** (Todo → assignee), enquanto **In Progress**, **In Review** e **Done** foram atualizados sozinhos pela integração.

---

## 6. Perguntas frequentes

**O card não saiu de Todo quando criei o branch. O que houve?**
Provavelmente o identificador do card não está no nome do branch. Confirme que o branch contém `PAV-XX` (ex: `feature/pav-93-...`). Sem o identificador, a integração não sabe qual card mover.

**Preciso mover o card na mão em algum momento?**
Sim, nas transições que o GitHub não cobre: tirar do **Backlog** para **Todo**, marcar como **Blocked / Dependent** quando travar, ou **Canceled** se o trabalho for descartado. As transições In Progress → In Review → Done são automáticas.

**Posso vincular vários commits/PRs ao mesmo card?**
Sim. Basta que todos referenciem o mesmo identificador `PAV-XX`.

**O que fecha o card em Done: abrir o PR ou o merge?**
O **merge**. Abrir o PR leva o card para **In Review**; é o merge que o conclui em **Done**.

**Onde vejo o board do time?**
Board oficial do PAV: https://linear.app/tatame/team/PAV/all

---

### Referências internas

- [README.md](README.md) — visão geral, fluxo de desenvolvimento e branching.
- [contribuition.md](contribuition.md) — processo oficial de contribuição, padrão de branch e commit.
- [TESTING.md](TESTING.md) — guia de testes e política de qualidade.
- Comando `/criar-task-linear` — cria cards no Linear a partir do Claude Code.
- Comando `/abrir-pr-jobs-scraper` — abre PR padronizado já vinculado ao card.
