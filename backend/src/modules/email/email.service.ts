import { getConfig } from "../../config";
import { AppError } from "../../lib/errors";
import { logError } from "../../logger";
import { enqueueEmail } from "./email.queue";
import { isTemplate, type TemplateName } from "./templates/registry";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendEmailInput {
  template: TemplateName;
  to: string;
  data: Record<string, unknown>;
}

/**
 * API interna única de envio de e-mail. Valida e enfileira; nunca aguarda a
 * entrega. Erros de validação (bug do caller) lançam `AppError.validation`;
 * falha de enqueue (ex.: Valkey down) é logada e engolida (EMAIL-05/10).
 */
export class EmailService {
  async send(
    { template, to, data }: SendEmailInput,
    options: { throwOnEnqueueFailure?: boolean } = {},
  ): Promise<void> {
    if (!EMAIL_REGEX.test(to)) {
      throw AppError.validation(`E-mail de destino inválido: ${to}`);
    }

    if (!isTemplate(template)) {
      throw AppError.validation(`Template de e-mail desconhecido: ${template}`);
    }

    try {
      await enqueueEmail({ template, to, data });
    } catch (error) {
      logError("Falha ao enfileirar e-mail.", {
        template,
        to,
        error: error instanceof Error ? error.message : String(error),
      });
      if (options.throwOnEnqueueFailure) throw error;
    }
  }

  /**
   * Açúcar sobre `send` para o e-mail de boas-vindas. Injeta `appUrl` a partir
   * de `FRONTEND_URL` (config.frontendUrl) para o botão "Acessar plataforma".
   */
  async sendWelcome({
    email,
    name,
  }: {
    email: string;
    name: string;
  }): Promise<void> {
    const { frontendUrl } = getConfig();

    await this.send({
      template: "welcome",
      to: email,
      data: { name, appUrl: frontendUrl },
    });
  }

  async sendEmailChangeConfirmation({
    email,
    token,
    required = false,
  }: {
    email: string;
    token: string;
    required?: boolean;
  }): Promise<void> {
    const { frontendUrl } = getConfig();
    const confirmationUrl = new URL("/confirmar-email", frontendUrl);
    confirmationUrl.searchParams.set("token", token);

    await this.send(
      {
        template: "emailChangeConfirmation",
        to: email,
        data: { confirmationUrl: confirmationUrl.toString() },
      },
      { throwOnEnqueueFailure: required },
    );
  }
}

/**
 * Instância compartilhada para uso pelos callers internos.
 */
export const emailService = new EmailService();
