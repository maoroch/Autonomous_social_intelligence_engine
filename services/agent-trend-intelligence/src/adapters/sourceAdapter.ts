import { createLogger } from "@pipeline/shared/logger";
import type { TrendSourceConfig } from "@pipeline/shared/schemas";
import type { RawTrendItem } from "../aggregator.js";

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
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Минимальный RSS/Atom-парсер без внешних зависимостей — достаточно для title/link большинства фидов. */
function parseRssItems(xml: string, limit: number): Array<{ title: string; url: string }> {
  const items: Array<{ title: string; url: string }> = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];

  for (const block of itemBlocks.slice(0, limit)) {
    const titleMatch = block.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i);
    const linkMatch =
      block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i) ?? block.match(/<link[^>]*href=["']([^"']+)["']/i);

    const titleCaptured = titleMatch?.[1];
    if (!titleCaptured) continue;

    const rawTitle = titleCaptured.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const rawUrl = (linkMatch?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();

    if (rawTitle && rawUrl) {
      items.push({ title: rawTitle, url: rawUrl });
    }
  }
  return items;
}

/** RSS/Atom-фиды: пресс-центры производителей, отраслевые новостные ленты. */
export class RssAdapter implements SourceAdapter {
  async fetch(config: TrendSourceConfig): Promise<Array<{ title: string; url: string; score: number }>> {
    try {
      const res = await fetchWithTimeout(config.url, 8000);
      if (!res.ok) {
        logger.warn({ url: config.url, status: res.status }, "RSS source returned non-OK status");
        return [];
      }
      const xml = await res.text();
      const items = parseRssItems(xml, 15);
      // score фиксированный, т.к. RSS-фиды обычно не дают метрику популярности — приоритет через config.weight.
      return items.map((item) => ({ ...item, score: Math.round(config.weight * 100) }));
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

/** Заглушка для источников, требующих индивидуальной логики (партнёрские API, приватные фиды и т.д.). */
export class CustomAdapter implements SourceAdapter {
  async fetch(config: TrendSourceConfig): Promise<Array<{ title: string; url: string; score: number }>> {
    logger.warn(
      { url: config.url, label: config.label },
      "CustomAdapter has no default implementation — implement per-source logic before production use",
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
