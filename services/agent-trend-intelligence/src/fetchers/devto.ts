import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("devto-fetcher");

interface DevToArticle {
  title: string;
  url: string;
  public_reactions_count: number;
  tags: string[];
}

export async function fetchDevTo(limit = 15): Promise<Array<{ title: string; url: string; score: number }>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    // Запрос популярных статей
    const response = await fetch("https://dev.to/api/articles?top=3", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch Dev.to articles, status: ${response.status}`);
    }

    const articles = (await response.json()) as DevToArticle[];
    
    return articles.slice(0, limit).map((article) => ({
      title: article.title,
      url: article.url,
      score: Math.min(100, (article.public_reactions_count || 10) * 2), // Преобразуем количество реакций в условный score
    }));
  } catch (err) {
    logger.error({ err }, "Error fetching Dev.to trends");
    return [];
  }
}
