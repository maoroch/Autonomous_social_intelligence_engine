import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("reddit-fetcher");

interface RedditPost {
  data: {
    title: string;
    url: string;
    score: number;
    permalink: string;
    subreddit: string;
  };
}

interface RedditResponse {
  data: {
    children: RedditPost[];
  };
}

export async function fetchReddit(limit = 10): Promise<Array<{ title: string; url: string; score: number }>> {
  const subreddits = ["programming", "node"];
  const results: Array<{ title: string; url: string; score: number }> = [];

  for (const sub of subreddits) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`, {
        headers: {
          // Установка уникального User-Agent обязательна для Reddit API во избежание 429
          "User-Agent": "linkedin-ai-pipeline:v0.1.0 (by /u/ilassalimov-dev)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch Reddit /r/${sub}, status: ${response.status}`);
      }

      const json = (await response.json()) as RedditResponse;
      const posts = json.data.children || [];

      for (const post of posts) {
        if (!post.data.title || post.data.title.includes("Weekly thread") || post.data.title.includes("Self-Promotion")) {
          continue; // Игнорируем закрепы и спам
        }
        results.push({
          title: `[r/${post.data.subreddit}] ${post.data.title}`,
          url: post.data.url.startsWith("http") ? post.data.url : `https://reddit.com${post.data.permalink}`,
          score: post.data.score,
        });
      }
    } catch (err) {
      logger.warn({ sub, err }, "Failed to fetch from Reddit subreddit");
    }
  }

  return results;
}
