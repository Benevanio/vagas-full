import { useState } from "react";
import { requestEmailChange } from "../../infrastructure/userDashboardApi";

export function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    setIsSubmitting(true);

    try {
      await requestEmailChange(email);
      setEmail("");
      setStatus("success");
      setMessage("Enviamos uma confirmação para o novo e-mail.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Não foi possível solicitar a troca.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-[18px] font-bold">Trocar e-mail</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Seu e-mail atual continuará ativo até a confirmação do novo endereço.
      </p>
      <form className="mt-5 max-w-xl space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Novo e-mail
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={currentEmail}
            required
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          />
        </label>
        {status !== "idle" && (
          <p
            role="status"
            className={status === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"}
          >
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-10 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Enviando..." : "Enviar confirmação"}
        </button>
      </form>
    </section>
  );
}
