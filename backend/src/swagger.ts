import path from "path";
import swaggerJsdoc from "swagger-jsdoc";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (name: string) => ({ $ref: `#/components/responses/${name}` });
const auth = [{ cookieAuth: [] }];
const json = (description: string, schema: object, example?: object) => ({
  description,
  content: { "application/json": { schema, ...(example ? { example } : {}) } },
});
const body = (schema: object, example: object) => ({
  required: true,
  content: { "application/json": { schema, example } },
});
const id = {
  in: "path",
  name: "id",
  required: true,
  schema: { type: "string", format: "uuid" },
  example: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
};

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Candidate API",
      version: "1.0.0",
      description: "Contrato HTTP da Candidate. Todos os paths usam o prefixo /api/v1.",
    },
    servers: [{ url: "/api/v1", description: "API v1" }],
    tags: ["System", "Auth", "Users", "Jobs", "Saved jobs", "Notifications", "Keywords", "Admin"].map((name) => ({ name })),
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "candidate_session", description: "Sessão criada no login." },
      },
      schemas: {
        Error: { type: "object", required: ["code", "message"], properties: { code: { type: "string", example: "UNAUTHORIZED" }, message: { type: "string", example: "Autenticação necessária." } } },
        UserProfile: { type: "object", required: ["id", "email"], properties: { id: { type: "string", format: "uuid" }, email: { type: "string", format: "email", example: "ana@exemplo.com" }, displayName: { type: "string", nullable: true, example: "Ana Souza" }, firstName: { type: "string", nullable: true }, lastName: { type: "string", nullable: true }, username: { type: "string", nullable: true }, avatarUrl: { type: "string", format: "uri", nullable: true }, technologies: { type: "array", items: { type: "string" } }, level: { type: "string", nullable: true } } },
        Session: { type: "object", required: ["userId", "role"], properties: { userId: { type: "string", format: "uuid" }, role: { type: "string", enum: ["user", "support", "admin", "super_admin"] } } },
        AuthResponse: { type: "object", required: ["user", "session"], properties: { user: ref("UserProfile"), session: ref("Session") } },
        LoginRequest: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email", example: "ana@exemplo.com" }, password: { type: "string", format: "password", minLength: 1, example: "senha-segura" } } },
        RegisterRequest: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password", minLength: 8, maxLength: 128 }, name: { type: "string", maxLength: 100, example: "Ana Souza" }, phone: { type: "string", example: "+55 11 99999-9999" }, cpf: { type: "string", example: "123.456.789-09" }, technologies: { type: "array", items: { type: "string" }, example: ["React", "TypeScript"] }, level: { type: "string", example: "Pleno" } } },
        ProfileUpdateRequest: { type: "object", properties: { displayName: { type: "string", nullable: true }, firstName: { type: "string", nullable: true }, lastName: { type: "string", nullable: true }, username: { type: "string", pattern: "^[a-z0-9_]+$" }, avatarUrl: { type: "string", format: "uri", nullable: true }, phone: { type: "string", nullable: true }, cpf: { type: "string", nullable: true }, technologies: { type: "array", maxItems: 30, items: { type: "string" } }, technologyExperiences: { type: "array", items: { type: "object", properties: { name: { type: "string" }, years: { type: "number", minimum: 0, maximum: 50 } } } }, level: { type: "string", nullable: true } } },
        Preferences: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, example: ["react", "node"] }, searchLocation: { type: "string", nullable: true }, searchLanguage: { type: "string", minLength: 2, maxLength: 2 }, remoteOnly: { type: "boolean" }, jobTypes: { type: "array", items: { type: "string", enum: ["Remoto", "Híbrido", "Presencial"] } }, emailNotifications: { type: "boolean" }, careerChecklist: { type: "array", items: { type: "object", additionalProperties: true } } } },
        Job: { type: "object", required: ["id", "jobTitle", "company", "jobLink"], properties: { id: { type: "string", example: "job-123" }, jobTitle: { type: "string", example: "Desenvolvedor Backend" }, company: { type: "string", example: "Candidate" }, location: { type: "string", example: "Remoto" }, jobLink: { type: "string", format: "uri", example: "https://empresa.exemplo/vagas/123" }, source: { type: "string", example: "LinkedIn" }, keyword: { type: "string", example: "node" } } },
        JobSearchResponse: { type: "object", required: ["jobs"], properties: { jobs: { type: "array", items: ref("Job") }, total: { type: "integer", example: 1 }, source: { type: "string", example: "valkey_filtered_by_keywords" } } },
        SavedJobRequest: { type: "object", required: ["jobLink"], properties: { jobLink: { type: "string", format: "uri" }, jobTitle: { type: "string" }, company: { type: "string" }, location: { type: "string" }, source: { type: "string" }, keyword: { type: "string" }, status: { type: "string", enum: ["saved", "applied", "interviewing", "rejected", "accepted"] }, appliedAt: { type: "string", format: "date-time" }, notes: { type: "string" } } },
        SavedJob: { allOf: [ref("SavedJobRequest"), { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } }] },
        ApplicationEvent: { type: "object", properties: { id: { type: "string", format: "uuid" }, type: { type: "string", example: "status_changed" }, fromStatus: { type: "string", nullable: true }, toStatus: { type: "string" }, createdAt: { type: "string", format: "date-time" } } },
        Notification: { type: "object", required: ["id", "channel", "message", "createdAt"], properties: { id: { type: "string", format: "uuid" }, channel: { type: "string", enum: ["notification", "message"] }, type: { type: "string" }, title: { type: "string" }, message: { type: "string" }, readAt: { type: "string", format: "date-time", nullable: true }, createdAt: { type: "string", format: "date-time" }, entityType: { type: "string", nullable: true }, entityId: { type: "string", nullable: true } } },
        NotificationListResponse: { type: "object", required: ["notifications", "unreadCount"], properties: { notifications: { type: "array", items: ref("Notification") }, unreadCount: { type: "integer", minimum: 0, example: 1 } } },
        MutationResult: { type: "object", properties: { ok: { type: "boolean", example: true }, updated: { type: "integer", example: 1 }, deleted: { type: "integer", example: 1 } } },
        AdminUser: { type: "object", properties: { id: { type: "string", format: "uuid" }, email: { type: "string", format: "email" }, role: { type: "string" }, isBlocked: { type: "boolean" } } },
      },
      responses: {
        BadRequest: json("Dados inválidos.", ref("Error"), { code: "VALIDATION_ERROR", message: "Dados de entrada inválidos." }),
        Unauthorized: json("Autenticação necessária.", ref("Error"), { code: "UNAUTHORIZED", message: "Autenticação necessária." }),
        Forbidden: json("Permissão insuficiente.", ref("Error"), { code: "FORBIDDEN", message: "Permissão insuficiente." }),
        NotFound: json("Recurso não encontrado.", ref("Error"), { code: "NOT_FOUND", message: "Recurso não encontrado." }),
        InternalError: json("Erro interno.", ref("Error"), { code: "INTERNAL_ERROR", message: "Erro inesperado." }),
      },
    },
    paths: {
      "/health": { get: { tags: ["System"], summary: "Verifica a disponibilidade", responses: { 200: json("API disponível.", { type: "object", properties: { ok: { type: "boolean" } } }, { ok: true }) } } },
      "/auth/register": { post: { tags: ["Auth"], summary: "Cria conta e sessão", requestBody: body(ref("RegisterRequest"), { email: "ana@exemplo.com", password: "senha-segura", name: "Ana Souza" }), responses: { 201: json("Conta criada.", ref("AuthResponse")), 400: response("BadRequest"), 500: response("InternalError") } } },
      "/auth/login": { post: { tags: ["Auth"], summary: "Inicia sessão", requestBody: body(ref("LoginRequest"), { email: "ana@exemplo.com", password: "senha-segura" }), responses: { 200: json("Sessão iniciada.", ref("AuthResponse")), 400: response("BadRequest"), 401: response("Unauthorized") } } },
      "/auth/logout": { post: { tags: ["Auth"], summary: "Encerra sessão", responses: { 200: json("Sessão encerrada.", ref("MutationResult"), { ok: true }) } } },
      "/auth/me": { get: { tags: ["Auth"], summary: "Consulta sessão atual", security: auth, responses: { 200: json("Sessão atual.", { type: "object", properties: { user: ref("UserProfile") } }), 401: response("Unauthorized") } } },
      "/auth/{provider}/url": { get: { tags: ["Auth"], summary: "Obtém URL OAuth", parameters: [{ in: "path", name: "provider", required: true, schema: { type: "string", enum: ["google", "github", "linkedin"] } }], responses: { 200: json("URL de autorização.", { type: "object", properties: { url: { type: "string", format: "uri" } } }, { url: "https://accounts.example/authorize" }), 400: response("BadRequest") } } },
      "/auth/{provider}/callback": { get: { tags: ["Auth"], summary: "Processa callback OAuth", parameters: [{ in: "path", name: "provider", required: true, schema: { type: "string", enum: ["google", "github", "linkedin"] } }], responses: { 302: { description: "Redireciona após autenticação." }, 400: response("BadRequest") } } },
      "/auth/connections": { get: { tags: ["Auth"], summary: "Lista conexões OAuth", security: auth, responses: { 200: json("Conexões ativas.", { type: "array", items: { type: "object", properties: { provider: { type: "string" } } } }), 401: response("Unauthorized") } } },
      "/auth/connections/{provider}": { delete: { tags: ["Auth"], summary: "Desconecta provedor OAuth", security: auth, parameters: [{ in: "path", name: "provider", required: true, schema: { type: "string", enum: ["google", "github", "linkedin"] } }], responses: { 204: { description: "Conexão removida." }, 401: response("Unauthorized"), 404: response("NotFound") } } },
      "/users/profile": { get: { tags: ["Users"], summary: "Consulta perfil", security: auth, responses: { 200: json("Perfil.", ref("UserProfile")), 401: response("Unauthorized"), 404: response("NotFound") } }, patch: { tags: ["Users"], summary: "Atualiza perfil", security: auth, requestBody: body(ref("ProfileUpdateRequest"), { displayName: "Ana Souza", technologies: ["React"] }), responses: { 200: json("Perfil atualizado.", ref("UserProfile")), 400: response("BadRequest"), 401: response("Unauthorized") } } },
      "/users/preferences": { get: { tags: ["Users"], summary: "Consulta preferências", security: auth, responses: { 200: json("Preferências.", ref("Preferences")), 401: response("Unauthorized"), 404: response("NotFound") } }, post: { tags: ["Users"], summary: "Cria preferências", security: auth, requestBody: body(ref("Preferences"), { keywords: ["react"], remoteOnly: true }), responses: { 201: json("Preferências criadas.", ref("Preferences")), 400: response("BadRequest"), 401: response("Unauthorized") } }, patch: { tags: ["Users"], summary: "Atualiza preferências", security: auth, requestBody: body(ref("Preferences"), { emailNotifications: false }), responses: { 200: json("Preferências atualizadas.", ref("Preferences")), 400: response("BadRequest"), 401: response("Unauthorized") } } },
      "/jobs/search": { get: { tags: ["Jobs"], summary: "Busca vagas", security: auth, parameters: [{ in: "query", name: "keywords", schema: { type: "string" }, example: "react,node" }], responses: { 200: json("Vagas encontradas.", ref("JobSearchResponse"), { jobs: [{ id: "job-123", jobTitle: "Desenvolvedor Backend", company: "Candidate", jobLink: "https://empresa.exemplo/vagas/123" }], total: 1 }), 401: response("Unauthorized") } } },
      "/saved-jobs": {
        get: { tags: ["Saved jobs"], summary: "Lista vagas salvas", security: auth, responses: { 200: json("Vagas salvas.", { type: "array", items: ref("SavedJob") }), 401: response("Unauthorized") } },
        post: { tags: ["Saved jobs"], summary: "Salva vaga", security: auth, requestBody: body(ref("SavedJobRequest"), { jobLink: "https://empresa.exemplo/vagas/123", jobTitle: "Desenvolvedor Backend", status: "saved" }), responses: { 201: json("Vaga salva.", ref("SavedJob")), 400: response("BadRequest"), 401: response("Unauthorized") } },
      },
      "/saved-jobs/{id}": {
        get: { tags: ["Saved jobs"], summary: "Consulta vaga salva", security: auth, parameters: [id], responses: { 200: json("Vaga salva.", ref("SavedJob")), 401: response("Unauthorized"), 404: response("NotFound") } },
        patch: { tags: ["Saved jobs"], summary: "Atualiza vaga salva", security: auth, parameters: [id], requestBody: body(ref("SavedJobRequest"), { status: "applied", notes: "Candidatura enviada." }), responses: { 200: json("Vaga atualizada.", ref("SavedJob")), 400: response("BadRequest"), 401: response("Unauthorized"), 404: response("NotFound") } },
        delete: { tags: ["Saved jobs"], summary: "Remove vaga salva", security: auth, parameters: [id], responses: { 204: { description: "Vaga removida." }, 401: response("Unauthorized"), 404: response("NotFound") } },
      },
      "/saved-jobs/{id}/events": { get: { tags: ["Saved jobs"], summary: "Lista histórico da candidatura", security: auth, parameters: [id], responses: { 200: json("Eventos.", { type: "array", items: ref("ApplicationEvent") }), 401: response("Unauthorized"), 404: response("NotFound") } } },
      "/notifications": {
        get: { tags: ["Notifications"], summary: "Lista notificações ou mensagens", security: auth, parameters: [{ in: "query", name: "channel", schema: { type: "string", enum: ["notification", "message"] } }, { in: "query", name: "unreadOnly", schema: { type: "boolean" } }, { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 30 } }], responses: { 200: json("Feed.", ref("NotificationListResponse"), { notifications: [], unreadCount: 0 }), 400: response("BadRequest"), 401: response("Unauthorized") } },
        delete: { tags: ["Notifications"], summary: "Limpa notificações", security: auth, parameters: [{ in: "query", name: "channel", schema: { type: "string", enum: ["notification", "message"] } }], responses: { 200: json("Notificações removidas.", ref("MutationResult")), 400: response("BadRequest"), 401: response("Unauthorized") } },
      },
      "/notifications/read-all": { patch: { tags: ["Notifications"], summary: "Marca todas como lidas", security: auth, parameters: [{ in: "query", name: "channel", schema: { type: "string", enum: ["notification", "message"] } }], responses: { 200: json("Notificações atualizadas.", ref("MutationResult")), 400: response("BadRequest"), 401: response("Unauthorized") } } },
      "/notifications/{id}/read": { patch: { tags: ["Notifications"], summary: "Marca uma notificação como lida", security: auth, parameters: [id], responses: { 200: json("Notificação atualizada.", ref("Notification")), 401: response("Unauthorized"), 404: response("NotFound") } } },
      "/keywords": {
        get: {
          tags: ["Keywords"], summary: "Lista keywords", security: auth,
          responses: {
            200: json("Keywords.", { type: "object", properties: {
              ok: { type: "boolean" },
              keywords: { type: "array", items: { type: "object", properties: { keyword: { type: "string" }, source: { type: "string" } } } },
            } }),
            401: response("Unauthorized"),
          },
        },
        post: {
          tags: ["Keywords"], summary: "Enfileira keyword", security: auth,
          requestBody: body({ type: "object", required: ["keyword"], properties: { keyword: { type: "string" } } }, { keyword: "golang" }),
          responses: { 202: json("Keyword enfileirada.", ref("MutationResult")), 400: response("BadRequest"), 401: response("Unauthorized"), 403: response("Forbidden") },
        },
      },
      "/admin/dashboard": { get: { tags: ["Admin"], summary: "Consulta dashboard administrativo", security: auth, responses: { 200: json("Resumo administrativo.", { type: "object", additionalProperties: true }), 401: response("Unauthorized"), 403: response("Forbidden") } } },
      "/admin/users": { get: { tags: ["Admin"], summary: "Lista usuários administrativos", security: auth, responses: { 200: json("Usuários.", { type: "array", items: ref("AdminUser") }), 401: response("Unauthorized"), 403: response("Forbidden") } } },
      "/admin/users/{id}": { get: { tags: ["Admin"], summary: "Consulta usuário", security: auth, parameters: [id], responses: { 200: json("Usuário.", ref("AdminUser")), 401: response("Unauthorized"), 403: response("Forbidden"), 404: response("NotFound") } }, delete: { tags: ["Admin"], summary: "Exclui usuário", security: auth, parameters: [id], responses: { 204: { description: "Usuário removido." }, 401: response("Unauthorized"), 403: response("Forbidden"), 404: response("NotFound") } } },
      "/admin/users/{id}/block": { patch: { tags: ["Admin"], summary: "Bloqueia usuário", security: auth, parameters: [id], responses: { 200: json("Usuário bloqueado.", ref("AdminUser")), 401: response("Unauthorized"), 403: response("Forbidden"), 404: response("NotFound") } } },
      "/admin/users/{id}/unblock": { patch: { tags: ["Admin"], summary: "Desbloqueia usuário", security: auth, parameters: [id], responses: { 200: json("Usuário desbloqueado.", ref("AdminUser")), 401: response("Unauthorized"), 403: response("Forbidden"), 404: response("NotFound") } } },
      "/admin/users/{id}/reset": { post: { tags: ["Admin"], summary: "Solicita redefinição de senha", security: auth, parameters: [id], responses: { 200: json("Redefinição solicitada.", ref("MutationResult")), 401: response("Unauthorized"), 403: response("Forbidden"), 404: response("NotFound") } } },
      "/admin/users/{id}/role": { patch: { tags: ["Admin"], summary: "Altera o papel de um usuário", security: auth, parameters: [id], requestBody: body({ type: "object", required: ["role"], properties: { role: { type: "string", enum: ["user", "support", "admin", "super_admin"] } } }, { role: "support" }), responses: { 200: json("Papel atualizado.", ref("AdminUser")), 400: response("BadRequest"), 401: response("Unauthorized"), 403: response("Forbidden"), 404: response("NotFound") } } },
      "/admin/scrapers": { get: { tags: ["Admin"], summary: "Lista scrapers", security: auth, responses: { 200: json("Scrapers.", { type: "array", items: { type: "object", additionalProperties: true } }), 401: response("Unauthorized"), 403: response("Forbidden") } } },
      "/admin/scrapers/run": { post: { tags: ["Admin"], summary: "Dispara todos os scrapers", security: auth, responses: { 202: json("Execução iniciada.", ref("MutationResult")), 401: response("Unauthorized"), 403: response("Forbidden") } } },
      "/admin/scrapers/{id}/run": { post: { tags: ["Admin"], summary: "Dispara um scraper", security: auth, parameters: [id], responses: { 202: json("Execução iniciada.", ref("MutationResult")), 401: response("Unauthorized"), 403: response("Forbidden"), 404: response("NotFound") } } },
      "/admin/scrapers/status": { get: { tags: ["Admin"], summary: "Consulta status dos scrapers", security: auth, responses: { 200: json("Status dos scrapers.", { type: "object", additionalProperties: true }), 401: response("Unauthorized"), 403: response("Forbidden") } } },
      "/admin/scrapers/jobs": { get: { tags: ["Admin"], summary: "Lista vagas coletadas", security: auth, responses: { 200: json("Vagas coletadas.", { type: "array", items: ref("Job") }), 401: response("Unauthorized"), 403: response("Forbidden") } } },
      "/admin/scrapers/jobs/count": { get: { tags: ["Admin"], summary: "Conta vagas coletadas", security: auth, responses: { 200: json("Contagem de vagas.", { type: "object", properties: { count: { type: "integer", example: 42 } } }), 401: response("Unauthorized"), 403: response("Forbidden") } } },
      "/admin/observability/health": { get: { tags: ["Admin"], summary: "Consulta saúde operacional", security: auth, responses: { 200: json("Saúde operacional.", { type: "object", additionalProperties: true }), 401: response("Unauthorized"), 403: response("Forbidden") } } },
      "/admin/observability/metrics": { get: { tags: ["Admin"], summary: "Consulta métricas operacionais", security: auth, responses: { 200: json("Métricas operacionais.", { type: "object", additionalProperties: true }), 401: response("Unauthorized"), 403: response("Forbidden") } } },
      "/admin/observability/dashboards": { get: { tags: ["Admin"], summary: "Lista dashboards operacionais", security: auth, responses: { 200: json("Dashboards operacionais.", { type: "array", items: { type: "object", additionalProperties: true } }), 401: response("Unauthorized"), 403: response("Forbidden") } } },
      "/admin/audit": { get: { tags: ["Admin"], summary: "Consulta logs de auditoria", security: auth, responses: { 200: json("Logs.", { type: "object", additionalProperties: true }), 401: response("Unauthorized"), 403: response("Forbidden") } } },
      "/admin/permissions/rules": {
        get: { tags: ["Admin"], summary: "Lista regras de permissão", security: auth, responses: { 200: json("Regras de permissão.", { type: "array", items: { type: "object", additionalProperties: true } }), 401: response("Unauthorized"), 403: response("Forbidden") } },
        patch: { tags: ["Admin"], summary: "Atualiza regras de permissão", security: auth, requestBody: body({ type: "object", additionalProperties: true }, {}), responses: { 200: json("Regras atualizadas.", { type: "array", items: { type: "object", additionalProperties: true } }), 400: response("BadRequest"), 401: response("Unauthorized"), 403: response("Forbidden") } },
      },
      "/admin/jobs/cache": { delete: { tags: ["Admin"], summary: "Limpa o cache de vagas", security: auth, responses: { 200: json("Cache limpo.", ref("MutationResult")), 401: response("Unauthorized"), 403: response("Forbidden"), 500: response("InternalError") } } },
    },
  },
  apis: [path.resolve("src/**/*.ts")],
};

export default swaggerJsdoc(options);
