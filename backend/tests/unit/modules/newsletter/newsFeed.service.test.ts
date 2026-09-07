import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const parserMocks = vi.hoisted(() => ({
  parseURL: vi.fn(),
  ParserConstructor: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  logWarn: vi.fn(),
}));

vi.mock("rss-parser", () => ({
  default: class {
    parseURL = parserMocks.parseURL;
    constructor(opts: unknown) {
      parserMocks.ParserConstructor(opts);
    }
  },
}));

vi.mock("../../../../src/logger", () => loggerMocks);

import { fetchTechNews } from "../../../../src/modules/newsletter/newsFeed.service";

const originalFeedUrlsEnv = process.env.NEWSLETTER_NEWS_FEED_URLS;

function item(overrides: Partial<Record<string, string>> = {}) {
  return {
    title: "Título padrão",
    link: "https://example.com/padrao",
    isoDate: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("newsFeed.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEWSLETTER_NEWS_FEED_URLS;
  });

  afterEach(() => {
    process.env.NEWSLETTER_NEWS_FEED_URLS = originalFeedUrlsEnv;
  });

  it("constrói o Parser com timeout configurado por feed", async () => {
    parserMocks.parseURL.mockResolvedValue({ items: [] });

    await fetchTechNews();

    expect(parserMocks.ParserConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("retorna itens ordenados por data desc, no máximo `limit`", async () => {
    process.env.NEWSLETTER_NEWS_FEED_URLS = "https://a.com/rss";
    parserMocks.parseURL.mockResolvedValueOnce({
      items: [
        item({ title: "Mais antiga", link: "https://a.com/1", isoDate: "2026-08-01T00:00:00.000Z" }),
        item({ title: "Mais recente", link: "https://a.com/2", isoDate: "2026-08-10T00:00:00.000Z" }),
        item({ title: "Intermediária", link: "https://a.com/3", isoDate: "2026-08-05T00:00:00.000Z" }),
      ],
    });

    const result = await fetchTechNews(2);

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.title)).toEqual(["Mais recente", "Intermediária"]);
  });

  it("usa limit=5 por padrão quando o feed retorna mais de 5 itens", async () => {
    process.env.NEWSLETTER_NEWS_FEED_URLS = "https://a.com/rss";
    parserMocks.parseURL.mockResolvedValueOnce({
      items: Array.from({ length: 8 }, (_, i) =>
        item({
          title: `Notícia ${i}`,
          link: `https://a.com/${i}`,
          isoDate: new Date(2026, 7, i + 1).toISOString(),
        }),
      ),
    });

    const result = await fetchTechNews();

    expect(result).toHaveLength(5);
  });

  it("deduplica itens com o mesmo link entre feeds", async () => {
    parserMocks.parseURL
      .mockResolvedValueOnce({
        items: [item({ title: "Do feed 1", link: "https://dup.com/x" })],
      })
      .mockResolvedValueOnce({
        items: [item({ title: "Do feed 2 (duplicado)", link: "https://dup.com/x" })],
      });
    process.env.NEWSLETTER_NEWS_FEED_URLS = "https://feed1.com/rss,https://feed2.com/rss";

    const result = await fetchTechNews();

    expect(result).toHaveLength(1);
    expect(result[0].link).toBe("https://dup.com/x");
  });

  it("descarta um feed que falha (logWarn) sem derrubar os demais", async () => {
    process.env.NEWSLETTER_NEWS_FEED_URLS = "https://ok.com/rss,https://falha.com/rss";
    parserMocks.parseURL
      .mockResolvedValueOnce({
        items: [item({ title: "Sobrevivente", link: "https://ok.com/1" })],
      })
      .mockRejectedValueOnce(new Error("timeout"));

    const result = await fetchTechNews();

    expect(result).toEqual([
      expect.objectContaining({ title: "Sobrevivente", link: "https://ok.com/1" }),
    ]);
    expect(loggerMocks.logWarn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ url: "https://falha.com/rss", error: "timeout" }),
    );
  });

  it("retorna [] sem lançar quando todos os feeds falham", async () => {
    process.env.NEWSLETTER_NEWS_FEED_URLS = "https://falha1.com/rss,https://falha2.com/rss";
    parserMocks.parseURL
      .mockRejectedValueOnce(new Error("feed indisponível"))
      .mockRejectedValueOnce(new Error("erro de parse"));

    await expect(fetchTechNews()).resolves.toEqual([]);
  });

  it("ignora itens sem título ou link", async () => {
    process.env.NEWSLETTER_NEWS_FEED_URLS = "https://a.com/rss";
    parserMocks.parseURL.mockResolvedValueOnce({
      items: [
        { title: "Sem link", isoDate: "2026-08-01T00:00:00.000Z" },
        { link: "https://a.com/sem-titulo", isoDate: "2026-08-01T00:00:00.000Z" },
        item({ title: "Válida", link: "https://a.com/valida" }),
      ],
    });

    const result = await fetchTechNews();

    expect(result).toEqual([
      expect.objectContaining({ title: "Válida", link: "https://a.com/valida" }),
    ]);
  });

  it("usa a lista de feeds default quando NEWSLETTER_NEWS_FEED_URLS não está configurada", async () => {
    parserMocks.parseURL.mockResolvedValue({ items: [] });

    await fetchTechNews();

    expect(parserMocks.parseURL).toHaveBeenCalledTimes(2);
    expect(parserMocks.parseURL).toHaveBeenCalledWith("https://hnrss.org/frontpage");
    expect(parserMocks.parseURL).toHaveBeenCalledWith(
      "https://www.tabnews.com.br/recentes/rss",
    );
  });
});
