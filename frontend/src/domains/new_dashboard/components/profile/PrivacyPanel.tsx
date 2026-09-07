import { useState } from "react";
import { deleteUserAccount, exportUserData } from "../../infrastructure/userDashboardApi";

export function PrivacyPanel({ onDeleted = () => window.location.assign("/") }: { onDeleted?: () => void }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  async function handleExport() {
    setIsExporting(true);
    setMessage("");
    try {
      await exportUserData();
      setMessage("Seus dados foram preparados para download.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível exportar seus dados.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setMessage("");
    try {
      await deleteUserAccount();
      onDeleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir sua conta.");
      setIsDeleting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm" aria-labelledby="privacy-title">
      <h2 id="privacy-title" className="text-[18px] font-bold">Privacidade e dados</h2>
      <p className="mt-2 text-sm text-muted-foreground">Baixe uma cópia dos seus dados ou exclua sua conta definitivamente.</p>
      {message ? <p role="status" className="mt-4 text-sm">{message}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={handleExport} disabled={isExporting} className="h-10 rounded-md border border-border px-4 text-sm font-bold disabled:opacity-60">
          {isExporting ? "Preparando..." : "Exportar meus dados"}
        </button>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="h-10 rounded-md border border-destructive px-4 text-sm font-bold text-destructive">
            Excluir minha conta
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-destructive">Esta ação é definitiva.</span>
            <button type="button" onClick={handleDelete} disabled={isDeleting} className="h-10 rounded-md bg-destructive px-4 text-sm font-bold text-destructive-foreground disabled:opacity-60">
              {isDeleting ? "Excluindo..." : "Confirmar exclusão"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-sm font-bold text-muted-foreground">Cancelar</button>
          </div>
        )}
      </div>
    </section>
  );
}
