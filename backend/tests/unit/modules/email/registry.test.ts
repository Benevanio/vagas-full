import { describe, expect, it } from "vitest";
import {
  isTemplate,
  renderTemplate,
} from "../../../../src/modules/email/templates/registry";

describe("TemplateRegistry", () => {
  describe("isTemplate", () => {
    it("reconhece 'welcome' como template válido", () => {
      expect(isTemplate("welcome")).toBe(true);
    });

    it("reconhece 'newsletter' como template válido", () => {
      expect(isTemplate("newsletter")).toBe(true);
    });

    it("rejeita nome desconhecido (EMAIL-05)", () => {
      expect(isTemplate("desconhecido")).toBe(false);
    });
  });

  describe("renderTemplate", () => {
    it("renderiza 'welcome' com nome, CTA apontando para appUrl e subject (EMAIL-07)", async () => {
      const appUrl = "https://app.example.com";
      const { subject, html } = await renderTemplate("welcome", {
        name: "Maria",
        appUrl,
      });

      expect(subject).toBeTruthy();
      expect(typeof subject).toBe("string");
      expect(html).toContain("Maria");
      expect(html).toContain(`href="${appUrl}"`);
      expect(html).toContain("Acessar plataforma");
    });

    it("rejeita template desconhecido (EMAIL-05)", async () => {
      await expect(
        // @ts-expect-error nome inválido é rejeitado em runtime
        renderTemplate("desconhecido", { name: "X", appUrl: "https://x" }),
      ).rejects.toThrow();
    });

    it("renderiza 'newsletter' com vagas, resumo de candidaturas, notícias e link de unsubscribe (NEWSL-01/05/06/07/12)", async () => {
      const appUrl = "https://app.example.com";
      const unsubscribeUrl = `${appUrl}/newsletter/unsubscribe?token=TOKEN123`;
      const { subject, html } = await renderTemplate("newsletter", {
        name: "Maria",
        matchedJobs: [
          {
            id: "job-1",
            title: "Engenheiro Backend",
            company: "Acme",
            url: "https://vagas.example.com/job-1",
            matchScore: 90,
          },
        ],
        appliedCount: 4,
        news: [{ title: "Notícia Tech", link: "https://news.example.com/1", publishedAt: new Date() }],
        unsubscribeUrl,
        appUrl,
      });

      expect(subject).toBeTruthy();
      expect(typeof subject).toBe("string");
      expect(html).toContain("Maria");
      expect(html).toContain("Engenheiro Backend");
      expect(html).toContain('href="https://vagas.example.com/job-1"');
      expect(html).toContain("Você já se candidatou a 4 vagas.");
      expect(html).toContain("Notícia Tech");
      expect(html).toContain('href="https://news.example.com/1"');
      expect(html).toContain(`href="${unsubscribeUrl}"`);
    });

    it("renderiza 'newsletter' sem quebrar quando matchedJobs está vazio (omite a seção de vagas)", async () => {
      const { html } = await renderTemplate("newsletter", {
        name: "Maria",
        matchedJobs: [],
        appliedCount: 0,
        news: [],
        unsubscribeUrl: "https://app.example.com/newsletter/unsubscribe?token=T",
        appUrl: "https://app.example.com",
      });

      expect(html).not.toContain("Vagas para você");
      expect(html).toContain("Você ainda não se candidatou a nenhuma vaga.");
    });

    it("renderiza 'newsletter' sem quebrar e omite a seção de notícias quando news está vazio (NEWSL-08/09)", async () => {
      const { html } = await renderTemplate("newsletter", {
        name: "Maria",
        matchedJobs: [
          { id: "job-1", title: "Engenheiro Backend", url: "https://vagas.example.com/job-1" },
        ],
        appliedCount: 0,
        news: [],
        unsubscribeUrl: "https://app.example.com/newsletter/unsubscribe?token=T",
        appUrl: "https://app.example.com",
      });

      expect(html).not.toContain("Notícias do mercado tech");
    });
  });
});
