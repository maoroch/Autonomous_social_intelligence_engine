import type { RawTrendItem } from "../validators/trend.validator.js";

export interface TenantFilterRule {
  brandPattern: RegExp;
  negativePattern?: RegExp;
  brandTag: string;
  nicheFocusPrompt: string;
}

export const TENANT_FILTER_RULES: Record<string, TenantFilterRule> = {
  "testo-pharma": {
    brandPattern:
      /\btesto\s*(saveris|190|174|175|176|883|875|400|440)\b|saveris|21\s*cfr|gxp|gmp|gdp|холодов|cleanroom|лиофилиз|фарма|биосенсор|abbott|lingo/i,
    negativePattern:
      /\btesto\s*(350|300|340|310|316)\b|газоанализатор|дымов|котельн|горелк|flue\s*gas|combustion/i,
    brandTag: "[★ PHARMA & 21 CFR / TESTO SAVERIS MATCH]",
    nicheFocusPrompt: `Focus strictly on pharmaceutical manufacturing, biotechnology, GxP / GMP compliance, FDA 21 CFR Part 11, cleanroom monitoring, and GDP cold chain.
CRITICAL STRICT PILLAR ISOLATION:
- Focus ONLY on cleanroom and laboratory parameters: temperature, relative humidity, differential pressure, audit trail, ERES, IQ/OQ/PQ validation.
- FORBIDDEN TOPICS: NEVER mention boilers, furnaces, burner tuning, flue gases, or combustion emissions (NOx, CO, SO2).
- FORBIDDEN INSTRUMENTS: NEVER mention flue gas analyzers (Testo 300, Testo 310, Testo 340, Testo 350)! Use only Testo Saveris, Testo 190, Testo 174T.`,
  },
  "testo-gas": {
    brandPattern:
      /\btesto\s*(350|300|340|310|316)\b|газоанализатор|дымов|пелтье|котельн|горелк|flue\s*gas|combustion/i,
    negativePattern:
      /saveris|21\s*cfr|gxp|gmp|gdp|холодов|cleanroom|лиофилиз|фарма|биосенсор/i,
    brandTag: "[★ GAS ANALYZER / TESTO COMBUSTION MATCH]",
    nicheFocusPrompt: `Focus strictly on industrial flue gas analysis, boiler efficiency, burner tuning, and environmental emissions (NOx, CO, O2, SO2).
CRITICAL STRICT PILLAR ISOLATION:
- Focus ONLY on combustion diagnostics, heat losses (qA), excess air ratio (lambda), sensor range extension, and sample conditioning (Peltier gas cooler).
- FORBIDDEN TOPICS: NEVER mention pharmaceutical drugs, biosensors, FDA 21 CFR Part 11, GxP, GMP, or clinical trials!
- FORBIDDEN INSTRUMENTS: NEVER mention pharma systems (Testo Saveris)! Use only Testo 300, Testo 310 II, Testo 340, Testo 350.`,
  },
  testo: {
    brandPattern:
      /\btesto\b|тесто|\btesto\s*(350|300|340|310|316|saveris|174|875|883|400|440|550|770)\b|azia-test|азия[- ]тест/i,
    brandTag: "[★ ПРЯМОЕ УПОМИНАНИЕ TESTO / BRAND MATCH]",
    nicheFocusPrompt: `Focus on Testo industrial measurement equipment and compliance.
CRITICAL ISOLATION RULE: Keep pharmaceutical compliance (Saveris, 21 CFR Part 11) and boiler combustion (Testo 300/350, NOx/CO) strictly separated. NEVER mix boiler emissions into pharma articles!`,
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
 * Resolves rule key based on tenant and target pillar
 */
function resolveRuleKey(tenantId: string, targetPillarId?: string): string {
  if (tenantId === "testo") {
    if (targetPillarId?.startsWith("pharma-")) return "testo-pharma";
    if (targetPillarId?.startsWith("gas-")) return "testo-gas";
    return "testo";
  }
  return tenantId;
}

/**
 * Checks whether an article contains a direct brand or primary focus keyword for the tenant/pillar.
 */
export function hasBrandMention(article: RawTrendItem, tenantId: string, targetPillarId?: string): boolean {
  const key = resolveRuleKey(tenantId, targetPillarId);
  const rule = TENANT_FILTER_RULES[key] || TENANT_FILTER_RULES[tenantId];
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
export function getBrandTagForArticle(article: RawTrendItem, tenantId: string, targetPillarId?: string): string {
  const key = resolveRuleKey(tenantId, targetPillarId);
  const rule = TENANT_FILTER_RULES[key] || TENANT_FILTER_RULES[tenantId];
  if (!rule) return "";

  return hasBrandMention(article, tenantId, targetPillarId) ? ` ${rule.brandTag}` : "";
}

/**
 * Returns tenant-specific prompt directive for Stage 1 headline selection.
 */
export function getNicheFocusPrompt(tenantId: string, targetPillarId?: string): string {
  const key = resolveRuleKey(tenantId, targetPillarId);
  const rule = TENANT_FILTER_RULES[key] || TENANT_FILTER_RULES[tenantId];
  return rule ? rule.nicheFocusPrompt : "Focus on high-impact professional industry trends.";
}

/**
 * Partitions and prioritizes incoming raw trends:
 * Articles with explicit brand/niche matches are sorted directly to the front.
 */
export function prioritizeTrendsForTenant(
  rawTrends: RawTrendItem[],
  tenantId: string,
  targetPillarId?: string
): { candidateTrends: RawTrendItem[]; brandMatchesCount: number } {
  if (rawTrends.length === 0) {
    return { candidateTrends: [], brandMatchesCount: 0 };
  }

  const withMention: RawTrendItem[] = [];
  const withoutMention: RawTrendItem[] = [];

  for (const item of rawTrends) {
    if (hasBrandMention(item, tenantId, targetPillarId)) {
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
