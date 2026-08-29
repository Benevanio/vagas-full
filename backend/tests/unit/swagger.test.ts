import { describe, expect, it } from "vitest";
import swaggerSpec from "../../src/swagger";

type SwaggerSpec = {
  servers?: Array<{ url: string }>;
  paths?: Record<string, Record<string, any>>;
  components?: { schemas?: Record<string, any>; responses?: Record<string, any> };
};

describe("swagger", () => {
  it("documenta a API v1 e os endpoints principais", () => {
    const spec = swaggerSpec as SwaggerSpec;

    expect(spec.servers).toContainEqual(
      expect.objectContaining({ url: "/api/v1" }),
    );
    expect(spec.paths).toEqual(
      expect.objectContaining({
        "/auth/login": expect.any(Object),
        "/users/profile": expect.any(Object),
        "/jobs/search": expect.any(Object),
        "/saved-jobs": expect.any(Object),
        "/notifications": expect.any(Object),
        "/admin/users": expect.any(Object),
      }),
    );
  });

  it("descreve contratos, exemplos e respostas para os endpoints principais", () => {
    const spec = swaggerSpec as SwaggerSpec;

    expect(spec.paths?.["/notifications"]?.get.responses[200].content[
      "application/json"
    ].schema).toEqual({ $ref: "#/components/schemas/NotificationListResponse" });
    expect(spec.paths?.["/saved-jobs/{id}"]).toEqual(
      expect.objectContaining({ get: expect.any(Object), patch: expect.any(Object), delete: expect.any(Object) }),
    );
    expect(spec.paths?.["/notifications/read-all"]?.patch.responses).toEqual(
      expect.objectContaining({ 400: { $ref: "#/components/responses/BadRequest" }, 401: { $ref: "#/components/responses/Unauthorized" } }),
    );
    expect(spec.paths?.["/users/preferences"]).toEqual(
      expect.objectContaining({ get: expect.any(Object), post: expect.any(Object), patch: expect.any(Object) }),
    );
    expect(spec.paths?.["/admin/users/{id}"]).toEqual(
      expect.objectContaining({ get: expect.any(Object), delete: expect.any(Object) }),
    );
    expect(spec.components?.schemas).toEqual(
      expect.objectContaining({
        RegisterRequest: expect.any(Object),
        ProfileUpdateRequest: expect.any(Object),
        SavedJobRequest: expect.any(Object),
        NotificationListResponse: expect.any(Object),
      }),
    );
    expect(spec.components?.responses).toEqual(
      expect.objectContaining({
        BadRequest: expect.any(Object),
        Unauthorized: expect.any(Object),
        Forbidden: expect.any(Object),
        NotFound: expect.any(Object),
      }),
    );
    expect(spec.paths).not.toHaveProperty("/api/keywords");
  });
});
