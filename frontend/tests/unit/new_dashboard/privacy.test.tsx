import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyPanel } from "@/domains/new_dashboard/components/profile/PrivacyPanel";

const mocks = vi.hoisted(() => ({
  exportUserData: vi.fn(),
  deleteUserAccount: vi.fn(),
}));

vi.mock("@/domains/new_dashboard/infrastructure/userDashboardApi", () => mocks);

describe("PrivacyPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exporta os dados do usuário", async () => {
    mocks.exportUserData.mockResolvedValue(undefined);
    render(<PrivacyPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Exportar meus dados" }));
    await waitFor(() => expect(mocks.exportUserData).toHaveBeenCalled());
    expect(screen.getByText("Seus dados foram preparados para download.")).toBeInTheDocument();
  });

  it("exige uma segunda confirmação antes de excluir", async () => {
    mocks.deleteUserAccount.mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    render(<PrivacyPanel onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir minha conta" }));
    expect(screen.getByText("Esta ação é definitiva.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(mocks.deleteUserAccount).toHaveBeenCalled());
    expect(onDeleted).toHaveBeenCalled();
  });
});
