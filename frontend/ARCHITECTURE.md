# Arquitetura do Frontend

O frontend é organizado por domínios de negócio, não por tipos técnicos de arquivo.

## Camadas

- `src/app`: composição da aplicação, providers, rotas e páginas de nível global.
- `src/domains/<domain>/domain`: tipos de negócio e regras puras, sem React ou HTTP.
- `src/domains/<domain>/application`: hooks React e casos de uso que orquestram regras de domínio.
- `src/domains/<domain>/infrastructure`: gateways de API e código específico de transporte.
- `src/domains/<domain>/presentation`: páginas e componentes pertencentes ao domínio.
- `src/shared`: primitivas de UI, assets, hooks e utilitários técnicos reutilizáveis.

> Exceção: o domínio `new_dashboard` ainda não segue integralmente essas 4 camadas. Hoje ele usa uma organização própria (`components/`, `context/`, `hooks/`, `infrastructure/`, `types/`, `utils/`, `layout.tsx`, `page.tsx`), sem pastas `domain/`, `application/` ou `presentation/` separadas. `auth`, `jobs` e `marketing` seguem o padrão de 4 camadas descrito acima.

## Domínios

- `auth`: estado de sessão, acesso à API de credenciais/OAuth e telas de login, registro e callback.
- `jobs`: entidades de vagas, filtros, deduplicação, paginação, acesso à API de vagas/scraper e UI de vagas.
- `marketing`: seções da landing page pública.
- `new_dashboard`: nova estrutura de painel do frontend. Contribuidores que procuram a experiência atual de dashboard devem começar por aqui.

## Política de imports

O código deve importar a partir de `@/app`, `@/domains` ou `@/shared`. Pastas técnicas antigas como `src/components`, `src/pages`, `src/hooks`, `src/services`, `src/context`, `src/lib` e `src/types` foram removidas para manter uma estrutura única orientada por domínio.
