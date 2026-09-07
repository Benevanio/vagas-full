# Guia de Desenvolvimento Local

Este guia foi escrito para quem acabou de clonar o repositório e precisa subir o projeto do zero.

Objetivo: permitir execução local com o mínimo de tentativa e erro, usando apenas o que existe hoje no repositório.

## Visão rápida

O monorepo possui 5 blocos principais:

- frontend: aplicação principal do usuário final (React + Vite)
- backend: API Node.js/Express (TypeScript + Drizzle)
- front_admin: painel administrativo (React + Vite)
- scraper-go: serviço Go para coleta/agregação de vagas
- observability: stack de métricas e logs (Prometheus/Grafana/Loki etc.)

Além disso, há Docker Compose para infraestrutura e execução completa.

---

## 1) Pré-requisitos

### Obrigatórios

1. Git
2. Node.js 22+ (o backend exige >= 22)
3. npm (projeto usa package-lock e scripts npm)
4. Docker Desktop com Docker Compose (recomendado para subir stack completa)

### Opcionais (dependendo do fluxo)

1. Go 1.26+ (apenas se você quiser rodar o scraper-go fora do Docker)
2. PostgreSQL local (se quiser rodar backend local sem backend em container)
3. Valkey/Redis local (se quiser rodar backend/scraper local fora de container)

### Como verificar instalação

No terminal:

```bash
git --version
node -v
npm -v
docker --version
docker compose version
```

Opcional (Go):

```bash
go version
```

### Versão recomendada de gerenciador de pacotes

- Recomendado pelo projeto: npm
- Observação: existe pnpm-workspace.yaml, mas o lockfile ativo do projeto é package-lock.json.

---

## 2) Clonando o projeto

Exemplo:

```bash
git clone https://github.com/Cla-Code-Community/candidate.git
cd candidate
```

Se seu fork/repo tiver outro nome, ajuste os comandos.

---

## 3) Estrutura do monorepo

Estrutura de alto nível relevante:

- backend/
  - API Express, rotas de auth/users/jobs/keywords/saved-jobs/admin
  - migrações em backend/drizzle
  - testes unitários e integração em backend/tests
- frontend/
  - app principal (landing, login/cadastro, callback OAuth, dashboard)
  - testes em frontend/tests
- front_admin/
  - painel administrativo (dashboard, usuários, scrapers, observabilidade, auditoria, permissões)
  - testes em front_admin/tests
- scraper-go/
  - serviço Go de scraping
  - endpoints como /scrape, /health, /metrics, /api/keywords
- shared/
  - componentes compartilhados (ex.: CandidateLogo)
- docker/
  - Dockerfile multi-stage para backend/frontend/front_admin
- observability/
  - arquivos de configuração do Prometheus/Grafana/Loki/Alertmanager etc.
- docs/
  - documentação complementar
- docker-compose.infra.yml
  - PostgreSQL + Valkey
- docker-compose.yml
  - scraper-go + backend + frontend + front_admin
- docker-compose.migrate.yml
  - job de migração/backfill antes do backend
- docker-compose.observability.yml
  - stack de observabilidade

---

## 4) Instalação

Execute na raiz do monorepo:

```bash
npm install
```

Isso instala dependências da raiz e dos workspaces.

---

## 5) Variáveis de ambiente

## Arquivos de ambiente existentes

No estado atual do repositório, existem:

- .env.example (raiz)
- backend/.env.example
- frontend/.env.example

Também podem existir localmente após setup:

- .env
- backend/.env

Observação importante:

- front_admin não possui front_admin/.env.example versionado.

## Como criar

Na raiz:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

No PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

## Variáveis obrigatórias vs opcionais

### Obrigatórias na prática para uso completo

1. SESSION_SECRET
2. DATABASE_URL
3. CORS_ALLOWED_ORIGINS
4. FRONTEND_URL
5. GO_SCRAPER_URL (ou SCRAPER_URL em alguns fluxos)

### Necessárias somente se usar OAuth

1. GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
2. GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
3. LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET

### Necessárias somente para fontes externas de scraping

1. ADZUNA_APP_ID / ADZUNA_APP_KEY
2. JOOBLE_API_KEY

### Segurança/PII

1. ENCRYPTION_MASTER_KEY
2. SEARCH_KEY
3. ENCRYPTION_KEY_ID

Se esses valores não estiverem definidos adequadamente, recursos que dependem de criptografia e busca segura podem falhar.

---

## 6) Banco de dados

## O que existe hoje

- ORM: Drizzle
- Dialeto: PostgreSQL
- Migrações: backend/drizzle
- Config Drizzle: backend/drizzle.config.js
- Não há arquivos de seeders versionados no repositório.

## Migrações (manual)

Rodando no workspace backend:

```bash
npm run db:migrate --workspace=backend
```

Alternativas:

```bash
npm run db:generate --workspace=backend
npm run db:push --workspace=backend
```

## Migrações via Docker

No fluxo Docker completo, há o serviço migrate em docker-compose.migrate.yml que roda:

- db:migrate
- security:backfill-user-pii

## Usuários padrão

O projeto tem um seed versionado (`backend/src/scripts/seed.ts`) que cria usuários e dados de teste prontos para uso. Veja o passo a passo completo na seção [6.1) Seed e testes da API local](#61-seed-e-testes-da-api-local) logo abaixo.

Se preferir não usar o seed, também é possível criar um usuário manualmente:

1. Use a tela de cadastro em /register
2. Ou envie POST /auth/register

---

## 6.1) Seed e testes da API local

Esta seção existe para quem **nunca mexeu neste projeto** e só quer ter, o mais rápido possível, um usuário válido para logar e testar a API. Siga os passos na ordem.

### O que é o seed

O seed é um script (`backend/src/scripts/seed.ts`) que insere no banco, de forma **idempotente** (pode rodar quantas vezes quiser sem duplicar nada) e **não destrutiva** (nunca apaga dados existentes):

- 2 usuários de login (um comum e um administrador)
- 3 vagas salvas para o usuário comum, em status diferentes
- 2 notas privadas (campo `notes`) em vagas salvas
- 2 eventos de mudança de status de candidatura

Ele usa exatamente o mesmo mecanismo de hash de senha (Argon2id) e de criptografia de dados pessoais que a aplicação usa em produção, então os usuários criados pelo seed funcionam normalmente em `POST /auth/login`, como qualquer conta criada pela tela de cadastro.

**As credenciais abaixo são exclusivamente para uso local/desenvolvimento. Nunca use essas senhas em um ambiente real.**

### Passo 1 — Preparação (instalar dependências)

Na raiz do repositório:

```bash
npm install
```

### Passo 2 — Configurar variáveis de ambiente

Se ainda não tem os arquivos `.env`, copie os exemplos (veja a seção [5) Variáveis de ambiente](#5-variáveis-de-ambiente) para o passo a passo completo):

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Preste atenção especial nestas variáveis do `backend/.env` — o seed **depende** delas para criptografar e-mail/nome dos usuários da mesma forma que a aplicação faz:

- `DATABASE_URL` — string de conexão com o Postgres
- `ENCRYPTION_MASTER_KEY` — precisa ter 64 caracteres hexadecimais (32 bytes). Se não tiver uma, gere uma localmente:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- `SEARCH_KEY` — qualquer string secreta não vazia (ex.: `local-dev-search-key`)
- `SESSION_SECRET` — qualquer string longa (necessária para o backend subir e para o login funcionar)

Sem essas variáveis preenchidas, o seed falha com um erro explicando qual está faltando/inválida — isso é esperado e não é bug.

### Passo 3 — Subir o banco de dados

Escolha uma das opções abaixo (mais detalhes na seção [7) Docker](#7-docker)):

**Opção A — Docker completo (recomendado):**

```bash
docker network create vagas-net
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml up --build -d
```

Isso já sobe o Postgres, aplica as migrations automaticamente (serviço `migrate`) e inicia o backend.

**Opção B — Só a infraestrutura (Postgres/Valkey), backend rodando fora do Docker:**

```bash
docker network create vagas-net
docker compose -f docker-compose.infra.yml up -d
```

Nesse caso, como o Postgres do compose de infra não expõe porta para o host por padrão, ajuste `DATABASE_URL` no seu `backend/.env` para apontar para um Postgres acessível localmente (veja a observação na seção [8) Executando o projeto](#8-executando-o-projeto)).

### Passo 4 — Rodar as migrations

Se você usou a Opção A acima, este passo já foi feito automaticamente pelo serviço `migrate`. Se usou a Opção B ou está rodando o backend fora do Docker:

```bash
npm run db:migrate --workspace=backend
```

### Passo 5 — Rodar o seed

Na raiz do repositório:

```bash
npm run db:seed
```

Isso executa `backend/src/scripts/seed.ts`. A saída no terminal mostra o que foi criado, por exemplo:

```text
Iniciando seed de desenvolvimento local...
+ usuário criado: dev@localhost.test (role=user)
+ usuário criado: admin@localhost.test (role=admin)
+ vaga salva criada: Desenvolvedor(a) Frontend Pleno (status=saved)
+ vaga salva criada: Desenvolvedor(a) Backend Node.js (status=applied)
+ vaga salva criada: Engenheiro(a) Fullstack React (status=interviewing)
+ evento criado: saved -> applied
+ evento criado: applied -> interviewing
Seed concluído.
```

**O seed é idempotente.** Rodar `npm run db:seed` de novo (uma, duas, dez vezes) não cria usuários nem vagas duplicadas — o script verifica o que já existe antes de inserir e apenas avisa que o registro já existe:

```text
Iniciando seed de desenvolvimento local...
- usuário já existe, mantendo: dev@localhost.test
- usuário já existe, mantendo: admin@localhost.test
- vaga salva já existe, mantendo: https://example.com/jobs/seed-frontend-pleno
...
Seed concluído.
```

Isso significa que você pode rodar o seed sempre que quiser "resetar" seu ambiente de testes para o estado conhecido, sem medo de sujar o banco com duplicatas.

### Usuários de desenvolvimento criados pelo seed

| Usuário         | E-mail                  | Senha          | Papel (role) |
| --------------- | ----------------------- | -------------- | ------------ |
| Local Developer | `dev@localhost.test`    | `Dev@123456`   | `user`       |
| Local Admin     | `admin@localhost.test`  | `Admin@123456` | `admin`      |

- **Local Developer** serve para testar os fluxos normais de usuário final (login, perfil, vagas salvas, notas, eventos).
- **Local Admin** serve para testar endpoints que exigem papel `admin` (ex.: `/admin/users`, `/admin/observability/metrics`). Se precisar testar algo que exige `super_admin`, promova esse usuário manualmente com `PATCH /admin/users/:id/role` logado como um `super_admin`, ou atualize a coluna `role` diretamente no banco apenas em ambiente local.

Essas credenciais **não existem em nenhum ambiente de produção** — elas só existem no banco que você seedou localmente.

### Autenticação: como funciona e como logar

Importante: esta API **não usa JWT**. A sessão é baseada em **cookie assinado** (biblioteca `iron-session`), chamado `vagas_session`. Isso significa que, para chamar rotas autenticadas, você precisa manter o cookie recebido no login e reenviá-lo nas próximas requisições — é exatamente o que um navegador faz sozinho, mas em `curl` precisamos fazer isso manualmente com um "cookie jar".

Rota de login real (confirmada no código, montada em `backend/src/app.ts`):

- Método: `POST`
- Path: `/auth/login`
- Body: `{ "email": "...", "password": "..." }`

### Testando a API (exemplos reais com curl)

Os exemplos abaixo assumem o backend rodando em `http://localhost:3001` (padrão local). Ajuste a porta se você alterou `PORT` no `backend/.env`.

O prefixo oficial da API é `/api/v1` (ex.: `http://localhost:3001/api/v1/auth/login`). As mesmas rotas sem prefixo (como nos exemplos abaixo) continuam funcionando como compatibilidade temporária — os dois formatos são equivalentes hoje, mas prefira `/api/v1` em integrações novas.

**1. Login** (salva o cookie de sessão em `cookies.txt`):

```bash
curl -i -c cookies.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@localhost.test","password":"Dev@123456"}'
```

Resposta esperada: `200 OK` com o usuário no corpo e o cookie `vagas_session` no header `Set-Cookie`.

**2. Endpoint autenticado — dados da sessão atual:**

```bash
curl -i -b cookies.txt http://localhost:3001/auth/me
```

**3. Consulta — listar vagas salvas do usuário logado:**

```bash
curl -i -b cookies.txt http://localhost:3001/saved-jobs
```

Você deve ver as 3 vagas criadas pelo seed.

**4. Criação — salvar uma nova vaga:**

```bash
curl -i -b cookies.txt -X POST http://localhost:3001/saved-jobs \
  -H "Content-Type: application/json" \
  -d '{"jobLink":"https://example.com/jobs/teste-manual","jobTitle":"Vaga de teste","notes":"criada manualmente via curl"}'
```

Guarde o `id` retornado na resposta para os próximos passos.

**5. Atualização — mudar status/nota de uma vaga salva (substitua `SAVED_JOB_ID`):**

```bash
curl -i -b cookies.txt -X PATCH http://localhost:3001/saved-jobs/SAVED_JOB_ID \
  -H "Content-Type: application/json" \
  -d '{"status":"applied","notes":"nota privada atualizada via curl"}'
```

O `notes` acima é o campo legado de nota única da vaga salva. Para múltiplas notas privadas (feature mais recente), use o sub-recurso dedicado:

```bash
curl -i -b cookies.txt -X POST http://localhost:3001/saved-jobs/SAVED_JOB_ID/notes \
  -H "Content-Type: application/json" \
  -d '{"content":"Recrutador confirmou entrevista técnica para sexta."}'

curl -i -b cookies.txt http://localhost:3001/saved-jobs/SAVED_JOB_ID/notes
```

**6. Exclusão — remover a vaga salva de teste:**

```bash
curl -i -b cookies.txt -X DELETE http://localhost:3001/saved-jobs/SAVED_JOB_ID
```

Resposta esperada: `204 No Content`.

**7. Endpoint administrativo (logue com `admin@localhost.test` / `Admin@123456` antes, usando outro cookie jar):**

```bash
curl -i -c admin-cookies.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost.test","password":"Admin@123456"}'

curl -i -b admin-cookies.txt http://localhost:3001/admin/users
```

**8. Logout (encerra a sessão):**

```bash
curl -i -b cookies.txt -X POST http://localhost:3001/auth/logout
```

### Swagger/OpenAPI

URL local: <http://localhost:3001/docs>

Como usar:

1. Suba o backend localmente.
2. Acesse `http://localhost:3001/docs` no navegador.
3. O Swagger hoje documenta praticamente toda a API (`/auth`, `/users`, `/jobs`, `/saved-jobs`, `/notifications`, `/keywords`, `/admin`), com o prefixo `/api/v1`. A exceção são os endpoints de múltiplas notas privadas (`/saved-jobs/:id/notes`, `/saved-jobs/:id/notes/:noteId`), que ainda não têm entrada no Swagger — para esses, use os exemplos de `curl` desta seção, o `BACKEND.md`, ou a coleção Bruno em `backend/bruno/` (já vem com um ambiente `Local` configurado).
4. O Swagger UI não injeta automaticamente o cookie de sessão criado por um login feito fora do navegador — para testar rotas autenticadas diretamente pelo Swagger, faça login no mesmo navegador em `http://localhost:5173/login` primeiro (o cookie fica no domínio do backend) ou prefira os exemplos de `curl` acima.

### Dados criados pelo seed (resumo)

```text
2 usuários (Local Developer - role user, Local Admin - role admin)
2 registros de preferências de usuário (1 por usuário, criados junto com a conta)
3 vagas salvas para o Local Developer (status: saved, applied, interviewing)
2 notas privadas (campo "notes" preenchido em 2 das 3 vagas salvas)
2 eventos de candidatura (saved -> applied, applied -> interviewing)
```

Não há uma tabela genérica de "vagas" no banco — vagas vêm do scraper (Go) e ficam em cache; o que existe como tabela é `saved_jobs`, que já representa a "vaga salva" de um usuário (com título, empresa, link, status e nota privada).

### Reexecução do seed

Você pode (e deve, sempre que quiser) rodar o seed novamente a qualquer momento:

```bash
npm run db:seed
```

Como o script sempre verifica se o usuário (por e-mail) ou a vaga salva (por link + usuário) já existe antes de inserir, rodar de novo é seguro: nenhum dado é duplicado e nenhum dado existente é apagado ou sobrescrito. Isso é útil, por exemplo, depois de você ter testado exclusões manuais (`DELETE /saved-jobs/:id`) e querer recuperar o estado inicial de teste.

---

## 7) Docker

## 7.1 Subir stack completa (recomendado para onboarding)

1; Criar rede:

```bash
docker network create vagas-net
```

2; Subir infra + app + migrate:

```bash
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml up --build -d
```

## 7.2 Parar stack

```bash
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml down
```

## 7.3 Rebuild

```bash
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml up --build -d
```

## 7.4 Logs

Logs de todos os serviços:

```bash
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml logs -f
```

Logs de um serviço específico (exemplo backend):

```bash
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml logs -f backend
```

## 7.5 Observabilidade (opcional)

Subir stack de observabilidade:

```bash
docker compose -f docker-compose.observability.yml up -d
```

Parar:

```bash
docker compose -f docker-compose.observability.yml down
```

---

## 8) Executando o projeto

Você tem 2 caminhos principais.

## Caminho A: Docker completo (mais simples para começar)

Use o comando da seção de Docker.

Portas esperadas:

- frontend: <http://localhost:5173>
- front_admin: <http://localhost:5174>
- backend: <http://localhost:3001>
- scraper-go: <http://localhost:8081>

## Caminho B: Node local (frontend + backend)

Na raiz:

```bash
npm run dev
```

Isso sobe:

- frontend em 5173
- backend em 3001

Para incluir admin junto:

```bash
npm run dev:admin
```

Comandos separados:

```bash
npm run dev:frontend
npm run dev:backend
npm run dev:front_admin
```

Observação importante para o Caminho B:

- Se backend estiver fora de container, DATABASE_URL e VALKEY_URL precisam apontar para serviços acessíveis pelo host.
- No compose de infra atual, PostgreSQL e Valkey não estão expostos por portas no host por padrão.
- Portanto, para backend local funcionar, você precisa:
  1. usar banco/valkey locais no host, ou
  2. expor portas no compose (ajuste manual), ou
  3. rodar backend também em container.

---

## 9) Acessando a aplicação

URLs principais:

- App principal: <http://localhost:5173>
- Login: <http://localhost:5173/login>
- Cadastro: <http://localhost:5173/register>
- Dashboard app: /home, /dashboard, /vagas, /mentoria, /perfil, /ajuda
- Callback OAuth: /auth/callback

Backend:

- Health: <http://localhost:3001/health>
- Swagger: <http://localhost:3001/docs>
- Metrics: <http://localhost:3001/metrics>

Scraper:

- Health: <http://localhost:8081/health>
- Metrics: <http://localhost:8081/metrics>
- Admin jobs count: <http://localhost:8081/admin/jobs/count>

Front admin:

- <http://localhost:5174>
- rota de login: /login
- rotas principais: /dashboard, /users, /scrapers, /observability, /audit, /permissions, /settings

## Login/senha padrão

Não há credenciais padrão para produção. Para desenvolvimento local, rode `npm run db:seed` (veja a seção [6.1) Seed e testes da API local](#61-seed-e-testes-da-api-local)) e use:

- `dev@localhost.test` / `Dev@123456` (usuário comum)
- `admin@localhost.test` / `Admin@123456` (usuário admin)

Essas credenciais só existem no banco local depois de rodar o seed e nunca devem ser usadas fora de ambiente de desenvolvimento.

Alternativa sem seed:

1. criar usuário via cadastro na aplicação principal
2. usar login com email/senha criados

Para OAuth, é necessário configurar credenciais de provedores no .env.

---

## 10) Fluxo da aplicação (visão funcional)

## Aplicação principal (frontend)

1. Landing page pública em /
2. Cadastro em /register
3. Login em /login
4. Callback OAuth em /auth/callback
5. Após autenticação, acesso a rotas protegidas:
   - /home
   - /dashboard
   - /vagas
   - /mentoria
   - /perfil
   - /ajuda

## Backend

- Sessão via cookie (iron-session)
- Rotas protegidas para usuários autenticados:
  - /users
  - /jobs
  - /keywords
  - /notifications
  - /saved-jobs
  - /admin

## Scraper e fila

- Backend pode enfileirar keywords no Valkey (chave scraper:keywords:pending)
- Scraper-go processa keywords e agrega vagas

## Front admin

- Login próprio do painel
- Controle de acesso por papel (support/admin/super_admin)
- Seções administrativas para operação da plataforma

---

## 11) Testando manualmente (roteiro prático)

Abaixo, os testes manuais sugeridos para os módulos principais.

## 11.1 Login

Passos:

1. Acesse <http://localhost:5173/login>
2. Tente enviar vazio
3. Informe credenciais inválidas
4. Informe credenciais válidas

Resultado esperado:

- validações de campo aparecem
- credenciais inválidas não autenticam
- credenciais válidas redirecionam para área protegida

## 11.2 Cadastro

Passos:

1. Acesse <http://localhost:5173/register>
2. Preencha campos obrigatórios
3. Teste telefone opcional vazio
4. Teste telefone válido
5. Teste telefone inválido

Resultado esperado:

- cadastro válido cria conta e redireciona para login
- telefone vazio é permitido
- telefone inválido exibe erro e bloqueia envio

## 11.3 Busca de vagas

Passos:

1. Faça login
2. Vá para /vagas
3. Acione busca/filtros

Resultado esperado:

- requests de busca retornam sem quebrar a UI
- estados de loading/erro são exibidos corretamente

## 11.4 Vagas salvas

Passos:

1. Em /vagas, salve uma vaga
2. Abra lista de salvas
3. Edite status/notas se disponível
4. Remova vaga salva

Resultado esperado:

- operações de criar/editar/remover refletem na interface

## 11.5 Perfil e preferências

Passos:

1. Vá para /perfil
2. Atualize dados do perfil
3. Atualize preferências

Resultado esperado:

- alterações persistem
- recarregar a tela mantém dados

## 11.6 Painel administrativo

Passos:

1. Acesse <http://localhost:5174/login>
2. Faça login com conta com permissão
3. Navegue por dashboard/users/scrapers/observability/audit/permissions/settings

Resultado esperado:

- acesso a páginas conforme papel
- usuário sem papel mínimo deve cair em 403

---

## 12) Como reproduzir bugs corretamente

Use sempre este formato:

1. Contexto
   - branch
   - commit
   - ambiente (Docker ou local)
   - variáveis relevantes
2. Passos para reproduzir
   - sequenciais e exatos
3. Resultado atual
4. Resultado esperado
5. Evidências
   - print, log, request/response, stack trace

Modelo:

- Passos:
  1. ...
  2. ...
  3. ...
- Resultado atual: ...
- Resultado esperado: ...

Exemplo real (telefone):

- Passos:
  1. abrir /register
  2. inserir telefone muito longo
  3. tentar enviar
- Resultado atual (bug): campo aceitava valor inválido
- Resultado esperado: bloquear dígitos excedentes e rejeitar telefone inválido

---

## 13) Testes automatizados

## 13.1 Monorepo (cobertura consolidada)

Na raiz:

```bash
npm run test:coverage
```

## 13.2 Backend

```bash
npm run test --workspace=backend
npm run test:coverage --workspace=backend
npm run test:watch --workspace=backend
```

## 13.3 Frontend

```bash
npm run test --workspace=frontend
npm run test:coverage --workspace=frontend
npm run test:watch --workspace=frontend
```

## 13.4 Front admin

```bash
npm run test --workspace=front_admin
npm run test:coverage --workspace=front_admin
```

## 13.5 Testes de integração e E2E

- Integração: existe no backend (backend/tests/integration).
- E2E browser (Playwright/Cypress): não há suíte E2E ativa/versionada no estado atual do repositório.

---

## 14) Checklist antes de abrir Pull Request

Use esta checklist:

- [ ] Projeto instala do zero (npm install)
- [ ] App sobe localmente (npm run dev) ou Docker completo
- [ ] Backend responde /health
- [ ] Frontend abre sem erro crítico
- [ ] Testes do escopo alterado passando
- [ ] Cobertura mantida para o escopo afetado
- [ ] Lint sem erros no frontend/front_admin
- [ ] Sem erro de TypeScript no escopo alterado
- [ ] Funcionalidade validada manualmente
- [ ] Sem regressões observáveis
- [ ] Logs limpos (sem erro não tratado)

---

## Comandos úteis extras

Builds:

```bash
npm run build:frontend
npm run build:front_admin
```

Validação rápida da raiz:

```bash
npm run validate
```

Electron:

```bash
npm run electron
npm run electron:dev
```

---

## Referências do projeto

- README.md (visão geral)
- BACKEND.md (detalhes da API)
- SCRAPER.md (detalhes do scraper-go)
- TESTING.md (roteiro de QA)
- frontend/README.md
- front_admin/README.md

---

## Lacunas identificadas no estado atual (sem suposição)

1. Não há front_admin/.env.example versionado.
2. Não há suíte E2E browser ativa/versionada.
3. Há documentação antiga em alguns pontos com prefixo /api que pode divergir das rotas montadas em runtime (que usam /auth, /users, /jobs, etc.).
4. O Swagger em /docs hoje só documenta /health, /jobs/search e /keywords — as demais rotas (auth, users, saved-jobs, notifications, admin) não têm anotações Swagger (ver seção 6.1).

Se você for manter este guia, priorize resolver essas lacunas para reduzir tempo de onboarding.
