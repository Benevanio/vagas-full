import Parser from "rss-parser";
import { logWarn } from "../../logger";

export interface NewsItem {
  title: string;
  link: string;
  publishedAt: Date;
}

/**
 * Feeds RSS curados pra audiência dev/tech. Verificados ao vivo na sessão de
 * Execute (respondem RSS 2.0 válido): agregador de Hacker News (hnrss.org) e
 * TabNews.
 */
const DEFAULT_FEED_URLS = [
  "https://hnrss.org/frontpage",
  "https://www.tabnews.com.br/recentes/rss",
];

const FEED_TIMEOUT_MS = 5000;

function getFeedUrls(): string[] {
  const fromEnv = process.env.NEWSLETTER_NEWS_FEED_URLS?.trim();
  if (!fromEnv) return DEFAULT_FEED_URLS;

  const urls = fromEnv
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  return urls.length > 0 ? urls : DEFAULT_FEED_URLS;
}

function parseItemDate(item: Parser.Item): Date {
  const raw = item.isoDate ?? item.pubDate;
  if (!raw) return new Date(0);

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

async function fetchFeedItems(url: string): Promise<NewsItem[]> {
  const parser = new Parser({ timeout: FEED_TIMEOUT_MS });
  const feed = await parser.parseURL(url);

  return (feed.items ?? [])
    .filter((item): item is Parser.Item & { title: string; link: string } =>
      Boolean(item.title && item.link),
    )
    .map((item) => ({
      title: item.title,
      link: item.link,
      publishedAt: parseItemDate(item),
    }));
}

/**
 * Busca até `limit` notícias de tecnologia dos feeds RSS configurados
 * (`NEWSLETTER_NEWS_FEED_URLS`, com fallback padrão). Um feed que falhar
 * (timeout, erro HTTP, erro de parse) é descartado com `logWarn`, sem
 * derrubar os demais — esta função nunca lança.
 */
export async function fetchTechNews(limit = 5): Promise<NewsItem[]> {
  const feedUrls = getFeedUrls();

  const results = await Promise.allSettled(
    feedUrls.map((url) => fetchFeedItems(url)),
  );

  const items: NewsItem[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value);
      return;
    }

    logWarn("Falha ao buscar feed RSS de notícias.", {
      url: feedUrls[index],
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    });
  });

  const dedupedByLink = new Map<string, NewsItem>();
  for (const item of items) {
    if (!dedupedByLink.has(item.link)) {
      dedupedByLink.set(item.link, item);
    }
  }

  return [...dedupedByLink.values()]
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, limit);
}
