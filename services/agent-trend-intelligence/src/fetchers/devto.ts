import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("devto-fetcher");

interface DevToArticle {
  title: string;
  url: string;
  public_reactions_count: number;
  tags: string[];
}

export async function fetchDevTo(profileTopics: string[] = [], limit = 15): Promise<Array<{ title: string; url: string; score: number }>> {
  const tags = ["javascript", "webdev"];
  const topicLower = profileTopics.map((t) => t.toLowerCase());
  
  if (topicLower.some((t) => t.includes("react"))) tags.push("react");
  if (topicLower.some((t) => t.includes("next.js") || t.includes("nextjs"))) tags.push("nextjs");
  if (topicLower.some((t) => t.includes("node"))) tags.push("node");
  if (topicLower.some((t) => t.includes("python"))) tags.push("python");
  if (topicLower.some((t) => t.includes("typescript"))) tags.push("typescript");
  if (topicLower.some((t) => t.includes("database") || t.includes("postgres") || t.includes("mysql") || t.includes("mongodb"))) tags.push("database");
  if (topicLower.some((t) => t.includes("architecture") || t.includes("system design"))) tags.push("architecture");

  const activeTags = tags.slice(0, 3);
  const fetchUrls = [
    "https://dev.to/api/articles?top=3",
    ...activeTags.map((tag) => `https://dev.to/api/articles?tag=${tag}&top=10`)
  ];

  try {
    const promises = fetchUrls.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          return (await res.json()) as DevToArticle[];
        }
      } catch (e) {
        logger.warn({ url, e }, "Failed to fetch Dev.to URL");
      }
      return [];
    });

    const results = await Promise.all(promises);
    const flattened = results.flat();
    
    // Deduplicate articles by URL
    const unique = new Map<string, DevToArticle>();
    for (const art of flattened) {
      if (art.url) unique.set(art.url, art);
    }
    
    const allArticles = Array.from(unique.values());
    
    return allArticles.slice(0, limit).map((article) => ({
      title: article.title,
      url: article.url,
      score: Math.min(100, (article.public_reactions_count || 10) * 2),
    }));
  } catch (err) {
    logger.error({ err }, "Error fetching Dev.to trends");
    return [];
  }
}
