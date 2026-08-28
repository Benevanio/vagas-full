import { describe, expect, it } from "vitest";
import swaggerSpec from "../../src/swagger";

type SwaggerSpec = {
  servers?: Array<{ url: string }>;
  paths?: Record<string, unknown>;
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
});
