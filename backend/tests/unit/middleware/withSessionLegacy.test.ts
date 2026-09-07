import { beforeEach, describe, expect, it, vi } from "vitest";

const ironMocks = vi.hoisted(() => ({ getIronSession: vi.fn() }));
vi.mock("iron-session", () => ({ getIronSession: ironMocks.getIronSession }));

const sessionServiceMocks = vi.hoisted(() => ({ isActive: vi.fn() }));
vi.mock("../../../src/modules/auth/session.service", () => ({
  SessionService: class {
    isActive = sessionServiceMocks.isActive;
  },
}));

import { withSession } from "../../../src/middleware/withSession";

function run(session: Record<string, unknown>) {
  const destroy = vi.fn().mockResolvedValue(undefined);
  ironMocks.getIronSession.mockResolvedValue({ ...session, destroy });
  const req = {} as never;
  const next = vi.fn();
  return { destroy, next, done: withSession(req, {} as never, next) };
}

describe("withSession — sessões legadas (PAV-37)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionServiceMocks.isActive.mockResolvedValue(true);
  });

  it("invalida cookie com userId mas sem sessionId", async () => {
    // Cookie emitido antes da gestão de sessões: não existe em `user_sessions`,
    // logo não aparece na listagem nem pode ser revogado. Deixar passar
    // manteria sessões fora do controle que a feature promete.
    const { destroy, done } = run({ userId: "user-1" });
    await done;

    expect(destroy).toHaveBeenCalledOnce();
    expect(sessionServiceMocks.isActive).not.toHaveBeenCalled();
  });

  it("mantém a sessão quando ela é válida e rastreada", async () => {
    const { destroy, done } = run({ userId: "user-1", sessionId: "sess-1" });
    await done;

    expect(destroy).not.toHaveBeenCalled();
    expect(sessionServiceMocks.isActive).toHaveBeenCalledWith("user-1", "sess-1");
  });

  it("invalida a sessão rastreada que foi revogada", async () => {
    sessionServiceMocks.isActive.mockResolvedValue(false);

    const { destroy, done } = run({ userId: "user-1", sessionId: "sess-1" });
    await done;

    expect(destroy).toHaveBeenCalledOnce();
  });

  it("não mexe em requisição sem usuário", async () => {
    const { destroy, next, done } = run({});
    await done;

    expect(destroy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});
