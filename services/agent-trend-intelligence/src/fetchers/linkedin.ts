import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("linkedin-trend-fetcher");

const SEARXNG_URL = process.env.SEARXNG_URL ?? "https://search.ononoki.org";
const SEARXNG_QUERY = process.env.SEARXNG_QUERY ?? "tech trends site:linkedin.com/pulse OR site:linkedin.com/posts";

export interface LinkedInTrendItem {
  title: string;
  url: string;
  score: number;
}

export async function fetchLinkedInTrends(): Promise<LinkedInTrendItem[]> {
  logger.info({ SEARXNG_URL, SEARXNG_QUERY }, "Fetching LinkedIn trends via SearXNG...");
  
  try {
    const url = new URL(`${SEARXNG_URL}/search`);
    url.searchParams.set("q", SEARXNG_QUERY);
    url.searchParams.set("format", "json");
    
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      signal: AbortSignal.timeout(6000), // Timeout after 6 seconds to prevent blocking
    });
    
    if (!res.ok) {
      throw new Error(`SearXNG responded with status ${res.status}`);
    }
    
    const data = await res.json() as { results?: { title: string; url: string; content?: string }[] };
    if (!data.results || !Array.isArray(data.results)) {
      logger.warn("SearXNG returned empty or invalid results array");
      return [];
    }
    
    return data.results.slice(0, 10).map((r) => ({
      title: r.title,
      url: r.url,
      score: 50, // Default popularity score for search engine results
    }));
  } catch (err: any) {
    logger.warn({ err: err.message }, "SearXNG fetch failed, returning empty LinkedIn trends");
    return [];
  }
}
