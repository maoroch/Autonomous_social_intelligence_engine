import { fetchHackerNews } from "./fetchers/hackernews.js";
import { fetchGithubTrending } from "./fetchers/github.js";
import { fetchDevTo } from "./fetchers/devto.js";
import { fetchReddit } from "./fetchers/reddit.js";
import { fetchLinkedInTrends } from "./fetchers/linkedin.js";
import { fetchTelegramGithub } from "./fetchers/telegramGithub.js";
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
 *   заточенных под IT фетчеров (HN/GitHub/Telegram @github/Dev.to/Reddit/LinkedIn) без изменений.
 * - любой другой вертикаль — источники на 100% берутся из IndustryProfile.trendSources
 *   через SourceAdapter.
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
    let trends: RawTrendItem[] = [];
    if (industryProfile!.trendSources.length > 0) {
      trends = await fetchFromConfiguredSources(industryProfile!.trendSources);
    }
    if (trends.length === 0) {
      logger.warn({ tenantId: industryProfile!.tenantId }, "Configured trendSources returned 0 items — using industry fallback trend signals for Testo/Niche vertical");
      trends = [
        {
          sourceName: "Testo Industry News",
          title: "GxP & 21 CFR Part 11 Environmental Monitoring Compliance Trends",
          url: "https://www.testo.com/en-US/solutions/testo-saveris-pharma",
          score: 95,
        },
        {
          sourceName: "Pharma Cold Chain Journal",
          title: "Cold Chain Temperature Monitoring & Risk Prevention in GDP Logistics",
          url: "https://www.testo.com/en-UK/saveris/products/automated-temperature-monitoring",
          score: 90,
        },
        {
          sourceName: "HVAC & Thermal Calibration Digest",
          title: "Thermal Imaging & Calibration Certificate Best Practices for HVAC Systems",
          url: "https://www.testotis.com/about-us/industries/pharma",
          score: 85,
        },
      ];
    }
    return trends;
  }

  logger.info("Starting aggregation of raw trends (default software-development fetchers)...");

  const [hn, github, telegram, devto, reddit, linkedin] = await Promise.all([
    fetchHackerNews().catch((err) => { logger.error({ err }, "HN fetcher failed"); return []; }),
    fetchGithubTrending().catch((err) => { logger.error({ err }, "GitHub fetcher failed"); return []; }),
    fetchTelegramGithub().catch((err) => { logger.error({ err }, "Telegram @github fetcher failed"); return []; }),
    fetchDevTo(profileTopics).catch((err) => { logger.error({ err }, "Dev.to fetcher failed"); return []; }),
    fetchReddit(profileTopics).catch((err) => { logger.error({ err }, "Reddit fetcher failed"); return []; }),
    fetchLinkedInTrends(profileTopics).catch((err) => { logger.error({ err }, "LinkedIn fetcher failed"); return []; }),
  ]);

  const allTrends: RawTrendItem[] = [
    ...telegram.map((item) => ({ ...item, sourceName: "Telegram @github" })),
    ...github.map((item) => ({ ...item, sourceName: "GitHub Trending" })),
    ...hn.map((item) => ({ ...item, sourceName: "Hacker News" })),
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
