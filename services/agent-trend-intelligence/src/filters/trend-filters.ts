import type { RawTrendItem } from "../validators/trend.validator.js";

export interface TenantFilterRule {
  brandPattern: RegExp;
  negativePattern?: RegExp;
  brandTag: string;
  nicheFocusPrompt: string;
}

export const TENANT_FILTER_RULES: Record<string, TenantFilterRule> = {
  testo: {
    brandPattern:
      /\btesto\b|тесто|\btesto\s*(350|300|340|310|316|saveris|174|875|883|400|440|550|770)\b|azia-test|азия[- ]тест|gxp|21\s*cfr|cleanroom|газоанализатор|flue\s*gas/i,
    brandTag: "[★ TESTO BRAND / COMPLIANCE MATCH]",
    nicheFocusPrompt:
      "Focus on Testo industrial measurement equipment, flue gas analysis, cleanrooms, GxP standards, and AZIA-TEST compliance.",
  },
  "cinema-media": {
    brandPattern:
      /\b(marvel|mcu|dc|disney|warner|warner bros|box office|oscar|kinopeek|avatar|batman|superman|star wars)\b/i,
    brandTag: "[★ CINEMA POP-CULTURE HIT]",
    nicheFocusPrompt:
      "Focus on pop-culture, Marvel/DC lore, film production secrets, forgotten movies, box-office and iconic TV series.",
  },
  "software-development-default": {
    brandPattern: /\b(github|open[- ]source|architecture|kubernetes|ai agent|typescript|cloud native)\b/i,
    brandTag: "[★ TECH HIGH-IMPACT]",
    nicheFocusPrompt: "Focus on high-impact software development, cloud, AI, and IT engineering trends.",
  },
};

/**
 * Checks whether an article contains a direct brand or primary focus keyword for the tenant.
 */
export function hasBrandMention(article: RawTrendItem, tenantId: string): boolean {
  const rule = TENANT_FILTER_RULES[tenantId];
  if (!rule) return false;

  const content = `${article.title} ${article.summary || ""} ${article.fullArticleText || ""}`;
  if (rule.negativePattern && rule.negativePattern.test(content)) {
    return false;
  }
  return rule.brandPattern.test(content);
}

/**
 * Returns formatted brand tag for Stage 1 headline selection if matched.
 */
export function getBrandTagForArticle(article: RawTrendItem, tenantId: string): string {
  const rule = TENANT_FILTER_RULES[tenantId];
  if (!rule) return "";

  return hasBrandMention(article, tenantId) ? ` ${rule.brandTag}` : "";
}

/**
 * Returns tenant-specific prompt directive for Stage 1 headline selection.
 */
export function getNicheFocusPrompt(tenantId: string): string {
  const rule = TENANT_FILTER_RULES[tenantId];
  return rule ? rule.nicheFocusPrompt : "Focus on high-impact professional industry trends.";
}

/**
 * Partitions and prioritizes incoming raw trends:
 * Articles with explicit brand/niche matches are sorted directly to the front.
 */
export function prioritizeTrendsForTenant(
  rawTrends: RawTrendItem[],
  tenantId: string
): { candidateTrends: RawTrendItem[]; brandMatchesCount: number } {
  if (rawTrends.length === 0) {
    return { candidateTrends: [], brandMatchesCount: 0 };
  }

  const withMention: RawTrendItem[] = [];
  const withoutMention: RawTrendItem[] = [];

  for (const item of rawTrends) {
    if (hasBrandMention(item, tenantId)) {
      withMention.push(item);
    } else {
      withoutMention.push(item);
    }
  }

  return {
    candidateTrends: withMention.length > 0 ? [...withMention, ...withoutMention] : rawTrends,
    brandMatchesCount: withMention.length,
  };
}
