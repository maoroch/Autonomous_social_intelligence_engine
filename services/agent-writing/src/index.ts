import "dotenv/config";
import express from "express";
import { createWorker, createQueue } from "@pipeline/shared/queue";
import { createLogger } from "@pipeline/shared/logger";
import { QueueName, PipelineStage } from "@pipeline/shared";
import {
  AgentJobSchema,
  type AgentJob,
  PipelineEventSchema,
  type PipelineEvent,
  WritingOutputSchema,
  type IndustryProfile,
} from "@pipeline/shared/schemas";
import { AiClient, checkNumericGrounding, retrieveRelevantChunks, formatFactsForPrompt, type RetrievableChunk } from "@pipeline/shared/ai";
import { connectMongo, getCollection, Collections, type PipelineRunDoc, type IndustryProfileDoc, type FactChunkDoc } from "@pipeline/shared/db";
import { ObjectId } from "mongodb";

const logger = createLogger("agent-writing");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 4004);
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

const openrouterApiKey = process.env.OPENROUTER_API_KEY ?? "";
const groqApiKey = process.env.GROQ_API_KEY ?? "";

const aiClient = new AiClient({
  openrouterApiKey,
  groqApiKey,
  redisUrl: REDIS_URL,
});

const DEFAULT_PROFILE = {
  topics: ["Node.js", "Next.js", "AI", "SaaS", "Backend", "Automation", "Supabase"],
  forbidden_words: ["crypto", "web3", "nft"],
  cta_style: "Задайте открытый вопрос в конце для вовлечения",
  use_emoji: true,
  tone: "профессиональный, но доступный, без лишней \"воды\"",
};

const eventsQueue = createQueue<PipelineEvent>(QueueName.PIPELINE_EVENTS, REDIS_URL);

function parseCleanJson(text: string): any {
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

  // Итерируемся по строке и экранируем реальные переводы строк внутри строковых литералов JSON
  let inString = false;
  let result = "";
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prevChar = i > 0 ? cleaned[i - 1] : "";
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
      result += char;
    } else if (char === '\n' && inString) {
      result += '\\n';
    } else if (char === '\r' && inString) {
      result += '\\r';
    } else if (char === '\t' && inString) {
      result += '\\t';
    } else {
      result += char;
    }
  }

  return JSON.parse(result);
}

function sanitizeLlmOutput(rawObj: any): any {
  if (!rawObj || typeof rawObj !== "object") {
    throw new Error("LLM did not return an object");
  }

  const text = typeof rawObj.text === "string" ? rawObj.text.trim() : "No text generated";
  const hook = typeof rawObj.hook === "string" ? rawObj.hook.trim() : "No hook generated";
  const cta = typeof rawObj.cta === "string" ? rawObj.cta.trim() : "No CTA generated";

  return {
    text,
    hook,
    cta,
  };
}

async function processWritingJob(job: AgentJob): Promise<unknown> {
  logger.info({ runId: job.runId }, "Starting text generation for the LinkedIn post...");

  // 1. Получаем выбранную тему из БД
  const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const run = await runsCol.findOne({ runId: job.runId });
  const topic = run?.topic ?? { title: "Rise of AI and Tech", summary: "" };

  // 2. Получаем профиль автора из БД
  const profilesCol = getCollection(Collections.AUTHOR_PROFILES);
  let dbProfile = null;
  if (run?.profileId) {
    try {
      dbProfile = await profilesCol.findOne({ _id: new ObjectId(run.profileId) });
    } catch(err) {
      logger.warn({ runId: job.runId, profileId: run.profileId }, "Failed to find specified profile, falling back to default");
    }
  }
  if (!dbProfile) {
    dbProfile = await profilesCol.findOne({});
  }
  const authorProfile = dbProfile 
    ? {
        topics: Array.isArray(dbProfile.topics) ? dbProfile.topics : DEFAULT_PROFILE.topics,
        forbidden_words: Array.isArray(dbProfile.forbidden_words) ? dbProfile.forbidden_words : DEFAULT_PROFILE.forbidden_words,
        cta_style: typeof dbProfile.cta_style === "string" ? dbProfile.cta_style : DEFAULT_PROFILE.cta_style,
        use_emoji: typeof dbProfile.use_emoji === "boolean" ? dbProfile.use_emoji : DEFAULT_PROFILE.use_emoji,
        tone: typeof dbProfile.tone === "string" ? dbProfile.tone : DEFAULT_PROFILE.tone,
      }
    : DEFAULT_PROFILE;

  // Мультиарендность: определяем tenantId и подгружаем IndustryProfile.
  const tenantId: string = run?.tenantId ?? dbProfile?.tenantId ?? "software-development-default";
  let industryProfile: IndustryProfile | undefined;
  try {
    const doc = await getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES).findOne({ tenantId });
    if (doc) industryProfile = doc;
  } catch (err) {
    logger.warn({ err, tenantId }, "Failed to load IndustryProfile — proceeding with default tech-portal writing style");
  }
  const isNicheVertical = !!industryProfile && industryProfile.verticalName !== "software-development";

  // 3. Получаем стратегию из payload
  const strategy = job.payload ?? {};

  // 3.5. Получаем примеры стилей (Golden Dataset) из базы
  const goldenCol = getCollection(Collections.GOLDEN_WRITING);
  const selectedFormat = strategy.format || "tutorial";
  let goldenPosts: any[] = [];
  try {
    goldenPosts = await goldenCol.find({ format: selectedFormat }).limit(2).toArray();
    if (goldenPosts.length === 0) {
      goldenPosts = await goldenCol.find({}).limit(2).toArray();
    }
  } catch (err) {
    logger.warn({ err }, "Failed to fetch golden posts style examples");
  }

  let fewShotText = "";
  if (goldenPosts.length > 0) {
    fewShotText = `\nSTYLE EXAMPLES (FEW-SHOT EXAMPLES):
Here are examples of high-performing LinkedIn posts matching the format "${selectedFormat}". 
Study their tone, spacing, scannability, list structure, hook strength, and copy their style:
${goldenPosts.map((gp, i) => `
--- Example ${i+1} ---
Hook: ${gp.hook}
Text:
${gp.text}
CTA: ${gp.cta}
----------------------`).join("\n")}
`;
  }

  // ---------- Мультиарендная адаптация стиля письма (TZ_v3_instagram_testo_portal.md, раздел 2.2) ----------

  let styleRulesBlock = "";
  let complianceBlock = "";
  let glossaryBlock = "";
  let platformBlock = "";
  let platformLabel = "LinkedIn";
  let ctaInstruction = authorProfile.cta_style;
  let emojiInstruction = authorProfile.use_emoji ? "Use relevant emojis sparingly to make the text lively." : "Do NOT use emojis.";
  let retrievedFacts: RetrievableChunk[] = [];

  if (isNicheVertical && industryProfile) {
    const rules = industryProfile.contentStyleRules;
    const adaptation = industryProfile.platformAdaptation[0];
    platformLabel = adaptation?.platform === "instagram" ? "Instagram" : adaptation?.platform ?? "Instagram";

    emojiInstruction =
      rules.maxEmojis === 0
        ? "Do NOT use emojis. This is a strict formal B2B industry — emojis undermine credibility."
        : `Use at most ${rules.maxEmojis} emoji(s) total, and only where it adds genuine clarity, not decoration.`;

    ctaInstruction =
      rules.hashtagStrategy === "none"
        ? "Do not add hashtags."
        : `Add approximately ${adaptation?.hashtagCount ?? 8} relevant hashtags at the end, mixing broad industry tags and specific niche tags.`;

    const ctaStyleInstruction =
      adaptation?.ctaStyle === "soft"
        ? 'Use a SOFT call to action (e.g. "Save this post", "More in bio") — never pushy sales language like "Buy now".'
        : "Use a direct call to action.";

    styleRulesBlock = `\nFormality level: ${rules.formalityLevel}. ${ctaStyleInstruction}
${rules.forbiddenPhrases.length > 0 ? `Additionally forbidden phrases (marketing clichés for this brand): ${rules.forbiddenPhrases.join(", ")}.` : ""}\n`;

    if (rules.requiredDisclaimers.length > 0) {
      complianceBlock = `\nMANDATORY DISCLAIMER(S): You MUST include the following disclaimer text verbatim somewhere in the post (naturally integrated, not just appended): ${rules.requiredDisclaimers.join(" ")}\n`;
    }

    if (industryProfile.complianceConfig.factCheckRequired) {
      // RAG-слой: подтягиваем релевантные факты из базы IndustryProfile перед генерацией,
      // чтобы модель цитировала числа ИЗ базы, а не "додумывала" их (см. shared-lib/src/ai/retrieval.ts).
      try {
        const factChunksCol = getCollection<FactChunkDoc>(Collections.FACT_CHUNKS);
        const allChunks = await factChunksCol.find({ tenantId }).toArray();
        const query = `${topic.title} ${topic.summary} ${strategy.core_idea ?? ""}`;
        retrievedFacts = retrieveRelevantChunks(query, allChunks, 3);
      } catch (err) {
        logger.warn({ err, tenantId }, "Failed to retrieve fact chunks for RAG grounding");
      }

      if (retrievedFacts.length > 0) {
        complianceBlock += `\nCRITICAL FACTUAL ACCURACY REQUIREMENT: This is a regulated industry. Below are VERIFIED FACTS retrieved from the official spec database. If you state any numeric technical characteristic (measurement range, accuracy, certification, etc.), it MUST come from this list, cited close to verbatim. If a needed number is not in this list, write about the concept qualitatively instead of inventing a figure.

VERIFIED FACTS:
${formatFactsForPrompt(retrievedFacts)}
`;
      } else {
        complianceBlock += `\nCRITICAL FACTUAL ACCURACY REQUIREMENT: This is a regulated industry, and no verified fact sheet was found for this topic. NEVER invent, guess, or approximate specific numeric technical characteristics (measurement ranges, accuracy percentages, certification numbers, etc.). Write about the concept qualitatively instead of inventing any figure.\n`;
      }
    }

    if (industryProfile.glossary.length > 0) {
      glossaryBlock = `\nINDUSTRY GLOSSARY (use these terms precisely):
${industryProfile.glossary.map((g) => `- "${g.term}"${g.definition ? `: ${g.definition}` : ""}`).join("\n")}\n`;
    }

    if (adaptation) {
      platformBlock = `\nPlatform: ${platformLabel}. Maximum caption length: ~${adaptation.maxCaptionLength} characters — be concise, this is NOT a long-form LinkedIn article. Visual emphasis is ${adaptation.visualEmphasis} — the image/carousel carries most of the information, the caption should hook and complement it, not repeat it in full.\n`;
    }
  }

  // 4. Формируем промпт к LLM
  const writerDomain = isNicheVertical
    ? `You are a professional social media copywriter specializing in B2B content for the "${industryProfile!.verticalName}" industry, writing for ${platformLabel}.`
    : "You are a professional LinkedIn content writer specializing in tech/programming topics.";

  const contentPillarId = run?.contentPillarId || (strategy as any)?.content_pillar_id || (job.payload as any)?.targetPillarId;

  let rubricWritingInstruction = "";
  if (contentPillarId === "pet-projects-showcase") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Подборка pet проектов для твоего github"):
- Structure this post as a curated showcase of 3-4 creative pet-project ideas to build for a GitHub portfolio.
- For each project, specify:
  1. Project Title & Concept
  2. Recommended Tech Stack (e.g. Next.js 15, TypeScript, Tailwind, Supabase, OpenAI API)
  3. Key Architecture Features / Key Learning Takeaways.
- Include practical setup guidelines. Keep it super engaging and actionable for software engineers!`;
  } else if (contentPillarId === "github-trending-repos") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Подборка github репозитории"):
- Structure this post as a curated showcase of 3-4 trending open-source GitHub repositories/tools.
- For each repository, specify:
  1. Repo Name & Star Badge (e.g., ⭐ 8.5k stars)
  2. Primary Language & Core Functionality (What problem it solves)
  3. Verified GitHub Link format (e.g., https://github.com/...)
- Include concise developer highlights and why engineers should check them out!`;
  }

  // Достаем проверенные источники из стадии trend
  const stageResultsCol = getCollection(Collections.STAGE_RESULTS);
  const trendResultDoc = await stageResultsCol.findOne({ runId: job.runId, stage: PipelineStage.TREND });
  const trendItems = (trendResultDoc?.result as any)?.items ?? [];

  const fallbackRealRepos = [
    "https://github.com/sqlfluff/sqlfluff",
    "https://github.com/lyogavin/airllm",
    "https://github.com/shiyu-coder/Kronos",
    "https://github.com/zhaoxuya520/reverse-skill",
    "https://github.com/codecrafters-io/build-your-own-x",
  ];

  const isValidRepoUrl = (u: string) => typeof u === "string" && /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(u.replace(/\/$/, ""));

  const trendItemsList: { title: string; summary: string; url: string }[] = [];
  if (Array.isArray(trendItems)) {
    let fallbackIdx = 0;
    for (const item of trendItems) {
      let sourceUrl = "";
      if (Array.isArray(item.sources) && item.sources.length > 0) {
        sourceUrl = item.sources.find((s: string) => isValidRepoUrl(s)) || item.sources[0] || "";
      }
      if (!sourceUrl && item.url) {
        sourceUrl = item.url;
      }
      let finalGithubUrl = sourceUrl;
      if (!isValidRepoUrl(finalGithubUrl)) {
        finalGithubUrl = fallbackRealRepos[fallbackIdx % fallbackRealRepos.length] || "https://github.com/sqlfluff/sqlfluff";
        fallbackIdx++;
      }
      trendItemsList.push({
        title: item.title,
        summary: item.summary || "",
        url: finalGithubUrl,
      });
    }
  }

  const verifiedGithubUrls = Array.from(new Set(trendItemsList.map(t => t.url).filter(u => u.length > 0)));

  let verifiedSourcesBlock = "";
  if (trendItemsList.length > 0) {
    verifiedSourcesBlock = `\nCRITICAL GITHUB REPOSITORY MATCHING REQUIREMENT:
You MUST feature 3-4 DIFFERENT repositories using the titles and exact URLs below:
${trendItemsList.map((t, idx) => `- Repo #${idx+1}: "${t.title}" -> ${t.url}`).join("\n")}
DO NOT REPEAT THE SAME REPOSITORY OR THE SAME URL MULTIPLE TIMES. EVERY REPOSITORY MUST HAVE A UNIQUE URL.\n`;
  }

  const systemPrompt = `${writerDomain}
Your job is to write an engaging, high-performing post based on the provided topic and content strategy.

Style Guidelines:
1. Tone: ${authorProfile.tone}
2. Hook: Create a very strong first line (Hook) that grabs attention immediately.
3. Readability: Write in short, scanable paragraphs (1-3 sentences maximum). Use bullet points and clean lists. Avoid large blocks/walls of text.
4. Emojis: ${emojiInstruction}
5. Call to Action: ${ctaInstruction}
6. Forbidden Words: Never use these words: ${authorProfile.forbidden_words.join(", ")}
${styleRulesBlock}${complianceBlock}${glossaryBlock}${platformBlock}${rubricWritingInstruction}${verifiedSourcesBlock}${fewShotText}
You must return a single, valid JSON object containing:
- "text": The complete text of the post.
- "hook": The first line (Hook) of the post.
- "cta": The final Call to Action string.

Output format:
{
  "text": "Full text of the post...",
  "hook": "Catchy first line...",
  "cta": "Engaging question at the end..."
}

Return ONLY valid raw JSON. Do NOT include markdown code blocks or conversational text.`;

  const userPrompt = `Here are the inputs for the post:

---
Topic:
Title: "${topic.title}"
Summary: "${topic.summary}"

Strategy:
Format: "${strategy.format || "tutorial"}"
Target Audience: "${strategy.target_audience || "Developers"}"
Core Idea: "${strategy.core_idea || ""}"
---

${job.extraInstructions ? `Additional guidance from Editor: ${job.extraInstructions}` : ""}

Please write the LinkedIn post and return the JSON.`;

  // Для регулируемых ниш (Testo и подобные) снижаем temperature — фактологическая точность
  // важнее творческой вариативности формулировок.
  const isRegulated = isNicheVertical && industryProfile!.complianceConfig.regulatedIndustry;
  const response = await aiClient.complete(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    isRegulated ? { temperature: 0.3 } : {},
  );

  logger.info({ runId: job.runId, provider: response.provider, model: response.model }, "Writing LLM generation complete");

  let parsedJson: any;
  try {
    parsedJson = parseCleanJson(response.text);
  } catch (err) {
    logger.error({ err, rawText: response.text }, "Failed to parse JSON from LLM response");
    throw new Error("LLM response was not valid JSON");
  }

  const sanitized = sanitizeLlmOutput(parsedJson);

  if (verifiedGithubUrls.length > 0) {
    let urlIdx = 0;
    const usedUrls = new Set<string>();
    const githubUrlRegex = /https:\/\/github\.com\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?/g;
    sanitized.text = sanitized.text.replace(githubUrlRegex, (match: string) => {
      if (verifiedGithubUrls.includes(match) && !usedUrls.has(match)) {
        usedUrls.add(match);
        return match;
      }
      let substitute: string = verifiedGithubUrls[urlIdx % verifiedGithubUrls.length] || verifiedGithubUrls[0] || "https://github.com/trending";
      if (usedUrls.has(substitute) && verifiedGithubUrls.length > usedUrls.size) {
        const unused = verifiedGithubUrls.find(u => !usedUrls.has(u));
        if (unused) substitute = unused;
      }
      usedUrls.add(substitute);
      urlIdx++;
      return substitute;
    });
  }

  // Валидируем финальный результат Zod схемой
  const validated = WritingOutputSchema.parse(sanitized);

  // Детерминированная защита от галлюцинированных технических характеристик (см. shared-lib/src/ai/grounding.ts).
  // НЕ полагаемся только на промпт-инструкцию "не выдумывай цифры" — проверяем результат программно.
  if (industryProfile && industryProfile.complianceConfig.factCheckRequired) {
    const factsText = retrievedFacts.map((f) => f.content).join(" ");
    const sourceContext = `${topic.title} ${topic.summary} ${strategy.core_idea ?? ""} ${factsText}`;
    const grounding = checkNumericGrounding(validated.text, sourceContext);
    if (!grounding.ok) {
      logger.warn(
        { runId: job.runId, ungroundedClaims: grounding.ungroundedClaims },
        "Writing output contains numeric claims not found in source context — flagging run for mandatory compliance review",
      );
      await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).updateOne(
        { runId: job.runId },
        { $set: { needsComplianceReview: true, updatedAt: new Date() } },
      );
    }
  }

  logger.info({ runId: job.runId }, "Post text generated successfully");
  return validated;
}

const worker = createWorker<AgentJob>(
  QueueName.WRITING,
  async (job) => {
    const parsed = AgentJobSchema.parse(job.data);
    try {
      const result = await processWritingJob(parsed);
      await eventsQueue.add(
        "event",
        PipelineEventSchema.parse({
          runId: parsed.runId,
          stage: parsed.stage,
          status: "completed",
          result: result as Record<string, unknown>,
        } satisfies PipelineEvent),
      );
    } catch (err) {
      logger.error({ err, runId: parsed.runId }, "writing job failed");
      await eventsQueue.add(
        "event",
        PipelineEventSchema.parse({
          runId: parsed.runId,
          stage: parsed.stage,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        } satisfies PipelineEvent),
      );
    }
  },
  REDIS_URL,
);

worker.on("error", (err) => logger.error({ err }, "worker error"));

const app = express();
app.get("/health", (_req, res) => res.json({ status: "ok", service: "agent-writing" }));

async function start() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("Connected to MongoDB");
  
  app.listen(PORT, () => logger.info({ port: PORT }, "agent-writing listening"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
