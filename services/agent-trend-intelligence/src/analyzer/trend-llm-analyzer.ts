import { AiClient, filterHallucinatedSources } from "@pipeline/shared/ai";
import { createLogger } from "@pipeline/shared/logger";
import type { IndustryProfile } from "@pipeline/shared/schemas";
import type { RawTrendItem, TrendAnalysisOutput, AnalyzedTrendItem } from "../validators/trend.validator.js";
import { parseCleanJson, sanitizeLlmOutput } from "./json-parser.js";
import { chunkArticleText } from "../sources/denofgeek.source.js";
import {
  getBrandTagForArticle,
  getNicheFocusPrompt,
  prioritizeTrendsForTenant,
} from "../filters/trend-filters.js";

const logger = createLogger("agent-trend:llm-analyzer");

/**
 * Stage 1: Formats headlines + short snippets for lightweight virality selection
 */
export function formatHeadlinesForSelection(trends: RawTrendItem[], tenantId: string = "software-development-default"): string {
  if (trends.length === 0) return "No articles available.";

  // Up to 25 headlines, very compact (<1000 tokens total)
  return trends
    .slice(0, 25)
    .map((t, idx) => {
      const brandTag = getBrandTagForArticle(t, tenantId);
      return `[#${idx + 1}] "${t.title}"${brandTag} | Source: ${t.source} | URL: ${t.url}`;
    })
    .join("\n");
}

/**
 * Stage 1 LLM Call: Selects the top 3 most viral/relevant stories by headlines
 */
async function selectTopHeadlinesWithLLM(
  aiClient: AiClient,
  rawTrends: RawTrendItem[],
  tenantId: string,
  industryProfile?: IndustryProfile
): Promise<number[]> {
  const headlinesText = formatHeadlinesForSelection(rawTrends, tenantId);
  const nicheFocus = getNicheFocusPrompt(tenantId);

  const systemPrompt = `You are an expert Chief Editor and Content Strategist.
Your task is to analyze news headlines and select the TOP 3 most critical, engaging, and high-impact topics for our professional audience.

${nicheFocus}

Return a valid JSON object with the array of selected indices (1-based):
{
  "selectedIndices": [1, 5, 12],
  "reasoning": "Brief explanation..."
}`;

  const userPrompt = `Here are the latest headlines:

${headlinesText}

Pick the 3 best topics to write in-depth posts about.`;

  logger.info({ tenantId, count: rawTrends.length }, "Stage 1: Fast selection of top topics by headlines...");

  try {
    const res = await aiClient.complete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.4, preferredProvider: "gemini" }
    );

    const parsed = parseCleanJson(res.text);
    if (Array.isArray(parsed.selectedIndices) && parsed.selectedIndices.length > 0) {
      const indices = parsed.selectedIndices
        .map((n: any) => Number(n) - 1)
        .filter((idx: number) => idx >= 0 && idx < rawTrends.length);
      if (indices.length > 0) return indices;
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, "Stage 1 headline selection failed, falling back to top 3");
  }

  return [0, 1, 2].filter((i) => i < rawTrends.length);
}

/**
 * Stage 2 LLM Call: Deep Dive into 1 specific full article (with batching/chunking support)
 */
async function deepDiveSingleArticle(
  aiClient: AiClient,
  article: RawTrendItem,
  tenantId: string
): Promise<AnalyzedTrendItem> {
  const isCinemaMedia = tenantId === "cinema-media";
  const isTesto = tenantId === "testo";
  const fullText = article.fullArticleText || article.summary || article.title;
  const chunks = chunkArticleText(fullText, 2500);

  // If long article, combine chunked key insights
  const articleContext = chunks.length > 1
    ? `[Section 1]:\n${chunks[0]}\n\n[Section 2 / Details]:\n${chunks[1]}`
    : fullText;

  let domainInstructions = "";
  if (isCinemaMedia) {
    domainInstructions = "Analyze real facts, director/actor quotes, production trivia, and core pop-culture conflicts. Output title and summary in Russian.";
  } else if (isTesto) {
    const isPharma = /pharma|fda|gxp|gmp|cleanroom|биос[еэ]нсор|препарат|медицин|saveris|lingo|abbott/i.test(`${article.title} ${article.summary || ""}`);
    const isGas = /boiler|flue|combustion|котельн|газоанализ|горелк|выброс|пелтье/i.test(`${article.title} ${article.summary || ""}`);

    if (isPharma) {
      domainInstructions = `Analyze pharmaceutical engineering, cleanroom environments, regulatory standards (FDA, GxP, GMP, ISO 13485, 21 CFR Part 11), technical parameters (temperature, relative humidity, differential pressure, audit trail), and audit compliance risks.
Only reference pharmaceutical systems (Testo Saveris Pharma, Testo 190, Testo 174T).
CRITICAL LANGUAGE REQUIREMENT: All output fields ("title", "summary") MUST BE STRICTLY WRITTEN IN RUSSIAN LANGUAGE.`;
    } else if (isGas) {
      domainInstructions = `Analyze industrial flue gas emissions, boiler tuning, combustion efficiency, environmental regulations (OSHA, NFPA), technical parameters (NOx, CO, O2, SO2, lambda, Peltier gas cooler, heat losses qA), and safety risks for plant engineers.
Only reference flue gas analyzers (Testo 300, Testo 310 II, Testo 340, Testo 350).
CRITICAL LANGUAGE REQUIREMENT: All output fields ("title", "summary") MUST BE STRICTLY WRITTEN IN RUSSIAN LANGUAGE.`;
    } else {
      domainInstructions = `Analyze industrial engineering challenges, regulatory standards, and metrology precision.
CRITICAL LANGUAGE REQUIREMENT: All output fields ("title", "summary") MUST BE STRICTLY WRITTEN IN RUSSIAN LANGUAGE.`;
    }
  } else {
    domainInstructions = "Analyze technical architecture, developer challenges, and practical software engineering takeaways.";
  }

  const systemPrompt = `You are a Senior Technical Editorial Analyst and Copywriting Strategist.
Your goal is to perform a deep-dive analysis of a single article from a premier industry source.

${domainInstructions}

Output a valid raw JSON object matching:
{
  "title": "A catchy, professional editorial headline in Russian (e.g. 'Новые стандарты OSHA: как инженеру защитить котельную от штрафов' or 'Аудит чистых помещений по GxP: 4 скрытых риска')",
  "summary": "Rich 3-4 sentence analytical breakdown with real technical facts, metrics, regulations, and key insights from the article",
  "score": 95,
  "keywords": ["tag1", "tag2", "tag3"],
  "sources": ["${article.url}"]
}`;

  const userPrompt = `Original Article Title: "${article.title}"
Source URL: ${article.url}

Full Article Content for Deep-Dive:
${articleContext}

Extract the key insights and create the deep-dive JSON analysis.`;

  logger.info({ url: article.url, textLength: fullText.length, tenantId }, "Stage 2: Performing deep-dive on selected full article...");

  const res = await aiClient.complete(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.5, preferredProvider: "gemini" }
  );

  let parsed: any;
  try {
    parsed = parseCleanJson(res.text);
  } catch {
    parsed = {
      title: article.title,
      summary: fullText.substring(0, 300),
      score: 90,
      keywords: isTesto ? ["Testo", "Engineering", "Compliance"] : ["Tech", "Industry"],
      sources: [article.url],
    };
  }

  return {
    title: typeof parsed.title === "string" ? parsed.title.trim() : article.title,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : article.title,
    score: typeof parsed.score === "number" ? Math.min(100, Math.max(0, parsed.score)) : 95,
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : ["Cinema", "Lore"],
    sources: [article.url],
    fullArticleText: fullText,
  };
}

export async function analyzeTrendsWithLLM(
  aiClient: AiClient,
  rawTrends: RawTrendItem[],
  tenantId: string,
  industryProfile?: IndustryProfile
): Promise<TrendAnalysisOutput> {
  if (rawTrends.length === 0) {
    return { items: [] };
  }

  const { candidateTrends, brandMatchesCount } = prioritizeTrendsForTenant(rawTrends, tenantId);
  if (brandMatchesCount > 0) {
    logger.info(
      { tenantId, brandMatchesCount },
      "Prioritized articles with direct brand/niche focus at top"
    );
  }

  // 1. Stage 1: Pick Top 1-3 winning candidate stories by lightweight headlines
  const winningIndices = await selectTopHeadlinesWithLLM(aiClient, candidateTrends, tenantId, industryProfile);
  logger.info({ winningIndices, count: winningIndices.length }, "Selected top winning topics from headlines");

  // 2. Stage 2: Deep Dive into each winning article (with full text extraction & batching)
  const analyzedItems: AnalyzedTrendItem[] = [];
  for (const idx of winningIndices.slice(0, 3)) {
    const article = candidateTrends[idx];
    if (!article) continue;
    try {
      const analyzed = await deepDiveSingleArticle(aiClient, article, tenantId);
      analyzedItems.push(analyzed);
    } catch (err: any) {
      logger.warn({ err: err.message, url: article.url }, "Deep-dive on single article failed, using raw fallback");
      analyzedItems.push({
        title: article.title,
        summary: article.summary || article.title,
        score: 90,
        keywords: ["Cinema", "Lore"],
        sources: [article.url],
        fullArticleText: article.fullArticleText || article.title,
      });
    }
  }

  // 3. Anti-hallucination verification
  const rawUrls = rawTrends.map((t) => t.url);
  for (const item of analyzedItems) {
    item.sources = filterHallucinatedSources(item.sources, rawUrls);
  }

  return { items: analyzedItems };
}
