import { createLogger } from "@pipeline/shared/logger";
import { HTTP_USER_AGENT, DEFAULT_TIMEOUT_MS, MAX_ARTICLE_TEXT_LENGTH } from "../config/constants.js";
import type { RawTrendItem } from "../validators/trend.validator.js";

const logger = createLogger("agent-trend:denofgeek");

function cleanHtmlToText(rawHtml: string): string {
  if (!rawHtml) return "";
  return rawHtml
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function chunkArticleText(fullText: string, maxChunkChars = 2000): string[] {
  if (!fullText) return [];
  if (fullText.length <= maxChunkChars) return [fullText];

  const paragraphs = fullText.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    if ((currentChunk + "\n" + para).length > maxChunkChars) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // Fallback: If no paragraph breaks, slice cleanly
  if (chunks.length === 0) {
    for (let i = 0; i < fullText.length; i += maxChunkChars) {
      chunks.push(fullText.substring(i, i + maxChunkChars).trim());
    }
  }

  return chunks;
}

function parseRssItem(itemXml: string): RawTrendItem | null {
  const titleMatch = itemXml.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i);
  const linkMatch = itemXml.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i) ?? itemXml.match(/<link[^>]*href=["']([^"']+)["']/i);
  const contentMatch =
    itemXml.match(/<content:encoded(?:\s[^>]*)?>([\s\S]*?)<\/content:encoded>/i) ??
    itemXml.match(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i);
  const pubDateMatch = itemXml.match(/<pubDate(?:\s[^>]*)?>([\s\S]*?)<\/pubDate>/i);

  const rawTitle = titleMatch?.[1] ? cleanHtmlToText(titleMatch[1]) : "";
  const rawUrl = (linkMatch?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  const rawContent = contentMatch?.[1] ? cleanHtmlToText(contentMatch[1]) : "";

  if (!rawTitle || !rawUrl) return null;

  // Filter out site headers / generic pages
  if (rawTitle.toLowerCase().includes("the latest movie reviews") || rawTitle === "Den of Geek") {
    return null;
  }

  const fullText = rawContent.substring(0, MAX_ARTICLE_TEXT_LENGTH);
  const shortSnippet = fullText.length > 200 ? `${fullText.substring(0, 200)}...` : fullText;

  return {
    title: rawTitle,
    url: rawUrl,
    score: 95,
    source: "Den of Geek",
    summary: shortSnippet || rawTitle,
    fullArticleText: fullText || shortSnippet,
    publishedAt: pubDateMatch?.[1]?.trim(),
  };
}

export async function fetchDenOfGeekArticles(feedUrl: string = "https://www.denofgeek.com/movies/feed/"): Promise<RawTrendItem[]> {
  logger.info({ feedUrl }, "Fetching trending movie & pop-culture articles from Den of Geek...");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": HTTP_USER_AGENT,
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (!res.ok) {
      logger.warn({ feedUrl, status: res.status }, "Den of Geek returned non-OK HTTP status");
      return [];
    }

    const xml = await res.text();
    const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

    const articles: RawTrendItem[] = [];
    for (const block of itemBlocks.slice(0, 15)) {
      const parsed = parseRssItem(block);
      if (parsed) {
        articles.push(parsed);
      }
    }

    logger.info({ feedUrl, count: articles.length }, "Successfully fetched Den of Geek articles");
    return articles;
  } catch (err: any) {
    logger.error({ err: err.message, feedUrl }, "Failed to fetch articles from Den of Geek");
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
