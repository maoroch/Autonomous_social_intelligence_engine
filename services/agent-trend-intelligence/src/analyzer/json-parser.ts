import type { AnalyzedTrendItem } from "../validators/trend.validator.js";

export function parseCleanJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  cleaned = cleaned.trim();

  let inString = false;
  let result = "";
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prevChar = i > 0 ? cleaned[i - 1] : "";
    if (char === '"' && prevChar !== "\\") {
      inString = !inString;
      result += char;
    } else if (char === "\n" && inString) {
      result += "\\n";
    } else if (char === "\r" && inString) {
      result += "\\r";
    } else if (char === "\t" && inString) {
      result += "\\t";
    } else {
      result += char;
    }
  }

  try {
    return JSON.parse(result);
  } catch (err) {
    const firstBrace = result.indexOf("{");
    const lastBrace = result.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = result.substring(firstBrace, lastBrace + 1);
      return JSON.parse(extracted);
    }
    throw err;
  }
}

export function sanitizeLlmOutput(rawObj: any): { items: AnalyzedTrendItem[] } {
  if (!rawObj || typeof rawObj !== "object") {
    throw new Error("LLM did not return an object");
  }

  const items = Array.isArray(rawObj.items) ? rawObj.items : [];
  const sanitizedItems: AnalyzedTrendItem[] = items.map((item: any) => {
    const title = typeof item.title === "string" ? item.title.trim() : "Unknown Trend";
    const summary = typeof item.summary === "string" ? item.summary.trim() : "No summary provided by LLM";
    let score = typeof item.score === "number" ? item.score : 50;
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    const keywords = Array.isArray(item.keywords)
      ? item.keywords.filter((kw: any) => typeof kw === "string").map((kw: string) => kw.trim())
      : [];

    const sources = Array.isArray(item.sources)
      ? item.sources
          .filter((src: any) => {
            if (typeof src !== "string") return false;
            try {
              new URL(src.trim());
              return true;
            } catch {
              return false;
            }
          })
          .map((src: string) => src.trim())
      : [];

    return {
      title,
      summary,
      score,
      keywords,
      sources,
      fullArticleText: typeof item.fullArticleText === "string" ? item.fullArticleText : undefined,
    };
  });

  return { items: sanitizedItems };
}
