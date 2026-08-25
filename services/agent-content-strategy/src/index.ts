import "dotenv/config";
import express from "express";
import { createWorker, createQueue } from "@pipeline/shared/queue";
import { createLogger } from "@pipeline/shared/logger";
import { QueueName } from "@pipeline/shared";
import {
  AgentJobSchema,
  type AgentJob,
  PipelineEventSchema,
  type PipelineEvent,
  StrategyOutputSchema,
  type IndustryProfile,
  type ContentPillar,
} from "@pipeline/shared/schemas";
import { AiClient } from "@pipeline/shared/ai";
import { connectMongo, getCollection, Collections, type PipelineRunDoc, type IndustryProfileDoc } from "@pipeline/shared/db";
import { ObjectId } from "mongodb";

const logger = createLogger("agent-content-strategy");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 4003);
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

const openrouterApiKey = process.env.OPENROUTER_API_KEY ?? "";
const geminiApiKey = process.env.GEMINI_API_KEY ?? "";
const groqApiKey = process.env.GROQ_API_KEY ?? "";

const aiClient = new AiClient({
  geminiApiKey,
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

  // Экранируем символы переводов строк внутри строковых литералов
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

  const format = typeof rawObj.format === "string" ? rawObj.format.trim() : "lessons_learned";
  const target_audience = typeof rawObj.target_audience === "string" ? rawObj.target_audience.trim() : "Software Engineers";
  const core_idea = typeof rawObj.core_idea === "string" ? rawObj.core_idea.trim() : "Overview of the topic";

  return {
    format,
    target_audience,
    core_idea,
  };
}

/**
 * Выбирает рубрику (content pillar) с учётом weight и активных seasonalTrigger.
 * MVP-реализация: сезонные рубрики получают х2 к весу (упрощение вместо календарной логики
 * с точными датами — это можно уточнить в будущей фазе, привязав seasonalTrigger к реальным датам).
 * (см. TZ_v3_instagram_testo_portal.md, раздел 1.8)
 */
function pickContentPillar(pillars: ContentPillar[]): ContentPillar | undefined {
  if (pillars.length === 0) return undefined;

  const weighted = pillars.map((p) => ({ pillar: p, effectiveWeight: p.seasonalTrigger ? p.weight * 2 : p.weight }));
  const totalWeight = weighted.reduce((sum, w) => sum + w.effectiveWeight, 0);
  if (totalWeight <= 0) return pillars[0];

  let roll = Math.random() * totalWeight;
  for (const w of weighted) {
    roll -= w.effectiveWeight;
    if (roll <= 0) return w.pillar;
  }
  return pillars[pillars.length - 1];
}

async function processStrategyJob(job: AgentJob): Promise<unknown> {
  logger.info({ runId: job.runId }, "Starting content strategy planning...");

  // 1. Получаем выбранную тему из БД
  const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const run = await runsCol.findOne({ runId: job.runId });
  const topic = run?.topic ?? { title: "Rise of AI and Tech", summary: "" };

  // 2. Получаем профиль автора из БД
  const profilesCol = getCollection<any>(Collections.AUTHOR_PROFILES);
  let dbProfile = null;
  if (run?.profileId) {
    try {
      dbProfile = await profilesCol.findOne({ _id: new ObjectId(run.profileId) });
    } catch (err) {
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
    logger.warn({ err, tenantId }, "Failed to load IndustryProfile — proceeding without vertical-specific strategy context");
  }

  const isNicheVertical = !!industryProfile && industryProfile.verticalName !== "software-development";
  const targetPillarId = (job.payload as any)?.targetPillarId || (job as any)?.targetPillarId;

  let selectedPillar: ContentPillar | undefined;
  if (targetPillarId && industryProfile?.contentPillars) {
    selectedPillar = industryProfile.contentPillars.find(p => p.id === targetPillarId);
  }
  if (!selectedPillar && industryProfile?.contentPillars?.length) {
    selectedPillar = pickContentPillar(industryProfile.contentPillars);
  }

  const platform: string = isNicheVertical ? industryProfile!.platformAdaptation[0]?.platform ?? "instagram" : "linkedin";

  let fewShotText = "";
  try {
    const col = getCollection(Collections.GOLDEN_STRATEGY);
    const filter = targetPillarId
      ? { tenantId, pillarId: targetPillarId }
      : { tenantId };
    let examples = await col.find(filter).limit(2).toArray();
    if (examples.length > 0) {
      fewShotText = `\nSTYLE EXAMPLES (FEW-SHOT EXAMPLES):
Here are examples of how to design a content strategy based on a topic and author profile:
${examples.map((ex: any, i) => `
--- Example ${i+1} ---
Input Topic:
${JSON.stringify(ex.input.topic, null, 2)}

Input Author Profile:
${JSON.stringify(ex.input.authorProfile, null, 2)}

Expected Output:
${JSON.stringify(ex.expected_output, null, 2)}
----------------------`).join("\n")}
`;
    }
  } catch (err) {
    logger.warn({ err }, "Failed to fetch golden strategy examples");
  }

  const audiencePersonasBlock =
    isNicheVertical && industryProfile!.audiencePersonas.length > 0
      ? `\nAvailable Audience Personas for this industry (choose the target_audience from/around one of these, do not invent unrelated personas):
${industryProfile!.audiencePersonas.map((p) => `- ${p.label}: ${p.description}. Pain points: ${p.painPoints.join(", ") || "n/a"}`).join("\n")}\n`
      : "";

  const pillarBlock = selectedPillar
    ? `\nREQUIRED CONTENT PILLAR (this post MUST follow this rubric): "${selectedPillar.label}" — ${selectedPillar.description}. Preferred content format for this pillar: "${selectedPillar.preferredFormat}".\n`
    : "";

  const verticalLabel = industryProfile?.verticalName ?? "software-development";
  const strategistDomain = isNicheVertical
    ? `You are a content strategist specializing in B2B content marketing for the "${verticalLabel}" industry, publishing on ${platform}.`
    : "You are a content strategist specializing in tech content marketing for LinkedIn.";

  // 3. Формируем промпт к LLM
  const systemPrompt = `${strategistDomain}
Your task is to analyze a topic and design a content strategy for a ${platform} post.

You must match the topic with the author's profile and choose:
1. Target Audience: Define the specific target group (e.g. "Senior React developers looking to learn advanced pattern compositions").
2. Format: You MUST choose EXACTLY one of these formats:
   - "lessons_learned"
   - "case_study"
   - "tutorial"
   - "comparison"
   - "mistakes"
   - "thread"
   - "personal_experience"
3. Core Idea: A clear statement of the unique angle/value proposition of this post (e.g. "Why container queries solve 80% of responsive UI bugs where media queries fail").

Author Profile Context:
- Tone of Voice: ${authorProfile.tone}
- Main Topics of Expertise: ${JSON.stringify(authorProfile.topics)}
${audiencePersonasBlock}${pillarBlock}${fewShotText}
Output must be a single, valid JSON object:
{
  "format": "lessons_learned",
  "target_audience": "...",
  "core_idea": "..."
}

Return ONLY valid raw JSON. Do NOT include markdown code blocks or conversational text.`;

  const userPrompt = `Here is the topic details to create a strategy for:

---
Topic Title: "${topic.title}"
Topic Summary: "${topic.summary}"
---

${job.extraInstructions ? `Additional instructions: ${job.extraInstructions}` : ""}

Please generate the content strategy in JSON format.`;

  const response = await aiClient.complete([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], { preferredProvider: "gemini" });

  logger.info({ runId: job.runId, provider: response.provider, model: response.model }, "Content Strategy LLM planning complete");

  let parsedJson: any;
  try {
    parsedJson = parseCleanJson(response.text);
  } catch (err) {
    logger.error({ err, rawText: response.text }, "Failed to parse JSON from LLM response");
    throw new Error("LLM response was not valid JSON");
  }

  const sanitized = sanitizeLlmOutput(parsedJson);
  if (selectedPillar) {
    sanitized.content_pillar_id = selectedPillar.id;
  }

  // Валидируем финальный результат Zod схемой
  const validated = StrategyOutputSchema.parse(sanitized);

  // Прокидываем выбранные платформу/формат/рубрику в PipelineRun для agent-design/agent-publishing.
  if (selectedPillar || isNicheVertical) {
    await runsCol.updateOne(
      { runId: job.runId },
      {
        $set: {
          targetPlatform: platform as any,
          contentFormat: selectedPillar?.preferredFormat,
          contentPillarId: selectedPillar?.id,
          updatedAt: new Date(),
        },
      },
    );
  }

  logger.info({ runId: job.runId, format: validated.format, pillar: selectedPillar?.id }, "Content strategy generated successfully");
  return validated;
}

const worker = createWorker<AgentJob>(
  QueueName.STRATEGY,
  async (job) => {
    const parsed = AgentJobSchema.parse(job.data);
    try {
      const result = await processStrategyJob(parsed);
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
      logger.error({ err, runId: parsed.runId }, "strategy job failed");
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
app.get("/health", (_req, res) => res.json({ status: "ok", service: "agent-content-strategy" }));

async function start() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("Connected to MongoDB");

  app.listen(PORT, () => logger.info({ port: PORT }, "agent-content-strategy listening"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
