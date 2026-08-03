import { fetchHackerNews } from "./fetchers/hackernews.js";
import { fetchGithubTrending } from "./fetchers/github.js";
import { fetchDevTo } from "./fetchers/devto.js";
import { fetchReddit } from "./fetchers/reddit.js";
import { fetchLinkedInTrends } from "./fetchers/linkedin.js";
import { fetchFromConfiguredSources } from "./adapters/sourceAdapter.js";
import { createLogger } from "@pipeline/shared/logger";
import type { IndustryProfile } from "@pipeline/shared/schemas";

const logger = createLogger("trend-aggregator");

export interface RawTrendItem {
  sourceName: string;
  title: string;
  url: string;
  score: number;
}

/**
 * Собирает сырые тренды.
 *
 * Поведение зависит от IndustryProfile.verticalName:
 * - "software-development" (или профиль не передан) — используется существующий набор
 *   заточенных под IT фетчеров (HN/GitHub/Dev.to/Reddit/LinkedIn) без изменений, для обратной совместимости.
 * - любой другой вертикаль — источники на 100% берутся из IndustryProfile.trendSources
 *   через SourceAdapter (см. TZ_vertical_agnostic_b2b_saas.md, раздел 2.1).
 */
export async function aggregateRawTrends(
  profileTopics: string[] = [],
  industryProfile?: IndustryProfile,
): Promise<RawTrendItem[]> {
  const isDefaultTechVertical = !industryProfile || industryProfile.verticalName === "software-development";

  if (!isDefaultTechVertical) {
    logger.info(
      { tenantId: industryProfile!.tenantId, verticalName: industryProfile!.verticalName, sourcesCount: industryProfile!.trendSources.length },
      "Aggregating trends via configured IndustryProfile.trendSources (SourceAdapter path)",
    );
    if (industryProfile!.trendSources.length === 0) {
      logger.warn({ tenantId: industryProfile!.tenantId }, "IndustryProfile has no trendSources configured — returning empty trends");
      return [];
    }
    return fetchFromConfiguredSources(industryProfile!.trendSources);
  }

  logger.info("Starting aggregation of raw trends (default software-development fetchers)...");

  const [hn, github, devto, reddit, linkedin] = await Promise.all([
    fetchHackerNews().catch((err) => { logger.error({ err }, "HN fetcher failed"); return []; }),
    fetchGithubTrending().catch((err) => { logger.error({ err }, "GitHub fetcher failed"); return []; }),
    fetchDevTo(profileTopics).catch((err) => { logger.error({ err }, "Dev.to fetcher failed"); return []; }),
    fetchReddit(profileTopics).catch((err) => { logger.error({ err }, "Reddit fetcher failed"); return []; }),
    fetchLinkedInTrends(profileTopics).catch((err) => { logger.error({ err }, "LinkedIn fetcher failed"); return []; }),
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
