# Guia de Desenvolvimento Local

Este guia foi escrito para quem acabou de clonar o repositório e precisa subir o projeto do zero.

**Objetivo:** permitir execução local com o mínimo de tentativa e erro, usando apenas o que existe atualmente no repositório.

---

## Visão rápida

O monorepo possui os seguintes blocos principais:

* `frontend` — aplicação principal do usuário final (React + Vite)
* `backend` — API Node.js/Express (TypeScript + Drizzle)
* `front_admin` — painel administrativo (React + Vite)
* `scraper-go` — serviço Go para coleta/agregação de vagas
* `observability` — stack de métricas e logs (Prometheus/Grafana/Loki etc.)

Além disso, existem arquivos Docker Compose para infraestrutura, migrações, aplicação e observabilidade.

### Fluxo Docker recomendado

O fluxo completo de desenvolvimento é:

```text
PostgreSQL
    │
    ▼
PostgreSQL saudável
    │
    ▼
db:migrate
    │
    ▼
db:seed
    │
    ├── Local Developer
    ├── Local Admin
    ├── vagas de teste
    ├── notas
    └── eventos
    │
    ▼
security:backfill-user-pii
    │
    ▼
Backend
    │
    ├── Frontend
    ├── Front Admin
    └── Scraper Go
```

Ao utilizar o Docker completo, **migrations e seed são executados automaticamente** antes da inicialização do backend.

---

# 1) Pré-requisitos

## Obrigatórios

1. Git
2. Node.js 22+
3. npm
4. Docker Desktop
5. Docker Compose

O backend exige Node.js `>= 22`.

## Opcionais

* Go 1.26+ — somente se quiser executar `scraper-go` fora do Docker
* PostgreSQL local — caso queira executar o backend fora do Docker
* Valkey/Redis local — caso queira executar backend/scraper fora do Docker

## Verificar instalação

```bash
git --version
node -v
npm -v
docker --version
docker compose version
```

Opcional:

```bash
go version
```

## Gerenciador de pacotes

O projeto utiliza npm e possui `package-lock.json`.

Embora exista `pnpm-workspace.yaml`, o fluxo documentado e recomendado utiliza npm.

---

# 2) Clonando o projeto

```bash
git clone https://github.com/Cla-Code-Community/candidate.git
cd candidate
```

Se estiver utilizando um fork, ajuste a URL do repositório.

---

# 3) Estrutura do monorepo

Estrutura relevante:

```text
candidate/
├── backend/
│   ├── drizzle/
│   ├── src/
│   ├── tests/
│   └── .env.example
│
├── frontend/
│   ├── src/
│   ├── tests/
│   └── .env.example
│
├── front_admin/
│   ├── src/
│   └── tests/
│
├── scraper-go/
│
├── shared/
│
├── docker/
│
├── observability/
│
├── docs/
│
├── docker-compose.infra.yml
├── docker-compose.yml
├── docker-compose.migrate.yml
├── docker-compose.observability.yml
├── .env.example
└── package.json
```

---

# 4) Instalação

Na raiz:

```bash
npm install
```

O comando instala as dependências da raiz e dos workspaces.

---

# 5) Variáveis de ambiente

## Arquivos existentes

Atualmente existem:

```text
.env.example
backend/.env.example
frontend/.env.example
```

Também podem existir localmente:

```text
.env
backend/.env
frontend/.env
```

O `front_admin` não possui atualmente um `front_admin/.env.example` versionado.

## Criar os arquivos

Linux/macOS/Git Bash:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

---

# 6) Variáveis importantes

## Obrigatórias para o funcionamento completo

As principais variáveis são:

```text
SESSION_SECRET
DATABASE_URL
CORS_ALLOWED_ORIGINS
FRONTEND_URL
GO_SCRAPER_URL
```

Alguns fluxos podem utilizar `SCRAPER_URL` em vez de `GO_SCRAPER_URL`.

## OAuth

Somente necessárias se for utilizar autenticação OAuth:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET

GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET

LINKEDIN_CLIENT_ID
LINKEDIN_CLIENT_SECRET
```

## Scraping externo

Somente necessárias para os respectivos provedores:

```text
ADZUNA_APP_ID
ADZUNA_APP_KEY

JOOBLE_API_KEY
```

## Segurança e PII

O backend utiliza:

```text
ENCRYPTION_MASTER_KEY
SEARCH_KEY
ENCRYPTION_KEY_ID
```

### ENCRYPTION_MASTER_KEY

Para desenvolvimento local, gere uma chave de 32 bytes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

O resultado deve possuir 64 caracteres hexadecimais.

Exemplo:

```text
ENCRYPTION_MASTER_KEY=...
```

### SEARCH_KEY

Utilize uma string secreta não vazia, por exemplo:

```text
SEARCH_KEY=local-dev-search-key
```

### SESSION_SECRET

Utilize uma string longa e aleatória:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

# 7) Banco de dados

## Tecnologia

* PostgreSQL
* Drizzle ORM
* Migrações em `backend/drizzle`
* Configuração em `backend/drizzle.config.js`

## Tabelas principais

Entre as tabelas utilizadas atualmente estão:

```text
accounts
application_events
application_notes
audit_logs
credentials
keywords
permission_rules
saved_jobs
user_notifications
user_preferences
users
```

---

# 8) Docker

## 8.1 Criar a rede Docker

O compose utiliza a rede externa `vagas-net`.

Crie-a uma única vez:

```bash
docker network create vagas-net
```

Se ela já existir, o Docker informará que a rede já existe. Nesse caso, não é necessário recriá-la.

---

# 9) Subir o ambiente completo

Este é o fluxo recomendado para quem está começando.

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  up --build -d
```

O fluxo executará:

```text
PostgreSQL
    ↓
Valkey
    ↓
migrate
    ↓
db:migrate
    ↓
db:seed
    ↓
security:backfill-user-pii
    ↓
backend
    ↓
frontend
    ↓
front_admin
    ↓
scraper-go
```

O backend somente será iniciado depois que o serviço `migrate` terminar com sucesso.

---

# 10) Verificar os containers

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  ps
```

O serviço `migrate` deve terminar com status de sucesso.

---

# 11) Verificar migrations e seed

Veja os logs:

```bash
docker logs vagas-migrate
```

Você deverá encontrar mensagens relacionadas a:

```text
migrations applied successfully!
```

e ao seed:

```text
Iniciando seed de desenvolvimento local...

+ usuário criado: dev@localhost.test (role=user)
+ usuário criado: admin@localhost.test (role=admin)

Seed concluído.
```

Na primeira execução, também serão criadas as vagas, notas e eventos de teste.

---

# 12) Seed de desenvolvimento

O seed está localizado em:

```text
backend/src/scripts/seed.ts
```

O comando npm é:

```bash
npm run db:seed
```

O script é:

* idempotente
* não destrutivo
* seguro para reexecução
* específico para desenvolvimento local

Ele não deve ser utilizado para criar dados de produção.

## O que o seed cria

O seed cria:

* 1 usuário comum
* 1 usuário administrador
* 2 registros de preferências
* 3 vagas salvas
* 2 notas privadas
* 2 eventos de alteração de candidatura

---

# 13) Seed automático via Docker

No fluxo Docker completo, o serviço `migrate` executa:

```bash
npm run db:migrate
```

depois:

```bash
npm run db:seed
```

e finalmente:

```bash
npm run security:backfill-user-pii -- --write
```

O comando completo é:

```bash
sh -c "npm run db:migrate && npm run db:seed && npm run security:backfill-user-pii -- --write"
```

Portanto:

> **Não é necessário executar `npm run db:seed` manualmente quando o ambiente foi iniciado pelo Docker completo.**

---

# 14) Seed manual

Se estiver executando o backend fora do Docker:

```bash
npm run db:seed
```

Ou diretamente no workspace:

```bash
npm run db:seed --workspace=backend
```

O seed depende de uma conexão funcional com PostgreSQL e das variáveis de segurança necessárias.

Se o PostgreSQL estiver apenas dentro do Docker e não estiver exposto ao host, executar o seed diretamente no Windows/Linux/macOS pode resultar em erro de conexão.

Nesse cenário, prefira o fluxo Docker completo.

---

# 15) Usuários de desenvolvimento

O seed cria as seguintes contas:

| Usuário         | E-mail                 | Senha          | Role    |
| --------------- | ---------------------- | -------------- | ------- |
| Local Developer | `dev@localhost.test`   | `Dev@123456`   | `user`  |
| Local Admin     | `admin@localhost.test` | `Admin@123456` | `admin` |

**Essas credenciais são exclusivamente para desenvolvimento local.**

Nunca utilize essas senhas em produção.

## Local Developer

Utilize para testar:

* login
* perfil
* preferências
* busca de vagas
* vagas salvas
* notas
* eventos de candidatura

## Local Admin

Utilize para testar funcionalidades administrativas, como:

```text
/admin/users
/admin/observability/metrics
/admin
```

Funcionalidades que exigem `super_admin` não são concedidas automaticamente pelo seed.

---

# 16) Verificar usuários diretamente no PostgreSQL

Para verificar se o seed foi executado:

```bash
docker exec vagas-postgres \
  psql -U vagas -d vagas \
  -c "SELECT email_hash, role FROM users;"
```

Para consultar credenciais:

```bash
docker exec vagas-postgres \
  psql -U vagas -d vagas \
  -c "SELECT email_hash FROM credentials;"
```

Não espere encontrar o e-mail em texto puro nas colunas protegidas.

O projeto utiliza mecanismos de proteção/normalização para os dados de identificação.

---

# 17) Migrações manuais

Para executar somente as migrations:

```bash
npm run db:migrate --workspace=backend
```

Gerar migration:

```bash
npm run db:generate --workspace=backend
```

Aplicar schema diretamente:

```bash
npm run db:push --workspace=backend
```

Em desenvolvimento normal, prefira migrations versionadas.

---

# 18) Autenticação

A API não utiliza JWT para a sessão principal.

A autenticação utiliza:

```text
iron-session
```

com sessão baseada em cookie.

O cookie utilizado é:

```text
vagas_session
```

Após o login, o cliente deve manter esse cookie para acessar endpoints autenticados.

---

# 19) Login pela API

Endpoint:

```text
POST /auth/login
```

Body:

```json
{
  "email": "dev@localhost.test",
  "password": "Dev@123456"
}
```

## Usando curl

```bash
curl -i -c cookies.txt \
  -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@localhost.test","password":"Dev@123456"}'
```

Uma resposta bem-sucedida deve retornar:

```text
HTTP 200
```

e um header `Set-Cookie` contendo a sessão.

---

# 20) Testar sessão autenticada

Depois do login:

```bash
curl -i \
  -b cookies.txt \
  http://localhost:3001/auth/me
```

---

# 21) Listar vagas salvas

```bash
curl -i \
  -b cookies.txt \
  http://localhost:3001/saved-jobs
```

O usuário `dev@localhost.test` deverá possuir as 3 vagas criadas pelo seed.

---

# 22) Criar uma vaga salva

```bash
curl -i \
  -b cookies.txt \
  -X POST http://localhost:3001/saved-jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jobLink":"https://example.com/jobs/teste-manual",
    "jobTitle":"Vaga de teste",
    "notes":"Criada manualmente via curl"
  }'
```

Guarde o `id` retornado.

---

# 23) Atualizar uma vaga salva

Substitua `SAVED_JOB_ID` pelo ID retornado:

```bash
curl -i \
  -b cookies.txt \
  -X PATCH http://localhost:3001/saved-jobs/SAVED_JOB_ID \
  -H "Content-Type: application/json" \
  -d '{
    "status":"applied",
    "notes":"Nota atualizada via curl"
  }'
```

---

# 24) Notas privadas

Criar nota:

```bash
curl -i \
  -b cookies.txt \
  -X POST http://localhost:3001/saved-jobs/SAVED_JOB_ID/notes \
  -H "Content-Type: application/json" \
  -d '{
    "content":"Recrutador confirmou entrevista técnica."
  }'
```

Listar notas:

```bash
curl -i \
  -b cookies.txt \
  http://localhost:3001/saved-jobs/SAVED_JOB_ID/notes
```

---

# 25) Excluir vaga salva

```bash
curl -i \
  -b cookies.txt \
  -X DELETE \
  http://localhost:3001/saved-jobs/SAVED_JOB_ID
```

Resposta esperada:

```text
204 No Content
```

---

# 26) Testar usuário administrador

Crie um cookie jar separado:

```bash
curl -i -c admin-cookies.txt \
  -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost.test","password":"Admin@123456"}'
```

Depois:

```bash
curl -i \
  -b admin-cookies.txt \
  http://localhost:3001/admin/users
```

---

# 27) Logout

```bash
curl -i \
  -b cookies.txt \
  -X POST \
  http://localhost:3001/auth/logout
```

---

# 28) Prefixo da API

A API possui o prefixo oficial:

```text
/api/v1
```

Exemplo:

```text
http://localhost:3001/api/v1/auth/login
```

Algumas rotas sem `/api/v1` continuam disponíveis por compatibilidade.

Para novas integrações, prefira o prefixo:

```text
/api/v1
```

---

# 29) Swagger/OpenAPI

O Swagger está disponível em:

```text
http://localhost:3001/docs
```

Acesse no navegador:

```text
http://localhost:3001/docs
```

Use o Swagger para consultar:

* métodos HTTP
* parâmetros
* schemas
* respostas
* autenticação
* endpoints disponíveis

Para endpoints que ainda não possuem documentação completa no Swagger, utilize os exemplos deste documento, `BACKEND.md` ou a coleção Bruno em:

```text
backend/bruno/
```

---

# 30) URLs principais

## Frontend

```text
http://localhost:5173
```

Login:

```text
http://localhost:5173/login
```

Cadastro:

```text
http://localhost:5173/register
```

## Backend

Health:

```text
http://localhost:3001/health
```

Swagger:

```text
http://localhost:3001/docs
```

Metrics:

```text
http://localhost:3001/metrics
```

## Scraper

Health:

```text
http://localhost:8081/health
```

Metrics:

```text
http://localhost:8081/metrics
```

Admin jobs count:

```text
http://localhost:8081/admin/jobs/count
```

## Front admin

```text
http://localhost:5174
```

Login:

```text
http://localhost:5174/login
```

---

# 31) Executar projeto sem Docker completo

Existem duas possibilidades.

## Caminho A — Docker completo

Recomendado:

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  up --build -d
```

## Caminho B — Node local

```bash
npm run dev
```

Isso inicia:

```text
frontend → 5173
backend  → 3001
```

Para incluir o painel administrativo:

```bash
npm run dev:admin
```

Ou individualmente:

```bash
npm run dev:frontend
npm run dev:backend
npm run dev:front_admin
```

---

# 32) Atenção ao executar backend fora do Docker

Se o backend estiver rodando diretamente no host:

```text
npm run dev:backend
```

o `DATABASE_URL` precisa apontar para um PostgreSQL acessível pelo host.

O compose de infraestrutura atual não expõe necessariamente PostgreSQL e Valkey para o host.

Portanto, existem três alternativas:

1. executar PostgreSQL/Valkey localmente;
2. expor as portas dos containers;
3. executar o backend dentro do Docker.

Para onboarding, a terceira opção é a mais simples.

---

# 33) Parar o ambiente

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  down
```

## Importante

Não utilize:

```bash
docker compose down -v
```

sem entender as consequências.

A opção `-v` pode remover volumes e, consequentemente, apagar o banco de desenvolvimento persistido.

---

# 34) Rebuild completo

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  up --build -d
```

---

# 35) Logs

Todos os serviços:

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  logs -f
```

Somente backend:

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  logs -f backend
```

Somente migrate:

```bash
docker logs -f vagas-migrate
```

---

# 36) Observabilidade

Para subir a stack:

```bash
docker compose \
  -f docker-compose.observability.yml \
  up -d
```

Para parar:

```bash
docker compose \
  -f docker-compose.observability.yml \
  down
```

---

# 37) Testes manuais

## Login

1. Acesse:

```text
http://localhost:5173/login
```

2. Teste credenciais inválidas.
3. Teste:

```text
dev@localhost.test
Dev@123456
```

4. Verifique o redirecionamento para área autenticada.

## Cadastro

1. Acesse:

```text
http://localhost:5173/register
```

2. Teste campos obrigatórios.
3. Teste telefone vazio.
4. Teste telefone válido.
5. Teste telefone inválido.

## Busca de vagas

1. Faça login.
2. Acesse `/vagas`.
3. Execute uma busca.
4. Teste filtros.
5. Verifique loading e tratamento de erro.

## Vagas salvas

1. Salve uma vaga.
2. Abra as vagas salvas.
3. Altere o status.
4. Adicione uma nota.
5. Remova a vaga.

## Perfil

1. Acesse `/perfil`.
2. Altere dados.
3. Altere preferências.
4. Recarregue a página.
5. Confirme persistência.

## Painel administrativo

Acesse:

```text
http://localhost:5174/login
```

Use:

```text
admin@localhost.test
Admin@123456
```

Teste:

```text
/dashboard
/users
/scrapers
/observability
/audit
/permissions
/settings
```

---

# 38) Testes automatizados

## Monorepo

```bash
npm run test:coverage
```

## Backend

```bash
npm run test --workspace=backend
```

```bash
npm run test:coverage --workspace=backend
```

```bash
npm run test:watch --workspace=backend
```

## Frontend

```bash
npm run test --workspace=frontend
```

```bash
npm run test:coverage --workspace=frontend
```

```bash
npm run test:watch --workspace=frontend
```

## Front admin

```bash
npm run test --workspace=front_admin
```

```bash
npm run test:coverage --workspace=front_admin
```

## Integração

Os testes de integração existentes ficam em:

```text
backend/tests/integration
```

Não há atualmente uma suíte E2E browser ativa/versionada.

---

# 39) Comandos úteis

Build frontend:

```bash
npm run build:frontend
```

Build front admin:

```bash
npm run build:front_admin
```

Validação:

```bash
npm run validate
```

Electron:

```bash
npm run electron
```

```bash
npm run electron:dev
```

Seed:

```bash
npm run db:seed
```

Migrations:

```bash
npm run db:migrate --workspace=backend
```

---

# 40) Como reproduzir bugs

Ao abrir uma issue ou Pull Request, informe:

## Contexto

* branch
* commit
* ambiente
* Docker ou execução local
* variáveis relevantes

## Passos

Liste os passos exatamente na ordem em que foram executados.

## Resultado atual

Descreva o comportamento observado.

## Resultado esperado

Descreva o comportamento correto.

## Evidências

Inclua quando possível:

* screenshot
* logs
* request
* response
* stack trace
* status HTTP

### Modelo

```text
Contexto:
- branch: ...
- commit: ...
- ambiente: Docker

Passos:
1. ...
2. ...
3. ...

Resultado atual:
...

Resultado esperado:
...

Evidências:
...
```

---

# 41) Checklist antes de abrir Pull Request

* [ ] `npm install` executa sem erro
* [ ] Docker sobe corretamente
* [ ] migrations executam
* [ ] seed executa
* [ ] backend responde `/health`
* [ ] frontend abre
* [ ] login funciona
* [ ] funcionalidades alteradas foram testadas
* [ ] testes automatizados passam
* [ ] cobertura foi mantida no escopo alterado
* [ ] TypeScript não apresenta erros
* [ ] lint passa
* [ ] não existem erros não tratados nos logs
* [ ] não existem regressões observáveis
* [ ] documentação foi atualizada quando necessário

---

# 42) Fluxo recomendado para um novo desenvolvedor

Para a maioria dos casos, basta seguir:

```bash
git clone https://github.com/Cla-Code-Community/candidate.git
cd candidate
```

Depois:

```bash
npm install
```

Criar os ambientes:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Criar a rede:

```bash
docker network create vagas-net
```

Subir tudo:

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  up --build -d
```

Verificar:

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  ps
```

Verificar o migrate:

```bash
docker logs vagas-migrate
```

Abrir:

```text
Frontend:
http://localhost:5173

Admin:
http://localhost:5174

Backend:
http://localhost:3001

Swagger:
http://localhost:3001/docs
```

Login comum:

```text
E-mail: dev@localhost.test
Senha:  Dev@123456
```

Login administrativo:

```text
E-mail: admin@localhost.test
Senha:  Admin@123456
```

---

# 43) Reexecução do seed

O seed pode ser executado novamente:

```bash
npm run db:seed
```

Ele é idempotente.

Isso significa que executar novamente:

```text
1ª execução → cria dados
2ª execução → mantém dados existentes
3ª execução → mantém dados existentes
```

O seed não deve apagar nem sobrescrever dados existentes.

No Docker completo, o seed também é executado automaticamente pelo serviço `migrate`.

---

# 44) Diagnóstico rápido

## Login retorna `401 Credenciais inválidas`

Primeiro verifique se o seed foi executado:

```bash
docker logs vagas-migrate
```

Depois:

```bash
docker exec vagas-postgres \
  psql -U vagas -d vagas \
  -c "SELECT role FROM users;"
```

Se os usuários não existirem, o seed não foi executado corretamente.

## `ECONNREFUSED` ao executar `npm run db:seed`

Isso normalmente significa que o PostgreSQL definido em `DATABASE_URL` não está acessível pelo host.

Se o banco estiver dentro do Docker, prefira subir o ambiente completo:

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  up --build -d
```

O seed será executado dentro do ambiente Docker, utilizando a conexão interna:

```text
postgres:5432
```

## `network vagas-net declared as external, but could not be found`

Crie a rede:

```bash
docker network create vagas-net
```

Depois suba novamente os serviços.

## Backend não inicia

Verifique:

```bash
docker logs vagas-migrate
```

e:

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  logs backend
```

O backend depende do término bem-sucedido do serviço `migrate`.

---

# 45) Referências do projeto

Documentação complementar:

```text
README.md
BACKEND.md
SCRAPER.md
TESTING.md
frontend/README.md
front_admin/README.md
```

Código do seed:

```text
backend/src/scripts/seed.ts
```

Migrações:

```text
backend/drizzle/
```

Configuração Docker:

```text
docker-compose.infra.yml
docker-compose.yml
docker-compose.migrate.yml
docker-compose.observability.yml
```

---

# 46) Limitações conhecidas

No estado atual do repositório:

1. `front_admin/.env.example` não está versionado.
2. Não existe uma suíte E2E browser ativa/versionada.
3. Existem pontos de documentação antiga utilizando `/api` que podem divergir das rotas montadas em runtime.
4. Nem todos os endpoints possuem documentação Swagger completa.
5. O fluxo de desenvolvimento local recomendado é o Docker completo, pois ele garante a disponibilidade do PostgreSQL, Valkey, migrations, seed e backend no mesmo ambiente.

---

# 47) Resumo dos comandos essenciais

### Primeiro setup

```bash
npm install

cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker network create vagas-net

docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  up --build -d
```

### Verificar

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  ps
```

```bash
docker logs vagas-migrate
```

### Aplicação

```text
Frontend:  http://localhost:5173
Admin:     http://localhost:5174
Backend:   http://localhost:3001
Swagger:   http://localhost:3001/docs
```

### Credenciais locais

```text
Developer
dev@localhost.test
Dev@123456

Admin
admin@localhost.test
Admin@123456
```

### Parar

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  down
```

### Subir novamente

```bash
docker compose \
  -f docker-compose.infra.yml \
  -f docker-compose.yml \
  -f docker-compose.migrate.yml \
  up --build -d
```
