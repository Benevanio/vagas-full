import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConfirmEmailChangePage from "@/domains/auth/presentation/pages/ConfirmEmailChangePage";
import { EmailChangeForm } from "@/domains/new_dashboard/components/profile/EmailChangeForm";

const mocks = vi.hoisted(() => ({
  confirmEmailChange: vi.fn(),
  requestEmailChange: vi.fn(),
}));

vi.mock("@/domains/new_dashboard/infrastructure/userDashboardApi", () => mocks);

describe("troca de e-mail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envia o novo e-mail e informa que a confirmação foi enviada", async () => {
    mocks.requestEmailChange.mockResolvedValue(undefined);
    render(<EmailChangeForm currentEmail="atual@example.com" />);

    fireEvent.change(screen.getByLabelText("Novo e-mail"), {
      target: { value: "novo@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar confirmação" }));

    await waitFor(() => {
      expect(mocks.requestEmailChange).toHaveBeenCalledWith("novo@example.com");
    });
    expect(
      screen.getByText("Enviamos uma confirmação para o novo e-mail."),
    ).toBeInTheDocument();
  });

  it("confirma o token da URL e exibe sucesso", async () => {
    mocks.confirmEmailChange.mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={["/confirmar-email?token=token-seguro"]}>
        <ConfirmEmailChangePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mocks.confirmEmailChange).toHaveBeenCalledWith("token-seguro");
    });
    expect(
      screen.getByText("Seu e-mail foi alterado com sucesso."),
    ).toBeInTheDocument();
  });

  it("mostra erro quando o link não tem token", () => {
    render(
      <MemoryRouter initialEntries={["/confirmar-email"]}>
        <ConfirmEmailChangePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Link de confirmação inválido.")).toBeInTheDocument();
  });
});
