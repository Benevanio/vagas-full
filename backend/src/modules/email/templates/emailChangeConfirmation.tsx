import * as React from "react";
import { BaseLayout } from "./BaseLayout";

export interface EmailChangeConfirmationProps {
  confirmationUrl: string;
}

export function EmailChangeConfirmation({
  confirmationUrl,
}: EmailChangeConfirmationProps) {
  return (
    <BaseLayout previewText="Confirme seu novo e-mail no Candidate">
      <h1 style={{ fontSize: "22px", margin: "0 0 16px" }}>
        Confirme seu novo e-mail
      </h1>
      <p style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }}>
        Para concluir a troca de e-mail da sua conta, confirme o novo endereço.
        Este link expira em 30 minutos.
      </p>
      <a
        href={confirmationUrl}
        style={{
          display: "inline-block",
          backgroundColor: "#2563eb",
          color: "#ffffff",
          textDecoration: "none",
          padding: "12px 24px",
          borderRadius: "6px",
          fontSize: "15px",
          fontWeight: "bold",
        }}
      >
        Confirmar novo e-mail
      </a>
    </BaseLayout>
  );
}
