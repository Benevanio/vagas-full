# Segurança

## Content Security Policy

Os frontends publicados por Nginx e Vercel enviam uma Content Security Policy (CSP) restritiva. A política bloqueia plugins, enquadramento por outros sites, scripts externos e execução de scripts inline. Estilos inline permanecem permitidos porque componentes React aplicam estilos dinâmicos; isso não autoriza JavaScript inline.

As origens permitidas são mantidas explicitamente nos arquivos `frontend/nginx.conf`, `front_admin/nginx.conf`, `vercel.json` e `frontend/vercel.json`. Antes de incluir uma nova origem, confirme que ela é necessária e restrinja-a à diretiva correta (`connect-src`, `img-src`, `font-src` ou `style-src`). Não use curingas nem adicione `'unsafe-inline'` a `script-src`.

A API responde com uma CSP ainda mais restritiva, apropriada para respostas JSON: não permite carregar recursos, executar scripts, enviar formulários ou ser incorporada em frames.

## Conteúdo externo

Descrições de vagas são convertidas em elementos React a partir de uma allowlist. Não use `dangerouslySetInnerHTML` para renderizar dados de vagas, perfis ou integrações externas. Links externos devem aceitar somente URLs `http` e `https`; protocolos executáveis e atributos de evento não devem ser propagados para o DOM.

## Sessão

Cookies de sessão são `HttpOnly` e usam `Secure` em produção, com `SameSite` definido. A CSP reduz o impacto de uma regressão de XSS, mas não substitui a validação e a renderização segura de dados.
