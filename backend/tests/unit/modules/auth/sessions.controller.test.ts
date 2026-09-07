import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionsController } from "../../../../src/modules/auth/sessions.controller";

describe("SessionsController", () => {
  const sessions = {
    list: vi.fn(),
    revoke: vi.fn(),
    revokeOthers: vi.fn(),
  };
  const controller = new SessionsController(sessions as any);
  const req: any = {
    session: { userId: "user-1", sessionId: "current", destroy: vi.fn() },
    params: {},
  };
  const res: any = { json: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    req.params = {};
  });

  it("lista as sessões do próprio usuário", async () => {
    sessions.list.mockResolvedValue([{ id: "current" }]);
    await controller.list(req, res);
    expect(sessions.list).toHaveBeenCalledWith("user-1", "current");
    expect(res.json).toHaveBeenCalledWith({ sessions: [{ id: "current" }] });
  });

  it("encerra a sessão atual e remove o cookie", async () => {
    req.params.sessionId = "current";
    sessions.revoke.mockResolvedValue(true);
    await controller.revoke(req, res);
    expect(req.session.destroy).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true, currentSessionRevoked: true });
  });

  it("informa quando a sessão não existe", async () => {
    req.params.sessionId = "missing";
    sessions.revoke.mockResolvedValue(false);
    await expect(controller.revoke(req, res)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("revoga as outras sessões", async () => {
    sessions.revokeOthers.mockResolvedValue(2);
    await controller.revokeOthers(req, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true, revokedCount: 2 });
  });
});
