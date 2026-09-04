import * as React from "react";
import type { MatchedJob } from "../../jobs/services/jobMatch.service";
import type { NewsItem } from "../../newsletter/newsFeed.service";
import { BaseLayout } from "./BaseLayout";

export interface NewsletterProps {
  name: string;
  matchedJobs: MatchedJob[];
  appliedCount: number;
  news: NewsItem[];
  unsubscribeUrl: string;
  appUrl: string;
}

function jobTitle(job: MatchedJob): string {
  return job.title || job.jobTitle || "Vaga";
}

/**
 * Newsletter semanal: vagas com match (NEWSL-01/02), resumo de candidaturas
 * (NEWSL-05/06, nunca omitido — mostra estado vazio quando `appliedCount`
 * é 0), notícias do mercado tech (NEWSL-07/08, seção omitida quando `news`
 * vazio) e link de unsubscribe (NEWSL-12). A seção de vagas é omitida se
 * `matchedJobs` vier vazio — não deveria ocorrer via `sendForUser` (que pula
 * o envio nesse caso), mas o template não pode quebrar se ocorrer.
 */
export function Newsletter({
  name,
  matchedJobs,
  appliedCount,
  news,
  unsubscribeUrl,
  appUrl,
}: NewsletterProps) {
  return (
    <BaseLayout previewText="Suas vagas da semana no Candidate">
      <h1 style={{ fontSize: "22px", margin: "0 0 16px" }}>Olá, {name}!</h1>
      <p style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }}>
        Separamos as vagas mais recentes que combinam com o seu perfil.
      </p>

      {matchedJobs.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "17px", margin: "0 0 12px" }}>
            Vagas para você
          </h2>
          {matchedJobs.map((job, index) => (
            <p
              key={job.url ?? job.id ?? index}
              style={{ fontSize: "14px", lineHeight: "20px", margin: "0 0 10px" }}
            >
              <a
                href={job.url ?? appUrl}
                style={{
                  color: "#2563eb",
                  fontWeight: "bold",
                  textDecoration: "none",
                }}
              >
                {jobTitle(job)}
              </a>
              {job.company ? ` — ${job.company}` : ""}
            </p>
          ))}
        </div>
      )}

      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "17px", margin: "0 0 12px" }}>
          Suas candidaturas
        </h2>
        <p style={{ fontSize: "14px", lineHeight: "20px", margin: 0 }}>
          {appliedCount > 0
            ? `Você já se candidatou a ${appliedCount} vaga${appliedCount === 1 ? "" : "s"}.`
            : "Você ainda não se candidatou a nenhuma vaga."}
        </p>
      </div>

      {news.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "17px", margin: "0 0 12px" }}>
            Notícias do mercado tech
          </h2>
          {news.map((item, index) => (
            <p
              key={item.link ?? index}
              style={{ fontSize: "14px", lineHeight: "20px", margin: "0 0 8px" }}
            >
              <a
                href={item.link}
                style={{ color: "#2563eb", textDecoration: "none" }}
              >
                {item.title}
              </a>
            </p>
          ))}
        </div>
      )}

      <p style={{ fontSize: "12px", color: "#71717a", marginTop: "32px" }}>
        Não quer mais receber esse e-mail?{" "}
        <a href={unsubscribeUrl} style={{ color: "#71717a" }}>
          Cancelar inscrição
        </a>
      </p>
    </BaseLayout>
  );
}
