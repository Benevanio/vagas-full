import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearchParams = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("react-router-dom", () => ({
  useSearchParams: () => [mockSearchParams],
}));

const apiMocks = vi.hoisted(() => ({
  post: vi.fn(),
}));
vi.mock("@/shared/lib/apiClient", () => ({
  api: { post: apiMocks.post },
}));

import UnsubscribePage from "@/domains/newsletter/presentation/pages/UnsubscribePage";

describe("UnsubscribePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("token ausente na URL → mensagem de erro, sem chamar a API", () => {
    mockSearchParams.get.mockReturnValue(null);

    render(<UnsubscribePage />);

    expect(screen.getByText("Link inválido")).toBeInTheDocument();
    expect(apiMocks.post).not.toHaveBeenCalled();
  });

  it("sucesso da API ({ok:true}) → mensagem de confirmação", async () => {
    mockSearchParams.get.mockReturnValue("valid-token");
    apiMocks.post.mockResolvedValue({ data: { ok: true } });

    render(<UnsubscribePage />);

    await waitFor(() => {
      expect(screen.getByText("Inscrição cancelada")).toBeInTheDocument();
    });
    expect(apiMocks.post).toHaveBeenCalledWith("/newsletter/unsubscribe", {
      token: "valid-token",
    });
  });

  it("falha da API ({ok:false}) → mensagem de link inválido, sem quebrar a página", async () => {
    mockSearchParams.get.mockReturnValue("bad-token");
    apiMocks.post.mockResolvedValue({ data: { ok: false } });

    render(<UnsubscribePage />);

    await waitFor(() => {
      expect(screen.getByText("Link inválido")).toBeInTheDocument();
    });
  });

  it("erro/exceção da chamada à API → mensagem de link inválido, sem quebrar a página (renderização não lança)", async () => {
    mockSearchParams.get.mockReturnValue("token-x");
    apiMocks.post.mockRejectedValue(new Error("network error"));

    expect(() => render(<UnsubscribePage />)).not.toThrow();

    await waitFor(() => {
      expect(screen.getByText("Link inválido")).toBeInTheDocument();
    });
  });

  it("renderiza sem exigir sessão autenticada — nenhum useAuth/ProtectedRoute envolvido (acessar sem sessão não quebra nem exige provider de auth)", () => {
    mockSearchParams.get.mockReturnValue(null);

    expect(() => render(<UnsubscribePage />)).not.toThrow();
  });
});
