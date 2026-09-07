# Roteiro de QA - Estado Real Atual (React + Node.js)

## 1. Objetivo

Validar o comportamento real da aplicacao no estado atual do codigo, cobrindo frontend, backend, integracao, UX/UI, responsividade e tratamento de erros sem assumir funcionalidades futuras.

## 2. Escopo atual da aplicacao

- Frontend SPA unica em React (sem react-router, sem multiplas paginas).
- Backend Express com rotas de auth, users, jobs, keywords e saved-jobs.
- Persistencia em PostgreSQL via Drizzle ORM para usuarios, credenciais, preferencias, saved jobs e keywords.
- Integracao com Valkey/Redis para busca de jobs e fila de keywords.
- Endpoint de health publico.
- Tema claro/escuro com toggle no cabecalho.

## 3. Arquitetura identificada

- Frontend: Vite + React + hooks locais para dados, filtros, paginacao e tema.
- Backend: Express + middlewares globais (security headers, CORS, sessao, auth guard, error handler).
- Sessao: iron-session com cookie vagas_session.
- Banco: PostgreSQL obrigatorio para rotas de auth/users/saved-jobs/keywords GET.
- Cache/fila: Valkey obrigatorio para jobs search e keywords POST.
- Infra docker: compose principal depende de rede externa vagas-net e compose de infra separado para postgres/valkey.

## 4. Funcionalidades realmente implementadas

### Frontend implementado

- Dashboard unico com cabecalho, filtros, tabela, paginacao e modal de gerenciamento de filtros.
- Busca textual local e filtro por palavras-chave em memoria.
- Dedupe de vagas no cliente.
- Toggle de tema claro/escuro persistido em localStorage.
- Estados visuais de loading, vazio e erro.

### Backend implementado

- GET /health publico.
- Rotas de auth:
1. GET /auth/:provider/url
2. GET /auth/:provider/callback
3. POST /auth/register
4. POST /auth/login
5. POST /auth/logout
6. GET /auth/me
- Rotas protegidas por sessao + requireAuth:
1. GET /jobs/search
2. GET /keywords
3. POST /keywords
4. GET/PATCH /users/profile
5. GET/POST/PATCH /users/preferences
6. GET/GET:id/POST/PATCH:id/DELETE:id /saved-jobs

### Diferencas reais entre frontend e backend atual

- Frontend chama GET /api/jobs/files e GET /api/jobs?file=... mas essas rotas nao existem no backend atual.
- Frontend chama POST /api/jobs/search ao clicar em Buscar vagas, mas backend possui apenas GET /api/jobs/search.
- Frontend envia { keywords: string[] } no salvar filtros, mas backend aceita apenas { keyword: string } em POST /api/keywords.
- Frontend nao envia credentials: include nas requisicoes e backend exige sessao nas rotas de jobs/keywords/users/saved-jobs.

## 5. Fluxos criticos

### FC-001 - Boot da aplicacao

1. Subir backend.
2. Subir frontend.
3. Abrir dashboard.
4. Confirmar health 200.

### FC-002 - Carregamento inicial de dados no frontend

1. Frontend monta.
2. Hook useJobsData dispara fetchJobFiles.
3. Validar resultado atual esperado de erro devido a rota ausente/protegida.

### FC-003 - Buscar vagas pelo botao

1. Clicar em Buscar vagas.
2. Frontend dispara POST /api/jobs/search.
3. Validar retorno de erro esperado (404 ou 401 conforme ambiente).

### FC-004 - Gerenciar filtros

1. Abrir modal Gerenciar filtros.
2. Carregar keywords com GET /api/keywords.
3. Salvar alteracoes com POST /api/keywords.
4. Validar erro de contrato de payload no estado atual.

## 6. Smoke tests

### SMK-001 - Health endpoint

Passos:
1. curl -i http://localhost:3001/api/health

Esperado:
- HTTP 200
- Body com ok true.

Severidade se falhar: bloqueante.

### SMK-002 - Front abre sem crash

Passos:
1. Abrir http://localhost:5173.
2. Verificar render do cabecalho e cards.

Esperado:
- Sem tela branca.
- Sem crash fatal no console.

Severidade se falhar: bloqueante.

### SMK-003 - Contrato inicial de dados

Passos:
1. Monitorar network no carregamento inicial.
2. Inspecionar chamadas para /api/jobs/files e /api/jobs.

Esperado no estado atual:
- Erro controlado no frontend (mensagem na tela), sem travar app.

Severidade se falhar (travamento): critica.

## 7. Casos de teste frontend

### FE-001 - Renderizacao de estrutura principal

Validar presenca de:
- Header com logo.
- Toggle de tema.
- Campo de busca.
- Seletor de filtro e seletor de arquivo.
- Tabela com colunas.

Severidade: alta.

### FE-002 - Funcionamento da Navbar

Passos:
1. Clicar em "Funcionalidades".
2. Clicar em "Time".
3. Clicar em "Como Funciona".
4. Clicar em "Pronto?".
5. Clicar em "Realizar o Login".

Esperado:
- Itens de menu rolam até a seção correspondente.
- "Realizar o Login" redireciona para página de login.

Severidade: media.

### FE-003 - Botao "Comece Agora" redireciona para Login

Passos:
1. Acessar http://localhost:5173.
2. Clicar no botão "Comece Agora".

Esperado:
- Usuário é redirecionado para a página de login.

Severidade: media.

### FE-004 - Botao "Como Funciona" redireciona para aba de "Como Funciona"

Passos:
1. Acessar http://localhost:5173.
2. Clicar no botão "Como Funciona".

Esperado:
- Usuário é redirecionado para a seção de Funcionamento.

Severidade: media.

### FE-005 - Botao "Ver Perfil" redireciona ao GitHub

Passos:
1. Acessar http://localhost:5173.
2. Clicar no botão "Ver Perfil".

Esperado:
- Usuário é redirecionado para a página do GitHub.
- Link abre em uma nova aba.

Severidade: media.

### FE-006 - Botao "Acessar Dashboard" redireciona para Login

Passos:
1. Acessar http://localhost:5173.
2. Clicar no botão "Acessar Dashboard".

Esperado:
- Usuário é redirecionado para a página de login.

Severidade: media.

### FE-007 - Botao "Explorar Funcionalidades" redireciona para a aba de funcionalidades

Passos:
1. Acessar http://localhost:5173.
2. Clicar no botão "Explorar Funcionalidades".

Esperado:
- Usuário é redirecionado para a seção de funcionalidades.

Severidade: media.

### FE-008 - Dark mode

Passos:
1. Alternar tema via toggle.
2. Recarregar página.

Esperado:
- Tema persiste via localStorage.

Severidade: baixa.

### FE-009 - Links do Footer

Passos:
1. Acessar http://localhost:5173.
2. Rolar até o footer.
3. Clicar em cada link: Funcionalidades, Como Funciona, Preços, Status, Termos de Uso, Privacidade, Contato.

Esperado:
- Cada link redireciona para seção ou página correta.
- Links externos abrem em nova aba.

Severidade: alta.

## 8. Caso de testes de Login

### LOG-001 - Login com campos vazios

Passos:
1. Acessar http://localhost:5173/login.
2. Tentar fazer login com campos vazios.

Esperado:
- Campo email exibe mensagem de validação.
- Campo senha exibe mensagem de validação.
- Login não é submetido.

Severidade: alta.

### LOG-002 - Login com email incorreto

Passos:
1. Acessar http://localhost:5173/login.
2. Inserir email inválido (ex: "naoeumemail@gmail").
3. Inserir senha válida.
4. Clicar em "Entrar".

Esperado:
- O sistema barra o login com a informação genérica de falha ao fazer login.

Severidade: alta.

### LOG-003 - Login com senha incorreta

Passos:
1. Acessar http://localhost:5173/login.
2. Inserir email válido.
3. Inserir senha incorreta (ex: "senha123456").
4. Clicar em "Entrar".

Esperado:
- O sistema barra o login com a informação genérica de falha ao fazer login.

Severidade: alta.

### LOG-004 - Login com credenciais corretas

Pré-condições:
- Usuário cadastrado no sistema.
- Email: user@example.com
- Senha: StrongP@ssw0rd

Passos:
1. Acessar http://localhost:5173/login.
2. Logar no sistema com as credenciais corretas.

Esperado:
- O sistema aceita as credenciais e avança à tela de Dashboard.

Severidade: alta.

### LOG-005 - Login API com credenciais invalidas

Passos:
1. POST /api/auth/login com credenciais incorretas.

Esperado:
- O sistema informa um erro de não autorizado com o status code 401.

Severidade: alta.

### LOG-006 - Login API com credenciais validas

Passos:
1. POST /api/auth/login com credenciais corretas.

Esperado:
- O sistema informa uma mensagem de sucesso com o status code 200.

Severidade: alta.

## 9. Casos de teste backend/API

### BE-001 - Healthcheck

Requisicao:
- GET /api/health

Esperado:
- 200.

Severidade: bloqueante.

### BE-002 - Auth me sem sessao

Requisicao:
- GET /api/auth/me

Esperado:
- 401.

Severidade: alta.

### BE-003 - Register payload invalido

Requisicao:
- POST /api/auth/register com body invalido.

Esperado:
- 400 com detalhes zod.

Severidade: alta.

### BE-004 - Login credencial invalida

Requisicao:
- POST /api/auth/login com senha incorreta.

Esperado:
- 401.

Severidade: alta.

### BE-005 - Jobs search sem sessao

Requisicao:
- GET /api/jobs/search.

Esperado:
- 401 por requireAuth.

Severidade: critica.

### BE-006 - Jobs search com metodo incorreto

Requisicao:
- POST /api/jobs/search.

Esperado:
- 404 (metodo nao implementado).

Severidade: critica.

### BE-007 - Keywords GET sem sessao

Requisicao:
- GET /api/keywords.

Esperado:
- 401.

Severidade: alta.

### BE-008 - Keywords POST payload invalido

Requisicao:
- POST /api/keywords com body {}.

Esperado:
- 400 com mensagem do campo keyword.

Severidade: alta.

### BE-009 - Users profile sem sessao

Requisicao:
- GET /api/users/profile.

Esperado:
- 401.

Severidade: alta.

### BE-010 - Saved jobs sem sessao

Requisicao:
- GET /api/saved-jobs.

Esperado:
- 401.

Severidade: alta.

### BE-011 - CORS origem negada

Passos:
1. Enviar Origin nao permitida.

Esperado:
- 403 com mensagem Origem nao permitida.

Severidade: media.

### BE-012 - Falha de dependencia externa

Passos:
1. Derrubar Valkey e chamar GET /api/jobs/search com sessao valida.

Esperado:
- 500 com mensagem de erro interno especifica da rota.

Severidade: critica.

## 10. Casos de integracao

### INT-001 - Frontend consumindo backend via proxy Vite

Passos:
1. Rodar frontend com proxy para localhost:3001.
2. Verificar chamadas /api no network.

Esperado:
- Requisicoes chegam no backend.

Severidade: alta.

### INT-002 - Falha por rota inexistente

Passos:
1. Acionar fluxo que chama /api/jobs/files.

Esperado atual:
- Erro controlado no frontend.

Severidade: critica.

### INT-003 - Falha de API por metodo incorreto

Passos:
1. Clicar Buscar vagas.

Esperado atual:
- 404 em POST /api/jobs/search.

Severidade: critica.

### INT-004 - Timeout/indisponibilidade backend

Passos:
1. Parar backend.
2. Recarregar frontend.

Esperado:
- Mensagem de erro amigavel sem crash.

Severidade: alta.

### INT-005 - Erro 500 de dependencia

Passos:
1. Simular indisponibilidade de banco ou valkey.

Esperado:
- Backend retorna 500.
- Frontend exibe erro sem travar.

Severidade: alta.

## 11. Casos mobile/responsividade

### MOB-001 - Breakpoint 360x640

Esperado:
- Header sem sobreposicao.
- Botoes clicaveis.

Severidade: media.

### MOB-002 - Breakpoint 768x1024

Esperado:
- Cards alinhados sem cortes.

Severidade: media.

### MOB-003 - Overflow horizontal

Passos:
1. Popular tabela com textos longos.

Esperado:
- Nao cortar acao principal.
- Scroll horizontal previsivel na tabela.

Severidade: alta.

### MOB-004 - Modal de filtros em mobile

Esperado:
- Modal centralizado e acessivel sem clipping.

Severidade: media.

## 12. Casos UX/UI

### UX-001 - Feedback visual de loading

Validar:
- Botao Buscar vagas com estado Buscando vagas.
- Modal com Carregando keywords.

Severidade: media.

### UX-002 - Mensagens de erro compreensiveis

Validar:
- Textos de erro exibidos para falhas de API.

Severidade: alta.

### UX-003 - Consistencia visual no dark mode

Validar:
- Contraste de texto e legibilidade em cards, tabela e badges.

Severidade: media.

### UX-004 - Acessibilidade minima

Validar:
- aria-label nos controles principais (filtros, paginação, toggle).

Severidade: media.

## 13. Tratamento de erros

### ERR-001 - 401 nao autenticado

Cobrir rotas protegidas sem cookie de sessao.

### ERR-002 - 400 validacao

Cobrir payload invalido em auth e keywords.

### ERR-003 - 403 CORS

Cobrir origem nao permitida.

### ERR-004 - 404 metodo/rota

Cobrir POST /api/jobs/search e GET /api/jobs/files.

### ERR-005 - 500 dependencia

Cobrir indisponibilidade de banco/valkey.

### ERR-006 - Fallback visual frontend

Cobrir exibicao de mensagem sem crash da tela.

## 14. Regressao minima

Executar antes de qualquer release:

1. SMK-001, SMK-002, SMK-003
2. FE-001, FE-004, FE-007, FE-008
3. BE-001, BE-005, BE-006, BE-008
4. INT-001, INT-003, INT-004
5. MOB-001, MOB-003

## 15. Criterios de aceite

- Nenhum bug bloqueante ou critica aberto nos fluxos de entrada.
- Frontend nao pode travar em erros de API.
- Healthcheck deve responder 200 continuamente.
- Erros de contrato entre frontend e backend devem estar mapeados e aceitos formalmente ou corrigidos.

## 16. Bugs encontrados

### BUG-001

- Titulo: Frontend chama endpoint inexistente GET /api/jobs/files.
- Severidade: bloqueante.
- Impacto: carregamento inicial de vagas falha.

### BUG-002

- Titulo: Frontend chama endpoint inexistente GET /api/jobs?file=...
- Severidade: bloqueante.
- Impacto: tabela principal nao carrega dados da API atual.

### BUG-003

- Titulo: Frontend usa POST /api/jobs/search, backend implementa apenas GET.
- Severidade: critica.
- Impacto: acao Buscar vagas retorna 404.

### BUG-004

- Titulo: Contrato quebrado em salvar keywords ({ keywords[] } vs { keyword }).
- Severidade: critica.
- Impacto: salvar filtros falha com 400.

### BUG-005

- Titulo: Frontend nao envia credentials e backend exige sessao em jobs/keywords.
- Severidade: critica.
- Impacto: chamadas protegidas retornam 401 mesmo com backend saudavel.

## 16. Melhorias recomendadas

### Prioridade 1

- Alinhar contrato de jobs entre frontend e backend.
- Definir endpoint oficial para acao Buscar vagas e implementar no backend.
- Alinhar payload de keywords entre frontend e backend.
- Definir politica de autenticacao para rotas usadas pelo dashboard publico.

### Prioridade 2

- Padronizar responses de erro com codigo e mensagem amigavel.
- Adicionar testes de contrato API (consumer-driven ou schema).
- Adicionar timeouts e mensagens especificas no frontend para erro de rede.

### Prioridade 3

- Introduzir monitoramento de erros client/server.
- Introduzir testes E2E automatizados (browser) para tema, responsividade e fluxo de filtros — hoje não há Playwright/Cypress nem qualquer suíte E2E versionada no repositório; os casos MOB-*/INT-* deste guia são roteiros manuais.

---

## Checklist QA

- [ ] API responde GET /api/health com 200.
- [ ] Frontend renderiza sem crash.
- [ ] Fluxo Buscar vagas nao retorna 404.
- [ ] Fluxo Gerenciar filtros salva sem 400.
- [ ] Rotas protegidas exigem sessao conforme regra acordada.
- [ ] Dark mode alterna e persiste.
- [ ] Mobile 360x640 sem quebra critica.
- [ ] Erros 401/403/404/500 exibem feedback visual adequado.

## Matriz de severidade

| Severidade | Definicao operacional |
| --- | --- |
| bloqueante | Impede uso do fluxo principal ou abertura da aplicacao |
| critica | Quebra fluxo importante com workaround limitado |
| alta | Impacto relevante, mas com contorno manual |
| media | Impacto moderado em UX/funcionalidade secundaria |
| baixa | Ajuste cosmetico ou impacto minimo |

## Lista de riscos

- Risco de release com dashboard sem carregar dados por contratos divergentes.
- Risco de regressao por ausencia de testes de contrato front-back.
- Risco operacional por dependencia forte de sessao, banco e valkey sem fallback funcional no frontend.
- Risco de suporte por mensagens de erro tecnicas sem guia ao usuario final.

## Melhorias prioritarias

1. Contrato unico e versionado para jobs e keywords.
2. Definir claramente se dashboard exige login e refletir isso no frontend.
3. Implementar testes integrados automaticos para endpoints usados na tela principal.
