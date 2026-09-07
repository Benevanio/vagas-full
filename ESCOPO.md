# Documento Inicial de Produto (MVP)

## 1. Visão do Produto

### Nome Temporário

A definir.

### Problema

Profissionais buscam oportunidades de trabalho em diversas plataformas, porém encontram informações dispersas, processos repetitivos e dificuldade em acompanhar vagas relevantes.

### Solução

Desenvolver uma plataforma simples e intuitiva para descoberta, pesquisa e acompanhamento de oportunidades profissionais.

### Objetivo do MVP

Permitir que usuários:

* Criem uma conta;
* Realizem login;
* Pesquisem vagas;
* Visualizem detalhes das vagas;
* Possuam uma área autenticada para gerenciamento de oportunidades.

---

# 2. Público-Alvo

## Primário

* Desenvolvedores
* Profissionais de tecnologia
* Estudantes em busca de estágio
* Pessoas em transição de carreira

## Secundário

* Recrutadores
* Empresas parceiras

---

# 3. Regras de Negócio

## Cadastro

* Usuário deve possuir e-mail único.
* Senha deve atender requisitos mínimos de segurança.
* Cadastro gera conta ativa imediatamente.

## Login

* Autenticação por e-mail e senha.
* Sessão protegida por token.

## Busca de Vagas

* Disponível para visitantes.
* Pesquisa por palavra-chave.
* Filtro por localização.
* Filtro por modalidade (remoto, híbrido, presencial).

## Painel de Vagas

* Acesso exclusivo para usuários autenticados.
* Exibe vagas visualizadas.
* Exibe vagas salvas.
* Permite acompanhamento de oportunidades.

## Landing Page

* Apresentação da plataforma.
* Benefícios do produto.
* Estatísticas do projeto.
* Seção de colaboradores.
* Links para GitHub e redes sociais.

---

# 4. Escopo MVP

## Dentro do MVP

* Landing Page
* Cadastro
* Login
* Recuperação de senha
* Busca de vagas
* Visualização de vagas
* Painel autenticado

## Fora do MVP

* Inteligência artificial
* Matching avançado
* Chat interno
* Aplicação automática
* Assinaturas pagas

> Nota: "Dashboard analítico" estava originalmente listado aqui como fora do MVP, mas já foi entregue — o painel administrativo (`front_admin`) tem um dashboard analítico funcional (métricas de usuários, vagas coletadas, status do scraper) desde a introdução do `front_admin`. Ver [BACKEND.md](BACKEND.md) e [front_admin/README.md](front_admin/README.md).

---

# 5. Critérios de Sucesso

## Produto

* Usuário consegue se cadastrar em menos de 2 minutos.
* Usuário encontra uma vaga em menos de 3 cliques.

## Tecnologia

* Disponibilidade superior a 99%.
* Tempo de carregamento inferior a 3 segundos.

## Comunidade

* Projeto apresentável para eventos.
* Participação ativa dos colaboradores.
* Documentação pública atualizada.

</content>

### Metas por Área

## Frontend

### Objetivo

Entregar uma experiência simples, rápida e responsiva.

### Entregas

**Sprint 1**

* Estrutura base do projeto
* Sistema de rotas
* Layout global
* Landing Page

**Sprint 2**

* Tela Login
* Tela Cadastro
* Integração com autenticação

**Sprint 3**

* Busca de Vagas
* Lista de vagas
* Filtros

**Sprint 4**

* Painel autenticado
* Controle de acesso
* Ajustes de UX

### Critérios de Aceite

* Responsivo Mobile/Desktop
* Acessibilidade básica
* Feedback visual de carregamento
* Tratamento de erros

---

## Backend

### Objetivo

Disponibilizar APIs seguras e escaláveis para suportar o MVP.

### Entregas

**Sprint 1**

* Arquitetura
* Banco de dados
* Setup ambiente

**Sprint 2**

* Cadastro
* Login
* JWT/Auth

**Sprint 3**

* API de vagas
* Filtros
* Busca

**Sprint 4**

* Painel do usuário
* Histórico de ações
* Hardening de segurança

### Critérios de Aceite

* APIs documentadas
* Cobertura mínima de testes
* Logs estruturados
* Tratamento de exceções

---

## QA

### Objetivo

Garantir qualidade desde o início.

### Entregas

**Sprint 1**

* Estratégia de testes
* Plano de testes

**Sprint 2**

* Casos de teste Login/Cadastro

**Sprint 3**

* Casos de teste Busca de Vagas

**Sprint 4**

* Testes E2E do fluxo principal

### Critérios de Aceite

* Fluxo completo validado
* Bugs críticos zerados
* Regressão executada a cada release

---

## Design

### Objetivo

Criar identidade visual profissional para apresentação em comunidade e mercado.

### Entregas

**Sprint 1**

* Branding
* Logo
* Definição de cores

**Sprint 2**

* Design System
* Componentes reutilizáveis

**Sprint 3**

* Fluxos Login/Cadastro

**Sprint 4**

* Fluxos Busca e Painel

### Critérios de Aceite

* Consistência visual
* Componentização
* Responsividade
* Protótipo navegável

---

## Próxima decisão estratégica (mais importante)

Antes de qualquer desenvolvimento adicional, o time precisa responder uma única pergunta:

**"Qual é o diferencial dessa plataforma em relação ao LinkedIn, Gupy, Indeed e Programathor?"**

Essa resposta será a base para:

* Nome do produto;
* Pitch para eventos;
* Regras de negócio futuras;
* Priorização do backlog;
* Possível validação de mercado.

Sem essa definição, existe o risco de construir apenas mais um agregador de vagas. Com ela, o produto passa a ter identidade, posicionamento e direção clara para evolução.
