// backend/tests/integration/routes/connections.routes.test.ts
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../src/lib/errors";

const mocks = vi.hoisted(() => ({
  listUserConnections: vi.fn(),
  disconnectProvider: vi.fn(),
}));

vi.mock("../../../src/modules/users/functions/listUserConnections", () => ({
  listUserConnections: mocks.listUserConnections,
  SUPPORTED_PROVIDERS: ["google", "linkedin", "github"],
}));

vi.mock("../../../src/modules/users/functions/disconnectProvider", () => ({
  disconnectProvider: mocks.disconnectProvider,
}));

// Sessão fake: injeta userId
vi.mock("../../../src/middleware/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.session = { userId: "user-A" };
    next();
  },
}));

import { errorHandler } from "../../../src/middleware/errorHandler";
import { ConnectionsController } from "../../../src/modules/auth/connections.controller";
import { requireAuth } from "../../../src/middleware/requireAuth";

function buildApp() {
  const app = express();
  app.use(express.json());
  const controller = new ConnectionsController();
  app.get("/auth/connections", requireAuth, (req, res, next) =>
    controller.list(req, res).catch(next),
  );
  app.delete("/auth/connections/:provider", requireAuth, (req, res, next) =>
    controller.disconnect(req, res).catch(next),
  );
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("connections routes", () => {
  it("GET /auth/connections retorna status", async () => {
    mocks.listUserConnections.mockResolvedValue({
      hasPassword: false,
      connections: [{ provider: "google", connected: true, connectedAt: null }],
    });
    const res = await request(buildApp()).get("/auth/connections");
    expect(res.status).toBe(200);
    expect(res.body.connections[0].provider).toBe("google");
  });

  it("DELETE /auth/connections/:provider retorna 200", async () => {
    mocks.disconnectProvider.mockResolvedValue(undefined);
    const res = await request(buildApp()).delete("/auth/connections/google");
    expect(res.status).toBe(200);
    expect(mocks.disconnectProvider).toHaveBeenCalledWith({
      userId: "user-A",
      provider: "google",
    });
  });

  it("DELETE responde 409 no último método", async () => {
    mocks.disconnectProvider.mockRejectedValue(
      AppError.conflict("Não é possível desconectar seu último método de login."),
    );
    const res = await request(buildApp()).delete("/auth/connections/google");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  it("DELETE responde 400 para provider não suportado", async () => {
    const res = await request(buildApp()).delete("/auth/connections/facebook");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(mocks.disconnectProvider).not.toHaveBeenCalled();
  });

  it("recusa provider não escalar antes de desconectar", async () => {
    const controller = new ConnectionsController();

    await expect(
      controller.disconnect(
        {
          session: { userId: "user-A" },
          params: { provider: ["google", "github"] },
        } as any,
        { json: vi.fn() } as any,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(mocks.disconnectProvider).not.toHaveBeenCalled();
  });
});
