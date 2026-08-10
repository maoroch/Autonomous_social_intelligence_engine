import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("telegram-github-fetcher");

export interface TelegramGithubItem {
  title: string;
  url: string;
  summary: string;
  score: number;
  sourceName: string;
}

export async function fetchTelegramGithub(): Promise<TelegramGithubItem[]> {
  logger.info("Fetching trending GitHub repositories from Telegram channel @github...");
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("https://r.jina.ai/https://t.me/s/github", {
      headers: {
        "User-Agent": "LinkedIn-AI-Agent-Tool/1.0",
        "X-No-Cache": "true",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn({ status: response.status }, "Failed to fetch Telegram @github channel");
      return [];
    }

    const markdown = await response.text();
    const items: TelegramGithubItem[] = [];
    const seenUrls = new Set<string>();

    // Pattern 1: [**Title**](https://github.com/owner/repo) — description
    const githubLinkRegex = /\[\*\*([^*]+)\*\*\]\((https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\)(?:[\s—–-]+([^\n]+(?:\n[^\n]+)*?))?(?=\n\n|\n_|\n\[\*\*|$)/gi;
    let match;

    while ((match = githubLinkRegex.exec(markdown)) !== null) {
      const title = match[1]?.trim() || "";
      const url = match[2]?.trim() || "";
      const summary = match[3]?.replace(/[\r\n]+/g, " ").trim() || "";

      if (url && !seenUrls.has(url) && !url.endsWith("/github")) {
        seenUrls.add(url);
        items.push({
          title,
          url,
          summary: summary.substring(0, 300),
          score: 95,
          sourceName: "Telegram @github",
        });
      }
    }

    // Pattern 2: Extract all raw github.com/owner/repo URLs from Telegram markdown
    const rawUrlRegex = /https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/gi;
    let rawMatch;
    while ((rawMatch = rawUrlRegex.exec(markdown)) !== null) {
      const fullUrl = rawMatch[0].replace(/\/$/, "");
      const repoName = rawMatch[2];
      if (!seenUrls.has(fullUrl) && repoName && repoName !== "github" && !fullUrl.endsWith("/trending")) {
        seenUrls.add(fullUrl);
        items.push({
          title: repoName,
          url: fullUrl,
          summary: `Open-source developer repository ${repoName}`,
          score: 90,
          sourceName: "Telegram @github",
        });
      }
    }

    logger.info({ count: items.length }, "Fetched GitHub repositories from Telegram @github successfully");
    return items;
  } catch (err) {
    logger.error({ err }, "Error fetching Telegram @github channel");
    return [];
  }
}
