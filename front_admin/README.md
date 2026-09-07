# Front Admin

Painel administrativo do Cand!Date!, separado da experiência principal para reduzir atrito no onboarding de contribuidores.

Use este workspace quando a tarefa envolver operação da plataforma, gestão de usuários, permissões, scrapers, auditoria, observabilidade ou configurações administrativas.

## Stack

- React 19
- TypeScript
- Vite 8
- Tailwind CSS 4
- Lucide React
- Zod
- Vitest + Testing Library

## Como executar

Na raiz do monorepo, instale as dependências:

```bash
npm install
```

Para subir frontend, backend e painel administrativo juntos:

```bash
npm run dev:admin
```

Para executar apenas o painel:

```bash
npm run dev --workspace=front_admin
```

Quando executado junto com o frontend principal, use a porta <http://localhost:5174> para o admin.

## Variáveis de ambiente

O workspace ainda não possui `front_admin/.env.example` versionado.

Para desenvolvimento local, crie `front_admin/.env` quando precisar configurar explicitamente a API:

```bash
VITE_API_URL=http://localhost:3001
```

O backend precisa permitir a origem do admin em `CORS_ALLOWED_ORIGINS`, por exemplo:

```bash
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

## Organização

- `src/app`: providers, rotas, layout principal, páginas de erro e proteção de rotas.
- `src/app/layouts/MainLayout`: sidebar, header, busca, filtros de tempo, menu de usuário e notificações.
- `src/modules/auth`: login administrativo e estado de autenticação.
- `src/modules/dashboard`: visão geral de métricas, serviços e scrapers.
- `src/modules/users`: listagem, edição, bloqueio e ações administrativas de usuários.
- `src/modules/permissions`: regras e matriz de permissões.
- `src/modules/scrapers`: status, execução e console de eventos dos scrapers.
- `src/modules/observability`: painéis, métricas e uso de infraestrutura.
- `src/modules/audit`: logs de auditoria.
- `src/modules/settings`: configurações administrativas.
- `src/lib/api`: clientes HTTP e contratos das rotas admin.
- `src/lib/theme`: tokens, cores e tema.
- `src/components`: providers, UI compartilhada, tema, notificações e estados comuns.

## Rotas principais

- `/login`: autenticação do painel.
- `/dashboard`: dashboard administrativo (a rota `/` redireciona automaticamente para `/dashboard`).
- `/users`: gestão de usuários.
- `/permissions`: permissões.
- `/scrapers`: operação de scrapers.
- `/observability`: saúde da plataforma.
- `/audit`: auditoria.
- `/settings`: configurações.

## Scrapers e Observabilidade

O painel consome as rotas administrativas do backend para disparar o scraper completo ou uma fonte conhecida, consultar status, exibir contagem de vagas coletadas e mostrar dashboards de métricas. A fonte `go-scraper` é a integração operacional atual para execução manual.

## Comandos

```bash
npm run dev --workspace=front_admin
npm run build --workspace=front_admin
npm run lint --workspace=front_admin
npm run test --workspace=front_admin
npm run test:coverage --workspace=front_admin
npm run preview --workspace=front_admin
```

## Testes

Os testes ficam em `front_admin/tests` e cobrem rotas, layout, módulos administrativos, schemas, API clients, hooks e componentes compartilhados.

Para rodar somente os testes do admin:

```bash
npm run test --workspace=front_admin
```

Para cobertura:

```bash
npm run test:coverage --workspace=front_admin
```
