import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/shared/lib/apiClient";

type UnsubscribeStatus = "loading" | "success" | "error" | "missing-token";

/**
 * Página pública de descadastro da newsletter (NEWSL-14/15). Lê `?token=`
 * da URL e chama o endpoint público `POST /newsletter/unsubscribe` — não
 * exige sessão (nenhum `useAuth`/`ProtectedRoute` envolvido).
 */
export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<UnsubscribeStatus>(
    token ? "loading" : "missing-token",
  );

  useEffect(() => {
    if (!token) return;

    let isMounted = true;

    async function unsubscribe() {
      try {
        const { data } = await api.post("/newsletter/unsubscribe", { token });
        if (!isMounted) return;
        setStatus(data?.ok ? "success" : "error");
      } catch {
        if (isMounted) setStatus("error");
      }
    }

    void unsubscribe();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        {status === "loading" && <p>Processando seu pedido...</p>}

        {status === "success" && (
          <>
            <h1 className="text-xl font-semibold">Inscrição cancelada</h1>
            <p className="mt-2 text-muted-foreground">
              Você não receberá mais a newsletter semanal.
            </p>
          </>
        )}

        {(status === "error" || status === "missing-token") && (
          <>
            <h1 className="text-xl font-semibold">Link inválido</h1>
            <p className="mt-2 text-muted-foreground">
              Este link de descadastro é inválido ou já expirou.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
