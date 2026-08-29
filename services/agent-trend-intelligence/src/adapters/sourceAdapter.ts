import { createLogger } from "@pipeline/shared/logger";
import type { TrendSourceConfig } from "@pipeline/shared/schemas";
import type { RawTrendItem } from "../aggregator.js";
import { fetchTelegramGithub } from "../fetchers/telegramGithub.js";

const logger = createLogger("source-adapter");

/**
 * Единый контракт для разных типов источников трендов (см. TZ_vertical_agnostic_b2b_saas.md, раздел 2.1).
 * Каждая реализация получает TrendSourceConfig (из IndustryProfile.trendSources) и возвращает
 * нормализованный список RawTrendItem — без sourceName (проставляется вызывающей стороной из config.label).
 */
export interface SourceAdapter {
  fetch(config: TrendSourceConfig): Promise<Array<{ title: string; url: string; score: number }>>;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, application/xml, text/xml, text/html, */*",
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

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

/** Минимальный RSS/Atom-парсер с извлечением полного текста статей. */
function parseRssItems(
  xml: string,
  limit: number
): Array<{ title: string; url: string; fullText?: string; summary?: string }> {
  const items: Array<{ title: string; url: string; fullText?: string; summary?: string }> = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];

  for (const block of itemBlocks.slice(0, limit)) {
    const titleMatch = block.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i);
    const linkMatch =
      block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i) ?? block.match(/<link[^>]*href=["']([^"']+)["']/i);
    const contentMatch =
      block.match(/<content:encoded(?:\s[^>]*)?>([\s\S]*?)<\/content:encoded>/i) ??
      block.match(/<content(?:\s[^>]*)?>([\s\S]*?)<\/content>/i) ??
      block.match(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i) ??
      block.match(/<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/i);

    const titleCaptured = titleMatch?.[1];
    if (!titleCaptured) continue;

    const rawTitle = cleanHtmlToText(titleCaptured);
    const rawUrl = (linkMatch?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const rawContent = contentMatch?.[1] ? cleanHtmlToText(contentMatch[1]) : "";

    if (rawTitle && rawUrl) {
      const fullText = rawContent.substring(0, 5000);
      const summary = fullText.length > 250 ? `${fullText.substring(0, 250)}...` : fullText;
      items.push({ title: rawTitle, url: rawUrl, fullText: fullText || rawTitle, summary: summary || rawTitle });
    }
  }
  return items;
}

export interface SourceAdapterResultItem {
  title: string;
  url: string;
  score: number;
  fullText?: string;
  summary?: string;
}

export interface SourceAdapter {
  fetch(config: TrendSourceConfig): Promise<SourceAdapterResultItem[]>;
}

/** RSS/Atom-фиды: пресс-центры производителей, отраслевые новостные ленты. */
export class RssAdapter implements SourceAdapter {
  async fetch(config: TrendSourceConfig): Promise<SourceAdapterResultItem[]> {
    try {
      const res = await fetchWithTimeout(config.url, 8000);
      if (!res.ok) {
        logger.warn({ url: config.url, status: res.status }, "RSS source returned non-OK status");
        return [];
      }
      const xml = await res.text();
      const items = parseRssItems(xml, 15);
      return items.map((item) => ({
        ...item,
        score: Math.round(config.weight * 100),
      }));
    } catch (err) {
      logger.error({ err, url: config.url }, "RssAdapter fetch failed");
      return [];
    }
  }
}

/**
 * Generic JSON API источники (не требующие специфичной авторизации/пагинации).
 * Ожидает массив объектов с полями title/url (или name/link) на верхнем уровне либо в поле items/data/results.
 */
export class ApiAdapter implements SourceAdapter {
  async fetch(config: TrendSourceConfig): Promise<Array<{ title: string; url: string; score: number }>> {
    try {
      const res = await fetchWithTimeout(config.url, 8000);
      if (!res.ok) {
        logger.warn({ url: config.url, status: res.status }, "API source returned non-OK status");
        return [];
      }
      const json: any = await res.json();
      const list: any[] = Array.isArray(json) ? json : json.items ?? json.data ?? json.results ?? [];

      return list
        .slice(0, 15)
        .map((entry) => ({
          title: entry.title ?? entry.name ?? entry.headline ?? "",
          url: entry.url ?? entry.link ?? entry.html_url ?? "",
          score: Math.round(config.weight * 100),
        }))
        .filter((item) => item.title && item.url);
    } catch (err) {
      logger.error({ err, url: config.url }, "ApiAdapter fetch failed");
      return [];
    }
  }
}

/**
 * Скрапинг HTML-страниц без API (например статичные страницы новостей/выставок).
 * MVP-реализация: вытаскивает заголовки <h1>-<h3> со ссылками из HTML без headless-браузера.
 * Для страниц, требующих JS-рендеринга, потребуется отдельный ScrapeAdapter на Puppeteer в будущей фазе.
 */
export class ScrapeAdapter implements SourceAdapter {
  async fetch(config: TrendSourceConfig): Promise<Array<{ title: string; url: string; score: number }>> {
    try {
      const res = await fetchWithTimeout(config.url, 10000);
      if (!res.ok) {
        logger.warn({ url: config.url, status: res.status }, "Scrape source returned non-OK status");
        return [];
      }
      const html = await res.text();
      const anchorMatches = html.match(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi) ?? [];

      const items: Array<{ title: string; url: string; score: number }> = [];
      for (const raw of anchorMatches.slice(0, 60)) {
        const hrefMatch = raw.match(/href=["']([^"']+)["']/i);
        const textMatch = raw.match(/>([\s\S]*?)<\/a>/i);
        const href = hrefMatch?.[1] ?? "";
        const text = (textMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim();

        if (text.length > 20 && href.startsWith("http")) {
          items.push({ title: text, url: href, score: Math.round(config.weight * 100) });
        }
        if (items.length >= 15) break;
      }
      return items;
    } catch (err) {
      logger.error({ err, url: config.url }, "ScrapeAdapter fetch failed");
      return [];
    }
  }
}

/** YouTube-каналы отраслевых блогеров/производителей — заглушка до интеграции с YouTube Data API (требует API key). */
export class YoutubeAdapter implements SourceAdapter {
  async fetch(config: TrendSourceConfig): Promise<Array<{ title: string; url: string; score: number }>> {
    logger.warn(
      { url: config.url },
      "YoutubeAdapter is a stub — requires YOUTUBE_API_KEY integration in a future phase, skipping for now",
    );
    return [];
  }
}

/** Кастомные источники (включая Telegram-каналы, напр. @github). */
export class CustomAdapter implements SourceAdapter {
  async fetch(config: TrendSourceConfig): Promise<SourceAdapterResultItem[]> {
    if (config.url && config.url.includes("t.me")) {
      try {
        const tgItems = await fetchTelegramGithub();
        return tgItems.map((item) => ({
          title: item.title,
          url: item.url,
          score: item.score || Math.round(config.weight * 100),
          summary: item.summary,
          fullText: item.summary,
        }));
      } catch (err: any) {
        logger.error({ err: err.message, url: config.url }, "Telegram fetch failed in CustomAdapter");
        return [];
      }
    }

    logger.warn(
      { url: config.url, label: config.label },
      "CustomAdapter has no default implementation for this URL",
    );
    return [];
  }
}

export function getAdapterFor(config: TrendSourceConfig): SourceAdapter {
  switch (config.type) {
    case "rss":
      return new RssAdapter();
    case "api":
      return new ApiAdapter();
    case "scrape":
      return new ScrapeAdapter();
    case "youtube":
      return new YoutubeAdapter();
    case "custom":
      return new CustomAdapter();
    default:
      // Экземпляр никогда не должен сюда дойти при валидном Zod-enum, но на всякий случай — безопасный дефолт.
      return new CustomAdapter();
  }
}

/** Прогоняет все источники IndustryProfile.trendSources параллельно и агрегирует в RawTrendItem[]. */
export async function fetchFromConfiguredSources(sources: TrendSourceConfig[]): Promise<RawTrendItem[]> {
  const results = await Promise.all(
    sources.map(async (config) => {
      const adapter = getAdapterFor(config);
      const items = await adapter.fetch(config).catch((err) => {
        logger.error({ err, label: config.label }, "Source adapter threw unexpectedly");
        return [];
      });
      return items.map((item) => ({ ...item, sourceName: config.label }));
    }),
  );
  return results.flat();
}
