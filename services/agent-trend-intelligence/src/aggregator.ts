import { fetchHackerNews } from "./fetchers/hackernews.js";
import { fetchGithubTrending } from "./fetchers/github.js";
import { fetchDevTo } from "./fetchers/devto.js";
import { fetchReddit } from "./fetchers/reddit.js";
import { fetchLinkedInTrends } from "./fetchers/linkedin.js";
import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("trend-aggregator");

export interface RawTrendItem {
  sourceName: string;
  title: string;
  url: string;
  score: number;
}

export async function aggregateRawTrends(): Promise<RawTrendItem[]> {
  logger.info("Starting aggregation of raw trends...");
  
  const [hn, github, devto, reddit, linkedin] = await Promise.all([
    fetchHackerNews().catch((err) => { logger.error({ err }, "HN fetcher failed"); return []; }),
    fetchGithubTrending().catch((err) => { logger.error({ err }, "GitHub fetcher failed"); return []; }),
    fetchDevTo().catch((err) => { logger.error({ err }, "Dev.to fetcher failed"); return []; }),
    fetchReddit().catch((err) => { logger.error({ err }, "Reddit fetcher failed"); return []; }),
    fetchLinkedInTrends().catch((err) => { logger.error({ err }, "LinkedIn fetcher failed"); return []; }),
  ]);

  const allTrends: RawTrendItem[] = [
    ...hn.map((item) => ({ ...item, sourceName: "Hacker News" })),
    ...github.map((item) => ({ ...item, sourceName: "GitHub Trending" })),
    ...devto.map((item) => ({ ...item, sourceName: "Dev.to" })),
    ...reddit.map((item) => ({ ...item, sourceName: "Reddit" })),
    ...linkedin.map((item) => ({ ...item, sourceName: "LinkedIn" })),
  ];

  logger.info({ totalCount: allTrends.length }, "Finished raw trends aggregation");
  return allTrends;
}

export function formatTrendsForLLM(trends: RawTrendItem[]): string {
  if (trends.length === 0) {
    return "No trends were collected.";
  }

  return trends
    .map((item, index) => `${index + 1}. [${item.sourceName}] "${item.title}" - Source: ${item.url} (Popularity Score: ${item.score})`)
    .join("\n");
}
