import { describe, expect, it, vi } from "vitest";
import {
  apiContentSecurityPolicy,
  securityHeaders,
  swaggerContentSecurityPolicy,
} from "../../../src/middleware/securityHeaders";

describe("securityHeaders", () => {
  it("aplica uma CSP restritiva e os demais headers de proteção", () => {
    const setHeader = vi.fn();
    const next = vi.fn();

    securityHeaders({ path: "/health" } as any, { setHeader } as any, next);

    expect(setHeader).toHaveBeenCalledWith(
      "Content-Security-Policy",
      apiContentSecurityPolicy,
    );
    expect(apiContentSecurityPolicy).toContain("default-src 'none'");
    expect(apiContentSecurityPolicy).toContain("object-src 'none'");
    expect(apiContentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
    expect(next).toHaveBeenCalledOnce();
  });

  it("mantem o Swagger funcional com uma CSP limitada a documentacao", () => {
    const setHeader = vi.fn();
    const next = vi.fn();

    securityHeaders({ path: "/docs" } as any, { setHeader } as any, next);

    expect(setHeader).toHaveBeenCalledWith(
      "Content-Security-Policy",
      swaggerContentSecurityPolicy,
    );
    expect(swaggerContentSecurityPolicy).toContain("default-src 'self'");
    expect(swaggerContentSecurityPolicy).toContain("script-src 'self' 'unsafe-inline'");
  });
});
