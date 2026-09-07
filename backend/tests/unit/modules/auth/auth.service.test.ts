import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUrl: vi.fn(),
  exchangeCode: vi.fn(),
  findOrCreateUser: vi.fn(),
  sendWelcome: vi.fn(),
}));

vi.mock("../../../../src/modules/email/email.service", () => ({
  emailService: {
    sendWelcome: mocks.sendWelcome,
  },
}));

vi.mock("../../../../src/modules/auth/providers/auth.provider", () => ({
  providers: {
    github: {
      getAuthUrl: mocks.getAuthUrl,
      exchangeCode: mocks.exchangeCode,
    },
    google: {
      getAuthUrl: mocks.getAuthUrl,
      exchangeCode: mocks.exchangeCode,
    },
    linkedin: {
      getAuthUrl: mocks.getAuthUrl,
      exchangeCode: mocks.exchangeCode,
    },
  },
}));

vi.mock("../../../../src/modules/users/functions/findOrCreateUser", () => ({
  findOrCreateUser: mocks.findOrCreateUser,
}));

import { AuthService } from "../../../../src/modules/auth/auth.service";

const validCallbackParams = {
  provider: "github" as const,
  code: "abc123",
  state: "xyz",
  callbackUrl:
    "http://localhost:3001/api/auth/github/callback?code=abc123&state=xyz",
};

const mockProfile = {
  id: "github-123",
  email: "user@example.com",
  name: "Hudson Tavares",
};

const mockUser = {
  id: "uuid-123",
  username: "hudson",
  email: "user@example.com",
  role: "user",
};

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService();
  });

  describe("getAuthUrl", () => {
    it("returns auth url from provider", async () => {
      mocks.getAuthUrl.mockResolvedValueOnce("https://github.com/oauth");

      const result = await service.getAuthUrl("github", "state123");

      expect(result).toBe("https://github.com/oauth");
      expect(mocks.getAuthUrl).toHaveBeenCalledWith("state123");
    });

    it("throws when provider is invalid", async () => {
      await expect(
        service.getAuthUrl("invalid" as any, "state"),
      ).rejects.toThrow("Provider inválido");
    });
  });

  describe("getProfileFromProvider", () => {
    it("returns profile from provider", async () => {
      mocks.exchangeCode.mockResolvedValueOnce(mockProfile);

      const result = await service.getProfileFromProvider(validCallbackParams);

      expect(result).toEqual(mockProfile);
      expect(mocks.exchangeCode).toHaveBeenCalledWith({
        code: "abc123",
        state: "xyz",
        callbackUrl: validCallbackParams.callbackUrl,
      });
    });

    it("throws when provider is invalid", async () => {
      await expect(
        service.getProfileFromProvider({
          ...validCallbackParams,
          provider: "invalid" as any,
        }),
      ).rejects.toThrow("Provider inválido");
    });
  });

  describe("createSession", () => {
    it("returns session with userId and role", async () => {
      const session = await service.createSession({
        id: "uuid-123",
        role: "user",
      });

      expect(session).toEqual({ userId: "uuid-123", role: "user" });
    });
  });

  describe("handleCallback", () => {
    it("returns user and session on success", async () => {
      mocks.exchangeCode.mockResolvedValueOnce(mockProfile);
      mocks.findOrCreateUser.mockResolvedValueOnce({
        user: mockUser,
        isNewUser: false,
      });

      const result = await service.handleCallback(validCallbackParams);

      expect(result.user).toEqual(mockUser);
      expect(result.session).toEqual({ userId: "uuid-123", role: "user" });
    });

    it("enfileira boas-vindas quando é o primeiro login social (usuário novo)", async () => {
      mocks.exchangeCode.mockResolvedValueOnce(mockProfile);
      mocks.findOrCreateUser.mockResolvedValueOnce({
        user: mockUser,
        isNewUser: true,
      });

      await service.handleCallback(validCallbackParams);

      expect(mocks.sendWelcome).toHaveBeenCalledWith({
        email: mockUser.email,
        name: mockUser.username,
      });
    });

    it("não enfileira boas-vindas quando o usuário já existia (relogin/vínculo)", async () => {
      mocks.exchangeCode.mockResolvedValueOnce(mockProfile);
      mocks.findOrCreateUser.mockResolvedValueOnce({
        user: mockUser,
        isNewUser: false,
      });

      await service.handleCallback(validCallbackParams);

      expect(mocks.sendWelcome).not.toHaveBeenCalled();
    });

    it("conclui o login mesmo se o envio de boas-vindas falhar", async () => {
      mocks.exchangeCode.mockResolvedValueOnce(mockProfile);
      mocks.findOrCreateUser.mockResolvedValueOnce({
        user: mockUser,
        isNewUser: true,
      });
      mocks.sendWelcome.mockRejectedValueOnce(new Error("valkey down"));

      const result = await service.handleCallback(validCallbackParams);

      expect(result.user).toEqual(mockUser);
      expect(result.session).toEqual({ userId: "uuid-123", role: "user" });
    });

    it("throws when exchangeCode fails", async () => {
      mocks.exchangeCode.mockRejectedValueOnce(new Error("invalid code"));

      await expect(service.handleCallback(validCallbackParams)).rejects.toThrow(
        "invalid code",
      );
    });

    it("throws when findOrCreateUser fails", async () => {
      mocks.exchangeCode.mockResolvedValueOnce(mockProfile);
      mocks.findOrCreateUser.mockRejectedValueOnce(new Error("db error"));

      await expect(service.handleCallback(validCallbackParams)).rejects.toThrow(
        "db error",
      );
    });

    it("throws when profile has no email", async () => {
      mocks.exchangeCode.mockResolvedValueOnce({
        ...mockProfile,
        email: undefined,
      });

      await expect(service.handleCallback(validCallbackParams)).rejects.toThrow(
        "oauth_email_required",
      );

      expect(mocks.findOrCreateUser).not.toHaveBeenCalled();
    });

    it("calls findOrCreateUser with provider and profile", async () => {
      mocks.exchangeCode.mockResolvedValueOnce(mockProfile);
      mocks.findOrCreateUser.mockResolvedValueOnce({
        user: mockUser,
        isNewUser: false,
      });

      await service.handleCallback(validCallbackParams);

      expect(mocks.findOrCreateUser).toHaveBeenCalledWith({
        provider: "github",
        profile: mockProfile,
      });
    });

    it("uses a fallback name when the social profile has no name", async () => {
      mocks.exchangeCode.mockResolvedValueOnce(mockProfile);
      mocks.findOrCreateUser.mockResolvedValueOnce({
        user: { ...mockUser, displayName: null, username: null },
        isNewUser: true,
      });

      await service.handleCallback(validCallbackParams);

      expect(mocks.sendWelcome).toHaveBeenCalledWith({
        email: mockUser.email,
        name: "Usuário",
      });
    });
  });
});
