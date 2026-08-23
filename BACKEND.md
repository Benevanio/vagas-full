# Backend - Documentação

Este documento descreve as principais funcionalidades, rotas, módulos e variáveis de ambiente do backend do projeto.

**Localização do código**: [backend](backend)

## Visão geral

- API REST em Express (TypeScript).
- Scraper externo em Go integrado via HTTP (`GO_SCRAPER_URL`).
- Banco de dados gerenciado com Drizzle (Postgres).
- Autenticação via OAuth (Google/GitHub/LinkedIn) e credenciais (email/senha) com `iron-session`.
- Cache/índices em memória (Redis) e integração com sistema Valkey para pesquisa rápida.
- Rotas administrativas para usuários, permissões, scrapers, auditoria e observabilidade.
- Métricas Prometheus em `/metrics`.
- Documentação OpenAPI/Swagger disponível em `/docs` (quando habilitado).

## Como executar (rápido)

Requisitos: Node.js >= 22, PostgreSQL, Redis (opcional para cache), Go scraper (opcional)

Instalar dependências e rodar API:

```bash
cd backend
npm install
npm run dev   # inicia em modo de desenvolvimento
# ou
npm start     # inicia a API
```

Rodar scraper (local):

```bash
npm run scraper
```

Testes:

```bash
npm test
npm run test:watch
```

Scripts relevantes em `backend/package.json`:

- `start`, `dev`, `api` — iniciar servidor
- `scraper`, `scraper:watch` — executar scraper (index.ts / Go)
- `test`, `test:coverage`, `test:watch` — testes com Vitest
- `db:generate`, `db:migrate`, `db:push` — comandos Drizzle
- `security:backfill-user-pii` — backfill de campos de PII criptografados

## Arquitetura e módulos principais

- `src/app.ts` — monta a aplicação Express, middlewares e rotas.
- `src/server.ts` — inicia o servidor e registra Swagger (`/docs`).
- `src/config.ts` — leitura e validação das variáveis de ambiente.
- `src/swagger.ts` — gera especificação OpenAPI via `swagger-jsdoc`.

Módulos principais:

- `src/modules/auth` — OAuth providers, `AuthController`, `AuthService`, `credentials` (registro/login/logout).
- `src/modules/users` — perfis e preferências do usuário (`UsersController`, `UsersService`).
- `src/modules/savedJobs` — CRUD de vagas salvas (`SavedJobsController`, `SavedJobsService`).
- `src/modules/notifications` — notificações do usuário autenticado.
- `src/modules/jobs` — busca, parsing de filtros, fallback pós-filtro e regras de matching/score de vagas.
- `src/modules/admin` — usuários admin, permissões, scrapers, auditoria, dashboard e observabilidade.

Adaptadores externos:

- `src/adapters/goScraper.ts` — envia requisições para o serviço Go que faz o scraping (`/scrape`).
- `src/adapters/goKeywords.ts` — carrega e envia keywords do/para o serviço Go.

Database / Schemas (Drizzle):

- `src/db/schema/users.ts` — tabela `users`.
- `src/db/schema/credentials.ts` — credenciais (email, hash).
- `src/db/schema/keywords.ts` — palavras-chave (fonte `user|scraper`).
- `src/db/schema/savedJobs.ts` — vagas salvas (`saved_jobs`) e enum `status`.
- Migrações e snapshots em `drizzle/`.

Cache & Indexes:

- `src/lib/cache.ts` — helpers para Redis/Valkey; usado pelo módulo de jobs para obter ids e buscar vagas em memória.
- Busca por palavras-chave usa índices invertidos e interseção para eficiência.
- Filtros estruturados podem usar índices por família (`family`), tecnologia (`technology`), senioridade (`seniority`), localização, modelo e contrato.

## Módulo de E-mail

Módulo centralizado em `src/modules/email` para envio de e-mails transacionais de forma **assíncrona e resiliente**. Qualquer módulo do backend consome a mesma API interna (`emailService`), sem conhecer o provedor.

**Fluxo:** `emailService.send()` valida e enfileira um job na fila BullMQ `email` (sobre Valkey, via `ioredis`) → um worker in-process (`startEmailWorker`, iniciado no boot do `server.ts`) renderiza o template react-email e despacha pelo `MailProvider` configurado. Falha do provedor aciona retry com backoff exponencial; no fracasso final apenas loga. Falha ao enfileirar (ex.: Valkey indisponível) é logada e **não** propaga para o fluxo de negócio chamador.

**Arquivos:**

- `email.service.ts` — API interna (`emailService.send` / `sendWelcome`).
- `email.queue.ts` — fila BullMQ + conexão `ioredis` dedicada (`getEmailQueue`, `enqueueEmail`, `closeEmailQueue`).
- `email.worker.ts` — worker in-process (`startEmailWorker`, `stopEmailWorker`).
- `providers/mail-provider.ts` — interface `MailProvider` + `getMailProvider()` (seleciona `ResendProvider` se `EMAIL_API_KEY` presente, senão `NoopProvider`).
- `providers/resend.provider.ts`, `providers/noop.provider.ts` — provedores concretos.
- `templates/registry.ts` + `templates/*.tsx` — templates react-email e lookup por nome.

**Uso (API interna):**

```ts
import { emailService } from "./modules/email/email.service";

// Envio genérico: valida `to` (formato) e `template` (existe no registry).
await emailService.send({
  template: "welcome",
  to: "usuario@exemplo.com",
  data: { name: "Ana", appUrl: "https://painelvagas.com" },
});

// Açúcar para boas-vindas: injeta `appUrl` a partir de FRONTEND_URL.
await emailService.sendWelcome({ email: "usuario@exemplo.com", name: "Ana" });
```

`send` resolve sem aguardar a entrega. `to` inválido ou `template` desconhecido lançam `AppError.validation` (antes de enfileirar).

**Variáveis de ambiente:**

- `EMAIL_API_KEY` — chave da Resend. Vazia ⇒ `NoopProvider` (apenas loga; não envia, não quebra o boot).
- `EMAIL_FROM_ADDRESS` — endereço remetente (ex.: `no-reply@painelvagas.com`).
- `EMAIL_FROM_NAME` — nome exibido do remetente (ex.: `Painel Vagas`).
- `EMAIL_QUEUE_ATTEMPTS` — nº de tentativas do job (padrão `3`).
- `FRONTEND_URL` — reusada para o botão "Acessar plataforma" do template de boas-vindas (nenhuma env de URL nova é criada).

**Adicionar um novo template:**

1. Crie o componente react-email em `src/modules/email/templates/<nome>.tsx` (props tipadas), reusando `BaseLayout`.
2. Registre-o no mapa `templates` de `registry.ts` (subject + component) e adicione as props em `TemplateDataMap`. O `TemplateName` e `isTemplate` passam a reconhecê-lo automaticamente.
3. Consuma via `emailService.send({ template: "<nome>", to, data })`.

**Adicionar um novo provider:**

1. Implemente a interface `MailProvider` (`send({ to, subject, html, replyTo? })`) em `src/modules/email/providers/<nome>.provider.ts`. Em falha, **lance** (para o BullMQ re-tentar).
2. Ajuste `getMailProvider()` em `mail-provider.ts` para selecioná-lo pela configuração. Nenhum caller precisa mudar (contrato via interface).

## Middlewares

- `withSession` — integra `iron-session` (sessões + cookie `vagas_session`).
- `requireAuth` — valida autenticação nas rotas que exigem usuário.
- `securityHeaders` — cabeçalhos de segurança.
- `cors` — configuração de CORS (opções em `src/middleware/cors.ts`).
- `requestId` — correlação de requisições.
- `metrics` — coleta de métricas Prometheus.
- `errorHandler` — tratamento centralizado de erros.

## Endpoints principais

Base: `/`

- Sistema
  - `GET /health` — verifica disponibilidade (retorna `{ ok: true }`).
  - `GET /metrics` — métricas Prometheus.
  - `GET /docs` — UI do Swagger (quando habilitado).

- Auth / OAuth
  - `GET /auth/:provider/url` — retorna URL de autenticação (ex: `google`, `github`, `linkedin`).
  - `GET /auth/:provider/callback` — callback OAuth — processa código/state e cria sessão.

- Credenciais (email/senha)
  - `POST /auth/register` — registra usuário (cria `users`, `credentials`, `userPreferences`) e inicia sessão.
  - `POST /auth/login` — autentica e inicia sessão.
  - `POST /auth/logout` — destroi sessão.
  - `GET /auth/me` — retorna id do usuário autenticado.

- Usuários
  - `GET /users/profile` — retorna perfil do usuário autenticado.
  - `PATCH /users/profile` — atualiza campos do perfil.
  - `GET /users/preferences` — obtém preferências do usuário.
  - `POST /users/preferences` — cria preferências (caso não existam).
  - `PATCH /users/preferences` — atualiza preferências.

- Jobs
  - `GET /jobs/search?keywords=...` — busca vagas utilizando índices/Valkey/Redis. Retorna paginação e fonte (`source`).
  - Filtros aceitos incluem `keywords`, `family`, `technology`, `seniority`, `level`, `location`, `country`, `state`, `city`, `type`/`model`, `contract`/`contractType`/`jobTypes` e `matchSort`.

- Keywords
  - `GET /keywords` — lista keywords persistidas no banco.
  - `POST /keywords` — enfileira uma keyword para processamento pelo serviço Go (retorna 202).

- Notificações
  - `GET /notifications` — lista notificações do usuário autenticado.
  - `PATCH /notifications/:id/read` — marca uma notificação como lida.
  - `PATCH /notifications/read-all` — marca todas como lidas.
  - `DELETE /notifications` — limpa notificações conforme filtros aceitos.

- Vagas salvas (Saved Jobs)
  - `GET /saved-jobs` — lista vagas salvas do usuário.
  - `GET /saved-jobs/:id` — obtém vaga salva por id.
  - `POST /saved-jobs` — cria nova vaga salva.
  - `PATCH /saved-jobs/:id` — atualiza vaga salva.
  - `DELETE /saved-jobs/:id` — remove vaga salva.

- Admin
  - `GET /admin/users` — lista usuários.
  - `GET /admin/users/:id` — obtém usuário por id.
  - `PATCH /admin/users/:id/block` — bloqueia usuário.
  - `PATCH /admin/users/:id/unblock` — desbloqueia usuário.
  - `POST /admin/users/:id/reset` — reseta credenciais/senha conforme regra do serviço.
  - `POST /admin/scrapers/run` — dispara execução dos scrapers.
    - Sucesso: `202` com `{ ok: true, message }`.
    - Execução concorrente: `409` com `{ ok: false, code: "SCRAPER_ALREADY_RUNNING", message }`.
    - Lock/Valkey indisponível: `503` com `{ ok: false, code: "SCRAPER_RUN_LOCK_UNAVAILABLE", message }`.
  - `POST /admin/scrapers/:id/run` — aplica o mesmo contrato ao scraper nomeado (`go-scraper`).
  - `GET /admin/observability/metrics` — visão de métricas administrativas.
  - `GET /admin/observability/dashboards` — lista dashboards de observabilidade.
  - `GET /admin/audit` — consulta logs de auditoria.
  - `GET /admin/permissions/rules` — lista regras de permissão.

Observações de segurança nas rotas:

- Rotas sob `/users`, `/jobs`, `/keywords`, `/notifications`, `/saved-jobs` e `/admin` usam `withSession` + `requireAuth` (quando aplicável).
- `auth` usa `withSession` para armazenar OAuth state e criar sessão.

## Variáveis de ambiente importantes

Definidas/consumidas em `src/config.ts` e outros módulos:

- `HEADLESS` — modo headless do scraper (bool).
- `WAIT_BETWEEN_SEARCHES_MS` — intervalo entre buscas (ms).
- `PAGE_TIMEOUT_MS` — timeout de página (ms).
- `MAX_PAGES_PER_KEYWORD` — limite de páginas por keyword.
- `VIEWPORT_WIDTH`, `VIEWPORT_HEIGHT` — dimensões do browser.
- `SEARCH_LOCATION`, `SEARCH_GEO_ID`, `SEARCH_LANGUAGE` — parâmetros de busca.
- `REMOTE_ONLY` — filtrar vagas remotas.
- `JOB_TYPES` — filtros de tipo de vaga.
- `TIME_FILTER` — filtro temporal (ex: `r604800`).
- `DATABASE_URL` — conexão com Postgres.
- `VALKEY_URL` — endpoint do Valkey (cache e fila de e-mail via BullMQ).
- `FRONTEND_URL` — URL do frontend; reusada no CTA do e-mail de boas-vindas.
- `EMAIL_API_KEY` — chave da Resend (vazio ⇒ envio no-op logado).
- `EMAIL_FROM_ADDRESS` — endereço remetente dos e-mails.
- `EMAIL_FROM_NAME` — nome exibido do remetente.
- `EMAIL_QUEUE_ATTEMPTS` — tentativas por job de e-mail (padrão 3).
- `GO_SCRAPER_URL` — URL do serviço Go que realiza scraping.
- `SESSION_SECRET` — senha para `iron-session` (obrigatória em produção).
- `ENCRYPTION_MASTER_KEY`, `ENCRYPTION_KEY_ID`, `SEARCH_KEY` — criptografia e campos pesquisáveis de PII.
- `CORS_ALLOWED_ORIGINS` — origens permitidas, incluindo `http://localhost:5173` e `http://localhost:5174` em desenvolvimento local com admin.
- `PROMETHEUS_URL` — integração com Prometheus para rotas de observabilidade.
- `PORT` — porta do servidor (padrão 3001).

## Segurança e criptografia

- Senhas armazenadas usando Argon2 (`argon2`), com opções configuradas no serviço de credenciais.
- Cookies de sessão `httpOnly` e `secure` quando NODE_ENV=production.
- Índices únicos e constraints no DB (ex: email/username/keyword uniques) definidos nas tabelas Drizzle.
- Campos sensíveis de perfil usam criptografia e hashes pesquisáveis onde aplicável.

## Integração com serviço Go

- `goScraper.ts` faz POST em `${GO_SCRAPER_URL}/scrape` com `ScrapeParams` e valida `ScrapeResponse`.
- `goKeywords.ts` consulta e publica keywords via endpoints do serviço Go (`/api/keywords`).
- O backend lê os índices criados pelo scraper no Valkey, incluindo `scraper:jobs:keyword:*`, `scraper:jobs:family:*`, `scraper:jobs:technology:*` e `scraper:jobs:seniority:*`.
- Disparos administrativos usam `scraperClient` e preservam os códigos operacionais do serviço Go. O código `SCRAPER_ALREADY_RUNNING` é um conflito esperado; `SCRAPER_RUN_LOCK_UNAVAILABLE` indica política fail-closed e não inicia coleta.

## Banco de dados

- Uso de Drizzle ORM com tipos gerados em `src/db/schema`.
- Tabelas: `users`, `credentials`, `keywords`, `saved_jobs`, `user_preferences`, etc.
- Migrations em `drizzle/`.

## Logs e observabilidade

- `src/logger.ts` exporta `logInfo`, `logWarn`, etc.
- Erros críticos são logados; rotas tratam respostas e retornam mensagens amigáveis.

## Testes

- Testes unitários e de integração com `vitest` em `tests/`.
- Cobertura configurada em `test:coverage`.

## Docker / Infra

- `backend/Dockerfile` existe para o backend.
- O fluxo Docker principal usa `docker/node.Dockerfile` com targets para backend, frontend e admin.
- `docker-compose.yml` no projeto raiz orquestra `scraper-go`, `backend`, `frontend` e `front_admin`.
- `docker-compose.infra.yml` sobe Postgres e Valkey.
- `docker-compose.migrate.yml` executa migrations e backfill antes do backend.

## Pontos de atenção / Próximos passos sugeridos

- Garantir `SESSION_SECRET` seguro em produção.
- Documentar contrato do Valkey (se for serviço externo) e endpoints do Go scraper com exemplos de payload.
- Adicionar exemplos de requests/responses no Swagger para endpoints críticos (auth, jobs/search).

---

Para editar ou complementar esta documentação, abra [backend/BACKEND.md](backend/BACKEND.md).

## Exemplos de Request / Response

Seguem exemplos práticos para os endpoints mais usados. Ajuste `HOST` para seu ambiente (ex: `http://localhost:3001`).

- Registrar (credentials)

Request:

POST /auth/register

```json
{
  "email": "user@example.com",
  "password": "StrongP@ssw0rd",
  "name": "Fulano"
}
```

Response (201):

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Fulano",
    "username": "fulano",
    "emailVerified": false
  },
  "session": { "userId": "uuid" }
}
```

- Login (credentials)

Request:

POST /auth/login

```json
{
  "email": "user@example.com",
  "password": "StrongP@ssw0rd"
}
```

Response (200):

```json
{
  "user": { "id": "uuid", "email": "user@example.com", "username": "fulano" },
  "session": { "userId": "uuid" }
}
```

- Buscar vagas (Jobs search)

Request:

GET /jobs/search?keywords=react,node&page=1&limit=10

Response (200):

```json
{
  "total": 123,
  "page": 1,
  "limit": 10,
  "totalPages": 13,
  "hasNext": true,
  "hasPrev": false,
  "jobs": [ { "id": "job-id", "title": "Frontend Developer", "company": "ACME" } ],
  "source": "valkey_filtered_by_keywords:react+node"
}
```

- Enfileirar keyword

Request:

POST /keywords

```json
{
  "keyword": "typescript"
}
```

Response (202):

```json
{
  "ok": true,
  "message": "Keyword enfileirada para processamento."
}
```

- Vagas salvas (Saved Jobs) — criar

Request:

POST /saved-jobs

```json
{
  "jobLink": "https://www.linkedin.com/jobs/view/123",
  "jobTitle": "Backend Developer",
  "company": "ACME",
  "location": "São Paulo",
  "source": "linkedin",
  "keyword": "node"
}
```

Response (201):

```json
{
  "id": "uuid",
  "userId": "uuid",
  "jobLink": "https://...",
  "jobTitle": "Backend Developer",
  "company": "ACME",
  "location": "São Paulo",
  "status": "saved",
  "createdAt": "2026-05-26T..."
}
```

- Perfil do usuário

Request:

GET /users/profile

Response (200):

```json
{
  "id": "uuid",
  "displayName": "Fulano",
  "username": "fulano",
  "email": "user@example.com",
  "avatarUrl": null
}
```

---

Os exemplos acima são intencionais e servem como referência rápida para integrar o frontend ou scripts que consomem a API.
