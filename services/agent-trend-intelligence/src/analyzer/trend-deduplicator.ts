import type { RawTrendItem } from "../validators/trend.validator.js";

export function deduplicateRawTrends(items: RawTrendItem[]): RawTrendItem[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const result: RawTrendItem[] = [];

  for (const item of items) {
    const normalizedUrl = item.url.trim().replace(/\/$/, "");
    const normalizedTitle = item.title.trim().toLowerCase();

    if (seenUrls.has(normalizedUrl) || seenTitles.has(normalizedTitle)) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    seenTitles.add(normalizedTitle);
    result.push(item);
  }

  return result;
}
