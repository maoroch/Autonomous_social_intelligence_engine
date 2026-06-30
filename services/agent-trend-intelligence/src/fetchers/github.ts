import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("github-fetcher");

interface GithubTrendingItem {
  author: string;
  name: string;
  url: string;
  description?: string;
  language?: string;
  stars: number;
  currentPeriodStars: number;
}

export async function fetchGithubTrending(): Promise<Array<{ title: string; url: string; score: number }>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    // Использование публичного зеркала API GitHub Trending
    const response = await fetch("https://gtrend.yapie.me/repositories", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch from gtrend API, status: ${response.status}`);
    }

    const data = (await response.json()) as GithubTrendingItem[];
    
    return data.slice(0, 15).map((item) => ({
      title: `${item.author}/${item.name}`,
      url: item.url,
      score: item.currentPeriodStars || 50,
    }));
  } catch (err) {
    logger.warn({ err }, "Failed to fetch GitHub trending from API mirror, trying fallback scrape");
    return fetchGithubTrendingFallback();
  }
}

/**
 * Резервный парсинг HTML-страницы GitHub Trending на случай сбоя API-зеркала.
 */
async function fetchGithubTrendingFallback(): Promise<Array<{ title: string; url: string; score: number }>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch("https://github.com/trending", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch github trending page, status: ${response.status}`);
    }

    const html = await response.text();
    const results: Array<{ title: string; url: string; score: number }> = [];

    // Поиск блоков репозиториев по регулярному выражению
    // Репозитории находятся в тегах <h1>/<h2> с классом Box-row
    const repoRegex = /href="\/([a-zA-Z0-9-_\.]+\/[a-zA-Z0-9-_\.]+)"/g;
    let match;
    const urlsSeen = new Set<string>();

    while ((match = repoRegex.exec(html)) !== null) {
      const repoPath = match[1];
      if (!repoPath) continue;
      // Исключаем системные ссылки вроде /trending/developer, /site, /security
      if (repoPath.includes("/") && !repoPath.startsWith("trending/") && !repoPath.startsWith("features/")) {
        const url = `https://github.com/${repoPath}`;
        if (!urlsSeen.has(url)) {
          urlsSeen.add(url);
          results.push({
            title: repoPath,
            url,
            score: 50, // Дефолтный балл
          });
        }
      }
      if (results.length >= 15) break;
    }

    return results;
  } catch (err) {
    logger.error({ err }, "GitHub trending fallback scrape failed");
    return [];
  }
}
