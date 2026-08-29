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
  PositioningOutputSchema,
  type TrendItem,
  type IndustryProfile,
} from "@pipeline/shared/schemas";
import { AiClient } from "@pipeline/shared/ai";
import { connectMongo, getCollection, Collections, type PipelineRunDoc, type IndustryProfileDoc } from "@pipeline/shared/db";
import { ObjectId } from "mongodb";
import { isTestoForbiddenDomain } from "./competency.js";

const logger = createLogger("agent-positioning");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 4002);
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
  use_emoji: true,
  tone: "expert",
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
  return JSON.parse(cleaned.trim());
}

async function processPositioningJob(job: AgentJob): Promise<unknown> {
  logger.info({ runId: job.runId }, "Evaluating topic positioning against author profile...");

  const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const run = await runsCol.findOne({ runId: job.runId });

  // 1. Получаем профиль автора из БД по tenantId или profileId
  const targetTenantId = run?.tenantId || (job.payload as any)?.tenantId || "software-development-default";
  const profilesCol = getCollection(Collections.AUTHOR_PROFILES);
  const indProfilesCol = getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES);

  let dbProfile = null;
  if (run?.profileId) {
    try {
      dbProfile = await profilesCol.findOne({ _id: new ObjectId(run.profileId) });
    } catch(err) {
      logger.warn({ runId: job.runId, profileId: run.profileId }, "Failed to find specified profile");
    }
  }
  if (!dbProfile) {
    dbProfile = await profilesCol.findOne({ tenantId: targetTenantId });
  }
  if (!dbProfile) {
    dbProfile = await profilesCol.findOne({});
  }

  const indProfile = await indProfilesCol.findOne({ tenantId: targetTenantId });
  const indTopics = indProfile?.contentPillars?.map(p => p.label || p.id) ?? [];

  const authorProfile = dbProfile 
    ? {
        topics: Array.isArray(dbProfile.topics) && dbProfile.topics.length > 0 ? dbProfile.topics : (indTopics.length > 0 ? indTopics : DEFAULT_PROFILE.topics),
        forbidden_words: Array.isArray(dbProfile.forbidden_words) ? dbProfile.forbidden_words : DEFAULT_PROFILE.forbidden_words,
        cta_style: typeof dbProfile.cta_style === "string" ? dbProfile.cta_style : undefined,
        use_emoji: typeof dbProfile.use_emoji === "boolean" ? dbProfile.use_emoji : DEFAULT_PROFILE.use_emoji,
        tone: typeof dbProfile.tone === "string" ? dbProfile.tone : DEFAULT_PROFILE.tone,
      }
    : {
        ...DEFAULT_PROFILE,
        topics: indTopics.length > 0 ? indTopics : DEFAULT_PROFILE.topics,
      };

  // 2. Получаем темы для анализа
  let trends: TrendItem[] = [];
  if (job.payload && Array.isArray(job.payload.items)) {
    trends = job.payload.items as TrendItem[];
  }

  // Если из предыдущего шага не пришел список тем (например, ручной запуск),
  // пробуем достать тему из самого PipelineRun
  if (trends.length === 0) {
    if (run?.topic && run.topic.title) {
      trends = [
        {
          title: run.topic.title,
          summary: run.topic.summary || "",
          score: 100,
          keywords: [],
          sources: [],
        },
      ];
    }
  }

  if (trends.length === 0) {
    logger.warn({ runId: job.runId }, "No topics found to evaluate positioning");
    return {
      relevance: 0,
      reason: "No topics found to evaluate positioning",
      accepted: false,
    };
  }

  // Мультиарендность: определяем tenantId и подгружаем IndustryProfile для динамической формулировки промпта.
  const tenantId: string = run?.tenantId ?? (dbProfile as any)?.tenantId ?? "software-development-default";
  let industryProfile: IndustryProfile | undefined;
  try {
    const doc = await getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES).findOne({ tenantId });
    if (doc) industryProfile = doc;
  } catch (err) {
    logger.warn({ err, tenantId }, "Failed to load IndustryProfile — proceeding with default tech-portal positioning");
  }
  const isNicheVertical = !!industryProfile && industryProfile.verticalName !== "software-development";
  const positioningDomain = isNicheVertical
    ? `You are a positioning assistant for a B2B content portal in the "${industryProfile!.verticalName}" industry.`
    : "You are a positioning assistant for a software engineer's professional blog.";

  let fewShotText = "";
  try {
    const targetPillarId = (job.payload as any)?.targetPillarId || (run as any)?.targetPillarId || "";
    const col = getCollection(Collections.GOLDEN_POSITIONING);
    const filter = targetPillarId
      ? { $or: [{ pillarId: targetPillarId }, { pillarId: "all" }, { pillarId: { $exists: false } }] }
      : {};
    let examples = await col.find(filter).limit(2).toArray();
    if (examples.length === 0) {
      examples = await col.find({}).limit(2).toArray();
    }
    if (examples.length > 0) {
      fewShotText = `\nSTYLE EXAMPLES (FEW-SHOT EXAMPLES):
Here are examples of how to evaluate topic positioning against an author profile:
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
    logger.warn({ err }, "Failed to fetch golden positioning examples");
  }

  // 3. Формируем запрос к LLM для отбора лучшей темы
  let tenantPositioningRules = "";
  if (tenantId === "testo") {
    tenantPositioningRules = `
CRITICAL TESTO COMPANY COMPETENCY & PORTFOLIO RULES:
- Testo is exclusively a manufacturer and distributor of PRECISION MEASURING INSTRUMENTS (flue gas analyzers Testo 300/350, leak detectors Testo 316, pharma loggers Testo Saveris/190/174T, thermal imagers, thermometers, hygrometers).
- STRICTLY FORBIDDEN DOMAINS (MUST REJECT WITH RELEVANCE 0):
  * Personal Protective Equipment (PPE / СИЗ): Arc-flash suits, dielectric gloves, helmets, protective apparel under NFPA 70E or OSHA 1910. Testo DOES NOT manufacture protective clothing or electrical PPE!
  * Power transformers, circuit breakers, electrical cabling.
  * Finished chemical pharmaceuticals.
- If a topic is centered on electrical PPE (NFPA 70E arc flash), you MUST set "relevance": 0 and "accepted": false! Never force-fit PPE into measurement equipment.`;
  }

  const systemPrompt = `${positioningDomain}
Your task is to analyze a list of trends/topics and match them against the author's profile and company competencies.
Author Profile:
- Allowed Topics of Interest: ${JSON.stringify(authorProfile.topics)}
- Forbidden Topics/Words: ${JSON.stringify(authorProfile.forbidden_words)}
${tenantPositioningRules}

Evaluation Rules:
1. Any topic that falls under forbidden topics or outside company competencies must be rejected with relevance 0.
2. Evaluate how relevant the topics are to the author's allowed topics and business domain.
3. Choose the SINGLE most relevant topic from the list that legitimately fits the company's products.
4. Calculate a relevance score (0 to 100) for this chosen topic. If the relevance is 70 or higher, set "accepted" to true. Otherwise, set it to false.
${fewShotText}
You must return a single, valid JSON object containing:
- "relevance": relevance score (0-100) of the selected topic.
- "reason": detailed explanation of why this topic was selected or rejected.
- "accepted": boolean (true if relevance >= 70, false otherwise).
- "selected_index": the 0-based index of the selected topic from the input list.

Output format:
{
  "relevance": 95,
  "reason": "This topic is highly relevant because...",
  "accepted": true,
  "selected_index": 2
}

Return ONLY raw valid JSON. Do NOT include markdown blocks or conversational text.`;

  const trendsText = trends
    .map((t, idx) => `[Topic #${idx}] Title: "${t.title}"\nSummary: "${t.summary}"\nKeywords: ${JSON.stringify(t.keywords)}`)
    .join("\n\n");

  const userPrompt = `Evaluate the following list of topics against the author's positioning profile and pick the single best one:

${trendsText}

${job.extraInstructions ? `Additional guidance: ${job.extraInstructions}` : ""}`;

  const response = await aiClient.complete([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  logger.info({ runId: job.runId, provider: response.provider, model: response.model }, "Positioning LLM evaluation complete");

  let parsedJson: any;
  try {
    parsedJson = parseCleanJson(response.text);
  } catch (err) {
    logger.error({ err, rawText: response.text }, "Failed to parse JSON from LLM response");
    throw new Error("LLM response was not valid JSON");
  }

  let relevance = typeof parsedJson.relevance === "number" ? parsedJson.relevance : 85;
  if (relevance < 0) relevance = 0;
  if (relevance > 100) relevance = 100;
  const reason = typeof parsedJson.reason === "string" ? parsedJson.reason : "No reason provided";
  
  const selectedIndex = typeof parsedJson.selected_index === "number" ? parsedJson.selected_index : 0;
  const selectedTopic = trends[selectedIndex] || trends[0];

  const isForbidden = tenantId === "testo" && selectedTopic && isTestoForbiddenDomain(selectedTopic.title, selectedTopic.summary || "");

  let accepted = typeof parsedJson.accepted === "boolean" ? parsedJson.accepted : false;
  if (isForbidden) {
    logger.warn({ runId: job.runId, title: selectedTopic?.title }, "Topic rejected: Testo does not produce PPE / NFPA 70E gear");
    accepted = false;
    relevance = 0;
  } else if (relevance >= 70) {
    accepted = true;
  } else {
    accepted = false;
  }

  // 4. Если тема одобрена, обновляем запись PipelineRun в БД выбранной темой
  if (accepted && selectedTopic) {
    await runsCol.updateOne(
      { runId: job.runId },
      {
        $set: {
          topic: {
            title: selectedTopic.title,
            summary: selectedTopic.summary,
          },
          updatedAt: new Date(),
        },
      },
    );
    logger.info({ runId: job.runId, topicTitle: selectedTopic.title }, "Updated PipelineRun with the selected relevant topic");
  }

  const result = {
    relevance,
    reason,
    accepted,
  };

  // Валидируем результат Zod-схемой перед отправкой
  const validated = PositioningOutputSchema.parse(result);
  
  logger.info({ runId: job.runId, accepted: validated.accepted, relevance: validated.relevance }, "Positioning evaluation successfully completed");
  return validated;
}

const worker = createWorker<AgentJob>(
  QueueName.POSITIONING,
  async (job) => {
    const parsed = AgentJobSchema.parse(job.data);
    try {
      const result = await processPositioningJob(parsed);
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
      logger.error({ err, runId: parsed.runId }, "positioning job failed");
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
app.get("/health", (_req, res) => res.json({ status: "ok", service: "agent-positioning" }));

async function start() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("Connected to MongoDB");
  
  app.listen(PORT, () => logger.info({ port: PORT }, "agent-positioning listening"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
