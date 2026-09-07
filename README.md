# <Cand!Date!>

> Novo no projeto? Comece por aqui: [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)

[![CI](https://github.com/Cla-Code-Community/candidate/actions/workflows/ci.yml/badge.svg)](https://github.com/Cla-Code-Community/candidate/actions/workflows/ci.yml)
![Node >= 22](https://img.shields.io/badge/node-%3E%3D22-339933)
![Monorepo](https://img.shields.io/badge/architecture-monorepo-0A66C2)
![License ISC](https://img.shields.io/badge/license-ISC-lightgrey)

**Documentação**:
[README](README.md) |
[SCRAPER](SCRAPER.md) |
[BACKEND](BACKEND.md) |
[TESTING](TESTING.md) |
[CONTRIBUTING](contribuition.md) |
[ESCOPO](ESCOPO.md) |
[SECURITY](SECURITY.md) |
[Frontend](frontend/README.md) |
[Frontend Architecture](frontend/ARCHITECTURE.md) |
[Front Admin](front_admin/README.md)

Plataforma de captura, agregação e consulta de vagas com arquitetura monorepo, composta por frontend web, API Node.js, scraper Go, painel administrativo e aplicação desktop com Electron.

O produto evoluiu para um modelo orientado a serviços (API + scraper Go + cache/índices), com autenticação, preferências de usuário e integração com banco de dados.

## Links oficiais

- Gestão de produto (Linear): <https://linear.app/tatame/team/PAV/all>
- Guia do usuário — Linear e integração com GitHub: [GUIA-LINEAR-GITHUB.md](GUIA-LINEAR-GITHUB.md)
- Design system oficial (Figma): <https://www.figma.com/design/gollJBtK8PGkffNN4zk9t9/Painel-Dev---releitura?node-id=0-1&p=f&t=zU8zrFzPsNPxZ3qU-0>
- Documentação backend detalhada: [BACKEND.md](BACKEND.md)
- Documentação scraper Go: [SCRAPER.md](SCRAPER.md)
- Guia de testes: [TESTING.md](TESTING.md)
- Documentação inicial do MVP (Visão PO) [ESCOPO.md](ESCOPO.md)

## Sumário

- [Visão geral](#visão-geral)
- [Arquitetura do monorepo](#arquitetura-do-monorepo)
- [Stack real do projeto](#stack-real-do-projeto)
- [Quickstart local](#quickstart-local)
- [Comandos verificados](#comandos-verificados)
- [API backend (estado atual)](#api-backend-estado-atual)
- [Docker (infra + aplicação)](#docker-infra--aplicação)
- [Desktop com Electron](#desktop-com-electron)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Testes e qualidade](#testes-e-qualidade)
- [Fluxo de desenvolvimento e branching](#fluxo-de-desenvolvimento-e-branching)
- [Git Hooks e qualidade local](#git-hooks-e-qualidade-local)
- [Roadmap técnico sugerido](#roadmap-técnico-sugerido)
- [Contribuição](#contribuição)

## Visão geral

Este repositório centraliza as frentes principais do produto:

- `frontend`: aplicação web para usuários finais, com landing page, autenticação e dashboard de vagas. A nova estrutura de painel do frontend fica em `frontend/src/domains/new_dashboard`.
- `backend`: API Node.js/Express com autenticação, perfis, preferências, vagas salvas, notificações, rotas admin e observabilidade.
- `scraper-go`: serviço Go de scraping multi-fonte, cache, deduplicação e indexação em Valkey.
- `front_admin`: painel administrativo para operação, usuários, permissões, scrapers, auditoria e observabilidade.
- `electron`: shell desktop que empacota a experiência principal.

Objetivo de produto: fornecer uma base robusta para busca, filtragem e gestão de vagas com foco em qualidade de dados, escalabilidade e operação contínua.

## Arquitetura do monorepo

```text
.
├─ frontend/                # Dashboard web (React + Vite)
├─ backend/                 # API Node.js (Express + TS + Drizzle)
├─ scraper-go/              # Serviço Go de scraping multi-fonte
├─ front_admin/             # Painel administrativo (React + Vite)
├─ electron/                # Shell desktop
├─ docker-compose.yml       # App stack (frontend + front_admin + backend + scraper-go)
├─ docker-compose.infra.yml # Infra stack (Postgres + Valkey)
├─ docker-compose.migrate.yml # Migration job do backend
└─ .github/workflows/ci.yml # CI
```

## Stack real do projeto

- Frontend: React 19, TypeScript, Vite 8, Tailwind CSS, Vitest.
- Front admin: React 19, TypeScript, Vite 8, Tailwind CSS 4, Vitest.
- Backend: Node.js 22+, Express 5, TypeScript, Drizzle ORM, Zod, Iron Session, Redis/Valkey.
- Scraping: Go (serviço dedicado em scraper-go).
- Desktop: Electron + Electron Builder.
- Qualidade: Vitest (frontend/backend/front_admin), cobertura v8, ESLint (frontend/front_admin), GitHub Actions CI.
- Dados: Postgres (persistência) + Valkey/Redis (cache e índice).

## Quickstart local

### Pré-requisitos

- Node.js >= 22
- npm
- Docker Desktop com Docker Compose

### Caminho recomendado: stack completa com Docker

Use este fluxo para subir Postgres, Valkey, scraper Go, backend, frontend e front_admin com a mesma rede Docker.

1 - Instale as dependências locais:

```bash
npm install
```

2 - Crie o `.env` da raiz a partir do exemplo versionado:

```bash
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3 - Crie a rede Docker compartilhada, se ela ainda não existir:

```bash
docker network create vagas-net
```

Se a rede já existir, o Docker vai avisar e você pode seguir para o próximo passo.

4 - Suba Postgres, Valkey, scraper, backend, frontend e front_admin:

```bash
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml up --build -d
```

5 - Acesse os serviços:

- Frontend: <http://localhost:5173>
- Front admin: <http://localhost:5174>
- Backend health: <http://localhost:3001/health>
- Scraper health: <http://localhost:8081/health>
- Vagas salvas no scraper: <http://localhost:8081/admin/jobs/count>

### Desenvolvimento com Node local

Use este fluxo quando quiser rodar frontend/backend fora do Docker. Mantenha Postgres e Valkey ativos no Docker e configure URLs locais nos arquivos `.env`.

Arquivos esperados:

- `.env`: usado pela infra/scraper e por comandos auxiliares.
- `backend/.env`: usado pelo backend local.
- `frontend/.env`: usado pelo Vite local.
- `front_admin` usa `VITE_API_URL`, mas ainda não possui `.env.example` próprio.

Criação dos arquivos locais:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

No Windows PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Comandos:

```bash
npm run dev
```

Esse comando sobe apenas o necessário para a maioria das contribuições: frontend e backend.

Para trabalhar também no painel administrativo:

```bash
npm run dev:admin
```

Execução separada:

```bash
npm run dev:frontend
npm run dev:backend
npm run dev:front_admin
```

### Execução de testes

```bash
npm run test:coverage
```

### Instalação limpa e CI

Para onboarding e desenvolvimento local, prefira `npm install`.

Use `npm ci` em automações como GitHub Actions, Docker/deploy ou quando quiser reinstalar tudo exatamente a partir do `package-lock.json`. Ele remove `node_modules`, não altera o lockfile e falha se `package.json` e `package-lock.json` estiverem fora de sincronia.

## Comandos verificados

Os comandos abaixo existem hoje no repositório e foram conferidos nos `package.json` da raiz, backend, frontend e front_admin.

### Raiz

- npm run dev
- npm run dev:admin
- npm run dev:frontend
- npm run dev:backend
- npm run dev:front_admin
- npm run scraper
- npm run scraper:watch
- npm run test
- npm run test:coverage
- npm run build
- npm run build:frontend
- npm run build:front_admin
- npm run validate
- npm run electron
- npm run electron:dev
- npm run dist
- npm run db:generate
- npm run db:migrate
- npm run db:push

### Backend

- npm run start
- npm run dev
- npm run api
- npm run test
- npm run test:coverage
- npm run test:watch
- npm run validate
- npm run db:generate
- npm run db:migrate
- npm run db:push

### Frontend

- npm run dev
- npm run build
- npm run lint
- npm run preview
- npm run test
- npm run test:coverage
- npm run test:watch

### Front admin

- npm run dev
- npm run build
- npm run lint
- npm run test
- npm run test:coverage
- npm run preview

## API backend (estado atual)

Base: /

Sistema:

- GET /health

Autenticação:

- GET /auth/:provider/url
- GET /auth/:provider/callback
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- GET /auth/me

Usuários:

- GET /users/profile
- PATCH /users/profile
- GET /users/preferences
- POST /users/preferences
- PATCH /users/preferences

Jobs:

- GET /jobs/search
  - Busca vagas nos índices do Valkey e aceita filtros por `keywords`, `family`, `technology`, `seniority`, `level`, `location`, `country`, `type`/`model`, `contract` e ordenação por `matchSort`.

Keywords:

- GET /keywords
- POST /keywords

Saved jobs:

- GET /saved-jobs
- GET /saved-jobs/:id
- POST /saved-jobs
- PATCH /saved-jobs/:id
- DELETE /saved-jobs/:id

Admin:

- GET /admin/users
- GET /admin/users/:id
- PATCH /admin/users/:id/block
- PATCH /admin/users/:id/unblock
- POST /admin/users/:id/reset
- POST /admin/scrapers/run
- GET /admin/observability/metrics
- GET /admin/observability/dashboards
- GET /admin/audit
- GET /admin/permissions/rules

Swagger:

- GET /docs

### Versionamento da API

Os endpoints públicos usam o prefixo `/api/v1` (por exemplo,
`GET /api/v1/jobs/search`). A interface Swagger está disponível em `GET /docs`
e documenta essa versão. As rotas sem prefixo permanecem temporariamente por
compatibilidade com clientes existentes.

Para atualizar a documentação, altere os schemas e rotas em
`backend/src/swagger.ts` ou as anotações `@swagger` das rotas e reinicie o
backend. Em desenvolvimento, acesse a interface em
`http://localhost:3001/docs`.

## Docker (infra + aplicação)

Este projeto separa infraestrutura e aplicação em dois arquivos Compose:

- `docker-compose.infra.yml`: Postgres + Valkey.
- `docker-compose.yml`: scraper Go + backend + frontend + front_admin.
- `docker-compose.migrate.yml`: job de migrations do backend.

Subir infraestrutura, migrations e aplicação:

```bash
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml up --build -d
```

O serviço `migrate` executa `npm run db:migrate` e `npm run security:backfill-user-pii -- --write` depois que o Postgres fica saudável. O backend só inicia depois que esse job termina com sucesso.

Se quiser subir apenas a infraestrutura:

```bash
docker compose -f docker-compose.infra.yml up -d
```

Se quiser subir a aplicação sem o job de migrations:

```bash
docker compose up --build -d
```

Ver logs:

```bash
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml logs -f migrate
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml logs -f backend
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml logs -f frontend
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml logs -f front_admin
docker compose -f docker-compose.infra.yml -f docker-compose.yml -f docker-compose.migrate.yml logs -f scraper-go
```

Encerrar:

```bash
docker compose down
docker compose -f docker-compose.infra.yml down
```

Observação: os volumes Docker preservam os dados do Postgres e do Valkey entre execuções. Se você alterar `POSTGRES_USER`, `POSTGRES_PASSWORD` ou `POSTGRES_DB` depois da primeira inicialização, será necessário recriar o volume do Postgres ou manter os valores antigos.

Dentro dos containers, serviços devem usar os nomes da rede Docker:

- Postgres: `postgres:5432`
- Valkey: `valkey:6379`
- Scraper: `scraper-go:8081`

Por isso o `docker-compose.yml` e o `docker-compose.migrate.yml` sobrescrevem variáveis como `DATABASE_URL`, `VALKEY_URL`, `GO_SCRAPER_URL` e `SCRAPER_URL` para os valores internos corretos.

Serviços padrão:

- Frontend: <http://localhost:5173>
- Front admin: <http://localhost:5174>
- Backend: <http://localhost:3001>
- Scraper Go: <http://localhost:8081>

Endpoints úteis do scraper:

- Health: <http://localhost:8081/health>
- Status da execução: <http://localhost:8081/admin/scrape/status>
- Contagem de vagas salvas: <http://localhost:8081/admin/jobs/count>
- Lista de vagas salvas: <http://localhost:8081/admin/jobs>

## Desktop com Electron

O app desktop empacota frontend + backend e inicia a aplicação com Electron.

Comandos:

```bash
npm run build:frontend
npm run electron
```

Distribuição (Windows):

```bash
npm run dist
```

Saída esperada do instalador:

- dist-electron/Vagas Full Setup X.X.X.exe

## Variáveis de ambiente

Arquivos de exemplo:

- .env.example
- backend/.env.example
- frontend/.env.example

Arquivos locais ignorados pelo Git:

- .env
- backend/.env
- frontend/.env
- front_admin/.env, se criado localmente

Uso recomendado:

- Docker Compose: copie `.env.example` para `.env`. O Compose usa esse arquivo para infra, scraper, backend e build do frontend.
- Backend local via Node: use `backend/.env`.
- Frontend local via Vite: use `frontend/.env`.
- Front admin local via Vite: crie `front_admin/.env` com `VITE_API_URL=http://localhost:3001` quando precisar sobrescrever o padrão.

Variáveis centrais de operação:

- DATABASE_URL
- VALKEY_URL
- GO_SCRAPER_URL
- SESSION_SECRET
- CORS_ALLOWED_ORIGINS
- SEARCH_LOCATION
- SEARCH_GEO_ID
- SEARCH_LANGUAGE
- REMOTE_ONLY
- JOB_TYPES
- TIME_FILTER
- WAIT_BETWEEN_SEARCHES_MS
- PAGE_TIMEOUT_MS
- MAX_PAGES_PER_KEYWORD
- LINKEDIN_KEYWORD_SLOT_SIZE
- ADZUNA_KEYWORD_SLOT_SIZE
- GUPY_ENABLED
- GUPY_RAW_DISCOVERY_ENABLED
- GUPY_FULL_SWEEP_ENABLED
- GUPY_FULL_REMOTE_SWEEP_ENABLED
- GUPY_QUERY_LIMIT
- INHIRE_ENABLED
- INHIRE_ENRICH_DETAILS
- GREENHOUSE_ENABLED
- LEVER_ENABLED
- CACHE_TTL_MS
- VITE_API_BASE_URL
- VITE_API_URL
- VITE_API_PROXY_TARGET
- VITE_APP_ENV

Segurança operacional:

- Nunca versionar segredos reais no Git.
- Preferir acesso interno para banco/cache em VPS.
- Em ambiente externo, usar TLS para conexões de dados sempre que possível.

Observação operacional do scraper:

- O padrão atual privilegia resposta rápida e estabilidade. LinkedIn e Adzuna usam slots rotativos de keywords por execução, e Gupy limita a quantidade de queries expandidas por rodada. Isso reduz cobertura imediata por execução, mas evita milhares de requests em uma única rodada e distribui a coleta ao longo das próximas execuções.
- `tools/` e `data/` são ignorados pelo Git. Scripts versionados não devem depender de arquivos nessas pastas, a menos que sejam tratados como utilitários locais opcionais.

## Testes e qualidade

Estrutura:

- backend/tests/unit
- backend/tests/integration
- frontend/tests/unit
- frontend/tests/integration
- front_admin/tests

Threshold mínimo:

- lines >= 80%
- statements >= 80%
- functions >= 80%
- branches >= 80%

Comandos:

```bash
npm run test:coverage
npm --workspace frontend run test:coverage
npm --workspace backend run test:coverage
npm --workspace front_admin run test:coverage
```

Observação importante: o backend já está configurado para coletar cobertura apenas em src/**/*.ts, evitando contagem de artefatos gerados.

## CI/CD

Workflow atual: .github/workflows/ci.yml

Executa em push para master/develop e em pull_request:

- Instalação de dependências
- Coverage frontend
- Coverage backend
- Lint frontend
- Build frontend

Observação: o painel admin já possui testes e build próprios, mas ainda deve ser incluído no fluxo de validação/CI quando se tornar parte obrigatória do release.

## Fluxo de desenvolvimento e branching

Padrão oficial:

1. Abrir card no Linear: <https://linear.app/tatame/team/PAV/all>
2. Criar branch de feature a partir de master
3. Desenvolver e testar localmente
4. Abrir PR da feature para develop
5. Após aprovação e validação, merge em develop
6. Abrir PR de develop para master
7. Merge em master para release

Convenção recomendada de branch:

- feature/{id-do-card}-{descricao-curta}

## Git Hooks e qualidade local

O repositório usa Husky na raiz do monorepo para padronizar validações locais em qualquer branch.

Hooks configurados:

- pre-commit: executa lint-staged para validar arquivos staged do frontend.
- commit-msg: valida mensagem de commit com commitlint (Conventional Commits).
- pre-push: executa validação do monorepo (test backend + lint/build frontend).

Bootstrap local com instalação e hooks:

```bash
npm run setup:dev
```

Checklist quando hooks não disparam:

1. Validar se o diretório Git foi detectado: git rev-parse --git-dir.
2. Validar hooksPath local: git config --get core.hooksPath.
3. Confirmar arquivos versionados em .husky (pre-commit, commit-msg, pre-push).
4. Reinstalar hooks: npm run prepare.
5. Em Windows, preferir Git Bash para depuração de scripts shell.

Observação importante:

- CI continua obrigatório e independente de hooks locais. Mesmo com bypass local, o pipeline valida cobertura/lint/build antes de merge.

## Roadmap técnico sugerido

### DX e onboarding

- Adicionar script único de bootstrap (exemplo: npm run setup:dev) para criar .env e validar pré-requisitos.
- Adicionar verificação automática de scripts quebrados no CI.
- Padronizar comandos cross-platform (evitar dependência de sintaxe de variável de ambiente Unix em scripts críticos).

### Segurança

- Aplicar política de rotação de SESSION_SECRET e credenciais OAuth.
- Adicionar checklist de segurança para PRs (cookies, CORS, secrets, headers).

### Performance

- Definir estratégia de paginação e filtros em camada de API com métricas por endpoint.
- Revisar TTL e cardinalidade dos índices no Valkey para reduzir consumo de memória.

### Observabilidade

- Padronizar correlação de logs por request id.
- Publicar guia mínimo de troubleshooting com sinais de saúde dos serviços frontend/backend/scraper-go.

## Contribuição

1. Abra um card no Linear.
2. Crie branch a partir de master.
3. Implemente com testes.
4. Execute validações locais:

```bash
npm run validate
npm run test:coverage
```

5. Abra PR para develop com contexto técnico objetivo.

---

Se você vai trabalhar em backend, scraper ou testes, use também:

- [BACKEND.md](BACKEND.md)
- [SCRAPER.md](SCRAPER.md)
- [frontend/README.md](frontend/README.md)
- [front_admin/README.md](front_admin/README.md)
- [TESTING.md](TESTING.md)
