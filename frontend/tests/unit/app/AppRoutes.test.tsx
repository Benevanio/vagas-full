import { AppRoutes } from "@/app/AppRoutes";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  value: {
    user: null as { id: string; email: string } | null,
    isLoading: false,
  },
}));

vi.mock("@/domains/auth/application/AuthContext", () => ({
  useAuth: () => authState.value,
}));

vi.mock("@/shared/ui/Loading", () => ({
  default: () => <div role="status">Carregando...</div>,
}));

vi.mock("@/domains/new_dashboard/layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>
      <span>Dashboard shell</span>
      {children}
    </div>
  ),
}));

vi.mock("@/domains/new_dashboard/NewDashboardPage", () => ({
  default: () => <main>New dashboard route</main>,
}));

vi.mock("@/domains/marketing/presentation/pages/LandingPage", () => ({
  default: () => <main>Landing route</main>,
}));

vi.mock("@/domains/auth/presentation/pages/LoginPage", () => ({
  default: () => <main>Login route</main>,
}));

vi.mock("@/domains/auth/presentation/pages/RegisterPage", () => ({
  default: () => <main>Register route</main>,
}));

vi.mock("@/domains/auth/presentation/pages/AuthCallbackPage", () => ({
  default: () => <main>Callback route</main>,
}));

vi.mock("@/app/NotFound", () => ({
  default: () => <main>Not found route</main>,
}));

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("AppRoutes", () => {
  beforeEach(() => {
    authState.value = {
      user: null,
      isLoading: false,
    };
  });

  it("renderiza a landing page na rota pública inicial", () => {
    renderRoute("/");

    expect(screen.getByText("Landing route")).toBeInTheDocument();
  });

  it("redireciona usuário autenticado da rota inicial para home", () => {
    authState.value = {
      user: { id: "1", email: "otavio@example.com" },
      isLoading: false,
    };

    renderRoute("/");

    expect(screen.getByText("Dashboard shell")).toBeInTheDocument();
    expect(screen.getByText("New dashboard route")).toBeInTheDocument();
    expect(screen.queryByText("Landing route")).not.toBeInTheDocument();
  });

  it("mostra loading em rota protegida enquanto a sessão está carregando", () => {
    authState.value = {
      user: null,
      isLoading: true,
    };

    renderRoute("/home");

    expect(screen.getByRole("status")).toHaveTextContent("Carregando...");
  });

  it("redireciona rota protegida para login quando não há usuário", () => {
    renderRoute("/home");

    expect(screen.getByText("Login route")).toBeInTheDocument();
    expect(screen.queryByText("New dashboard route")).not.toBeInTheDocument();
  });

  it("renderiza layout autenticado e conteúdo protegido quando há usuário", () => {
    authState.value = {
      user: { id: "1", email: "otavio@example.com" },
      isLoading: false,
    };

    renderRoute("/vagas");

    expect(screen.getByText("Dashboard shell")).toBeInTheDocument();
    expect(screen.getByText("New dashboard route")).toBeInTheDocument();
  });

  it("redireciona /relatorios para login quando não há usuário (mesmo guard das outras seções)", () => {
    renderRoute("/relatorios");

    expect(screen.getByText("Login route")).toBeInTheDocument();
    expect(screen.queryByText("New dashboard route")).not.toBeInTheDocument();
  });

  it("renderiza o shell autenticado em /relatorios quando há usuário", () => {
    authState.value = {
      user: { id: "1", email: "otavio@example.com" },
      isLoading: false,
    };

    renderRoute("/relatorios");

    expect(screen.getByText("Dashboard shell")).toBeInTheDocument();
    expect(screen.getByText("New dashboard route")).toBeInTheDocument();
  });

  it("mostra loading em rota pública enquanto a sessão está carregando", () => {
    authState.value = {
      user: null,
      isLoading: true,
    };

    renderRoute("/register");

    expect(screen.getByRole("status")).toHaveTextContent("Carregando...");
  });

  it("redireciona usuário autenticado para home ao acessar login", () => {
    authState.value = {
      user: { id: "1", email: "otavio@example.com" },
      isLoading: false,
    };

    renderRoute("/login");

    expect(screen.getByText("Dashboard shell")).toBeInTheDocument();
    expect(screen.getByText("New dashboard route")).toBeInTheDocument();
  });

  it("mantém callback OAuth fora dos guards de autenticação", () => {
    renderRoute("/auth/callback");

    expect(screen.getByText("Callback route")).toBeInTheDocument();
  });
});
