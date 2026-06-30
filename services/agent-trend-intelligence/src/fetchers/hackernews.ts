import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("hn-fetcher");

interface HNItem {
  id: number;
  title: string;
  url?: string;
  score: number;
  time: number;
}

export async function fetchHackerNews(limit = 15): Promise<Array<{ title: string; url: string; score: number }>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch top stories, status: ${response.status}`);
    }

    const storyIds = (await response.json()) as number[];
    const topIds = storyIds.slice(0, limit);

    const fetchItem = async (id: number) => {
      try {
        const itemController = new AbortController();
        const itemTimeoutId = setTimeout(() => itemController.abort(), 4000);
        const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          signal: itemController.signal,
        });
        clearTimeout(itemTimeoutId);

        if (!res.ok) return null;
        return (await res.json()) as HNItem;
      } catch (err) {
        logger.warn({ id, err }, "Failed to fetch individual Hacker News item");
        return null;
      }
    };

    const items = await Promise.all(topIds.map(fetchItem));
    
    return items
      .filter((item): item is HNItem => !!item && !!item.title && !!item.url)
      .map((item) => ({
        title: item.title,
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        score: item.score,
      }));
  } catch (err) {
    logger.error({ err }, "Error fetching Hacker News trends");
    return [];
  }
}
