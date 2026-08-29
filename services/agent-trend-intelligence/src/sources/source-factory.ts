import { createLogger } from "@pipeline/shared/logger";
import type { IndustryProfile, TrendSourceConfig } from "@pipeline/shared/schemas";
import type { RawTrendItem } from "../validators/trend.validator.js";
import { fetchDenOfGeekArticles } from "./denofgeek.source.js";
import { fetchTelegramGithub } from "../fetchers/telegramGithub.js";
import { getAdapterFor } from "../adapters/sourceAdapter.js";
import { aggregateRawTrends } from "../aggregator.js";

const logger = createLogger("agent-trend:source-factory");

export async function fetchTrendsForTenant(
  tenantId: string,
  industryProfile?: IndustryProfile,
  targetPillarId?: string
): Promise<RawTrendItem[]> {
  // 1. GitHub Collection Rubrics -> Exclusively Telegram @github channel
  const isGithubPillar = targetPillarId && (
    targetPillarId === "github-trending-repos" ||
    targetPillarId === "pet-projects-showcase" ||
    targetPillarId.includes("github") ||
    targetPillarId.includes("repo")
  );

  if (isGithubPillar) {
    logger.info({ tenantId, targetPillarId }, "Fetching exclusive trending GitHub repositories from Telegram @github");
    try {
      const tgItems = await fetchTelegramGithub();
      if (tgItems.length > 0) {
        return tgItems.map((item) => ({
          title: item.title,
          url: item.url,
          score: item.score || 95,
          source: item.sourceName || "Telegram @github",
          summary: item.summary,
          fullArticleText: item.summary,
        }));
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, "Telegram @github fetcher failed, proceeding to fallback sources");
    }
  }

  // 2. Cinema Media Portal: Exclusively Den of Geek articles with full text
  if (tenantId === "cinema-media") {
    logger.info({ tenantId }, "Fetching exclusive Den of Geek articles for cinema-media portal");
    const sources = industryProfile?.trendSources && industryProfile.trendSources.length > 0
      ? industryProfile.trendSources
      : [
          { type: "rss", url: "https://www.denofgeek.com/feed/", label: "Den of Geek (All)", weight: 1.0 },
          { type: "rss", url: "https://www.denofgeek.com/movies/feed/", label: "Den of Geek (Movies)", weight: 1.0 },
          { type: "rss", url: "https://www.denofgeek.com/tv/feed/", label: "Den of Geek (TV)", weight: 0.9 },
        ];

    const results: RawTrendItem[] = [];
    for (const src of sources) {
      if (src.url && src.url.includes("denofgeek.com")) {
        const articles = await fetchDenOfGeekArticles(src.url);
        results.push(...articles);
      }
    }

    if (results.length === 0) {
      const defaultUrls = [
        "https://www.denofgeek.com/feed/",
        "https://www.denofgeek.com/movies/feed/",
        "https://www.denofgeek.com/tv/feed/",
      ];
      for (const u of defaultUrls) {
        const articles = await fetchDenOfGeekArticles(u);
        results.push(...articles);
      }
    }

    return results;
  }

  // 3. Tech Portal & Industry Vertical with configured trendSources (Ars Technica, InfoQ, TechCrunch, Testo, etc.)
  if (industryProfile?.trendSources && industryProfile.trendSources.length > 0) {
    logger.info({ tenantId, count: industryProfile.trendSources.length }, "Fetching trends via IndustryProfile adapters");
    const results: RawTrendItem[] = [];

    await Promise.allSettled(
      industryProfile.trendSources.map(async (cfg: TrendSourceConfig) => {
        try {
          const adapter = getAdapterFor(cfg);
          const rawItems = await adapter.fetch(cfg);
          for (const item of rawItems) {
            results.push({
              title: item.title,
              url: item.url,
              score: item.score,
              source: cfg.label,
              summary: item.summary || item.title,
              fullArticleText: item.fullText || item.summary || item.title,
            });
          }
        } catch (err: any) {
          logger.warn({ err: err.message, label: cfg.label }, "Trend source adapter failed");
        }
      })
    );

    return results;
  }

  // 4. Fallback Tech Portal (GitHub Trending, HackerNews, Dev.to)
  logger.info({ tenantId }, "Fetching default tech portal trends (GitHub/HN/Dev.to)");
  const techItems = await aggregateRawTrends([], industryProfile);
  return techItems.map((t) => ({
    title: t.title,
    url: t.url,
    score: t.score,
    source: t.sourceName || "tech-feed",
    summary: t.title,
    fullArticleText: t.title,
  }));
}
