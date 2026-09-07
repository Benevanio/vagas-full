import { beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  enqueueEmail: vi.fn(),
}));

const registryMocks = vi.hoisted(() => ({
  isTemplate: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("../../../../src/modules/email/email.queue", () => ({
  enqueueEmail: queueMocks.enqueueEmail,
}));

vi.mock("../../../../src/modules/email/templates/registry", () => ({
  isTemplate: registryMocks.isTemplate,
}));

vi.mock("../../../../src/config", () => ({
  getConfig: configMocks.getConfig,
}));

vi.mock("../../../../src/logger", () => loggerMocks);

import { EmailService } from "../../../../src/modules/email/email.service";

describe("EmailService", () => {
  let service: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    registryMocks.isTemplate.mockReturnValue(true);
    queueMocks.enqueueEmail.mockResolvedValue(undefined);
    configMocks.getConfig.mockReturnValue({
      frontendUrl: "https://painelvagas.com",
    });
    service = new EmailService();
  });

  describe("send", () => {
    it("enfileira job com { template, to, data } no caminho feliz (EMAIL-01)", async () => {
      await service.send({
        template: "welcome",
        to: "user@example.com",
        data: { name: "Ana" },
      });

      expect(queueMocks.enqueueEmail).toHaveBeenCalledWith({
        template: "welcome",
        to: "user@example.com",
        data: { name: "Ana" },
      });
    });

    it("lança AppError.validation e NÃO enfileira quando 'to' é inválido (EMAIL-05)", async () => {
      await expect(
        service.send({
          template: "welcome",
          to: "nao-e-email",
          data: {},
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

      expect(queueMocks.enqueueEmail).not.toHaveBeenCalled();
    });

    it("lança AppError.validation e NÃO enfileira quando template é desconhecido (EMAIL-05)", async () => {
      registryMocks.isTemplate.mockReturnValue(false);

      await expect(
        service.send({
          template: "inexistente" as never,
          to: "user@example.com",
          data: {},
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

      expect(queueMocks.enqueueEmail).not.toHaveBeenCalled();
    });

    it("engole falha do enqueue: send resolve e loga o erro (EMAIL-10)", async () => {
      queueMocks.enqueueEmail.mockRejectedValue(new Error("valkey down"));

      await expect(
        service.send({
          template: "welcome",
          to: "user@example.com",
          data: {},
        }),
      ).resolves.toBeUndefined();

      expect(loggerMocks.logError).toHaveBeenCalled();
    });

    it("propaga falha do enqueue quando o envio é obrigatório", async () => {
      queueMocks.enqueueEmail.mockRejectedValue(new Error("valkey down"));

      await expect(
        service.send(
          { template: "welcome", to: "user@example.com", data: {} },
          { throwOnEnqueueFailure: true },
        ),
      ).rejects.toThrow("valkey down");
    });
  });

  describe("sendWelcome", () => {
    it("injeta appUrl do frontendUrl e usa template welcome (EMAIL-06/07)", async () => {
      await service.sendWelcome({
        email: "user@example.com",
        name: "Ana",
      });

      expect(queueMocks.enqueueEmail).toHaveBeenCalledWith({
        template: "welcome",
        to: "user@example.com",
        data: { name: "Ana", appUrl: "https://painelvagas.com" },
      });
    });
  });

  describe("sendEmailChangeConfirmation", () => {
    it("usa o template centralizado e inclui o token na URL do frontend", async () => {
      await service.sendEmailChangeConfirmation({
        email: "novo@example.com",
        token: "token-seguro",
      });

      expect(queueMocks.enqueueEmail).toHaveBeenCalledWith({
        template: "emailChangeConfirmation",
        to: "novo@example.com",
        data: {
          confirmationUrl:
            "https://painelvagas.com/confirmar-email?token=token-seguro",
        },
      });
    });
  });
});
