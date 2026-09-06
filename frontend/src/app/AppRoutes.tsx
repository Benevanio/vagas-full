import NotFound from "@/app/NotFound";
import { useAuth } from "@/domains/auth/application/AuthContext";
import AuthCallbackPage from "@/domains/auth/presentation/pages/AuthCallbackPage";
import LoginPage from "@/domains/auth/presentation/pages/LoginPage";
import RegisterPage from "@/domains/auth/presentation/pages/RegisterPage";
import LandingPage from "@/domains/marketing/presentation/pages/LandingPage";
import PrivacyPolicyPage from "@/domains/marketing/presentation/pages/PrivacyPolicyPage";
import TermsOfUsePage from "@/domains/marketing/presentation/pages/TermsOfUsePage";
import NewDashboardPage from "@/domains/new_dashboard/NewDashboardPage";
import NewDashboardLayout from "@/domains/new_dashboard/layout";
import Loading from "@/shared/ui/Loading";
import { Navigate, Route, Routes } from "react-router-dom";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (user) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  const dashboardElement = (
    <ProtectedRoute>
      <NewDashboardLayout>
        <NewDashboardPage />
      </NewDashboardLayout>
    </ProtectedRoute>
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicRoute>
            <LandingPage />
          </PublicRoute>
        }
      />
      <Route path="/home" element={dashboardElement} />
      <Route path="/dashboard" element={dashboardElement} />
      <Route path="/vagas" element={dashboardElement} />
      <Route path="/mentoria" element={dashboardElement} />
      <Route path="/relatorios" element={dashboardElement} />
      <Route path="/perfil" element={dashboardElement} />
      <Route path="/ajuda" element={dashboardElement} />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/politica-de-privacidade"
        element={<PrivacyPolicyPage />}
      />
      <Route path="/termos-de-uso" element={<TermsOfUsePage />} />
      <Route
        path="/perfil/conexoes"
        element={<Navigate to="/perfil" replace />}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
