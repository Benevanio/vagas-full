import path from "path";
import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Jobs API",
      version: "1.0.0",
      description: "API versionada para a plataforma Candidate.",
    },
    servers: [{ url: "/api/v1", description: "API v1" }],
    components: {
      schemas: {
        Error: {
          type: "object",
          required: ["code", "message"],
          properties: {
            code: { type: "string", example: "UNAUTHORIZED" },
            message: { type: "string", example: "Autenticação necessária." },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email", example: "ana@exemplo.com" },
            password: { type: "string", format: "password", example: "senha-segura" },
          },
        },
        RegisterRequest: {
          allOf: [
            { $ref: "#/components/schemas/LoginRequest" },
            {
              type: "object",
              properties: {
                name: { type: "string", example: "Ana Souza" },
              },
            },
          ],
        },
        UserProfile: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            displayName: { type: "string", example: "Ana Souza" },
            email: { type: "string", format: "email" },
          },
        },
        Job: {
          type: "object",
          properties: {
            id: { type: "string", example: "job-123" },
            title: { type: "string", example: "Desenvolvedor Backend" },
            company: { type: "string", example: "Candidate" },
          },
        },
        Notification: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string", example: "Sua candidatura foi registrada." },
            isRead: { type: "boolean", example: false },
          },
        },
        SavedJobRequest: {
          type: "object",
          required: ["jobLink"],
          properties: {
            jobLink: {
              type: "string",
              format: "uri",
              example: "https://empresa.exemplo/vagas/123",
            },
            jobTitle: { type: "string", example: "Desenvolvedor Backend" },
            company: { type: "string", example: "Candidate" },
            status: { type: "string", example: "saved" },
          },
        },
      },
      responses: {
        BadRequest: {
          description: "Dados inválidos",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Unauthorized: {
          description: "Autenticação necessária",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
    paths: {
      "/auth/register": { post: { tags: ["Auth"], summary: "Cria uma conta", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterRequest" } } } }, responses: { 201: { description: "Conta criada" }, 400: { $ref: "#/components/responses/BadRequest" } } } },
      "/auth/login": { post: { tags: ["Auth"], summary: "Inicia sessão", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } } }, responses: { 200: { description: "Sessão iniciada" }, 401: { $ref: "#/components/responses/Unauthorized" } } } },
      "/auth/me": { get: { tags: ["Auth"], summary: "Retorna a sessão atual", responses: { 200: { description: "Usuário autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } } }, 401: { $ref: "#/components/responses/Unauthorized" } } } },
      "/users/profile": { get: { tags: ["Users"], summary: "Consulta o perfil", responses: { 200: { description: "Perfil", content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfile" } } } }, 401: { $ref: "#/components/responses/Unauthorized" } } }, patch: { tags: ["Users"], summary: "Atualiza o perfil", requestBody: { content: { "application/json": { example: { displayName: "Ana Souza" } } } }, responses: { 200: { description: "Perfil atualizado" }, 400: { $ref: "#/components/responses/BadRequest" }, 401: { $ref: "#/components/responses/Unauthorized" } } } },
      "/jobs/search": { get: { tags: ["Jobs"], summary: "Busca vagas", parameters: [{ in: "query", name: "keywords", schema: { type: "string" }, example: "react,node" }], responses: { 200: { description: "Vagas encontradas", content: { "application/json": { schema: { type: "object", properties: { jobs: { type: "array", items: { $ref: "#/components/schemas/Job" } } } } } } }, 401: { $ref: "#/components/responses/Unauthorized" } } } },
      "/saved-jobs": { get: { tags: ["Saved jobs"], summary: "Lista vagas salvas", responses: { 200: { description: "Vagas salvas" }, 401: { $ref: "#/components/responses/Unauthorized" } } }, post: { tags: ["Saved jobs"], summary: "Salva uma vaga", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SavedJobRequest" } } } }, responses: { 201: { description: "Vaga salva" }, 400: { $ref: "#/components/responses/BadRequest" }, 401: { $ref: "#/components/responses/Unauthorized" } } } },
      "/notifications": { get: { tags: ["Notifications"], summary: "Lista notificações", responses: { 200: { description: "Notificações", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Notification" } } } } }, 401: { $ref: "#/components/responses/Unauthorized" } } }, delete: { tags: ["Notifications"], summary: "Limpa notificações", responses: { 204: { description: "Notificações removidas" }, 401: { $ref: "#/components/responses/Unauthorized" } } } },
      "/admin/users": { get: { tags: ["Admin"], summary: "Lista usuários administrativos", responses: { 200: { description: "Usuários" }, 401: { $ref: "#/components/responses/Unauthorized" }, 403: { description: "Permissão insuficiente" } } } },
    },
  },
  apis: [path.resolve("src/**/*.ts")],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
