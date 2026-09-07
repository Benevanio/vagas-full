import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmEmailChange } from "@/domains/new_dashboard/infrastructure/userDashboardApi";

export default function ConfirmEmailChangePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error",
  );
  const [message, setMessage] = useState(
    token ? "Confirmando seu novo e-mail..." : "Link de confirmação inválido.",
  );

  useEffect(() => {
    if (!token) return;

    confirmEmailChange(token)
      .then(() => {
        setState("success");
        setMessage("Seu e-mail foi alterado com sucesso.");
      })
      .catch((error) => {
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível confirmar a troca de e-mail.",
        );
      });
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold">Troca de e-mail</h1>
        <p
          className={`mt-4 text-sm ${state === "error" ? "text-destructive" : "text-muted-foreground"}`}
          role="status"
        >
          {message}
        </p>
        {state !== "loading" && (
          <Link
            to="/login"
            className="mt-6 inline-block rounded-md bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
          >
            Ir para o login
          </Link>
        )}
      </section>
    </main>
  );
}
