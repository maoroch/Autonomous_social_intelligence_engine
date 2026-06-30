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
} from "@pipeline/shared/schemas";
import { AiClient } from "@pipeline/shared/ai";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";

const logger = createLogger("agent-content-strategy");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 4003);
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

async function processStrategyJob(job: AgentJob): Promise<unknown> {
  logger.info({ runId: job.runId }, "Starting content strategy planning...");

  // 1. Получаем выбранную тему из БД
  const runsCol = getCollection(Collections.PIPELINE_RUNS);
  const run = await runsCol.findOne({ runId: job.runId });
  const topic = run?.topic ?? { title: "Rise of AI and Tech", summary: "" };

  // 2. Получаем профиль автора из БД
  const profilesCol = getCollection(Collections.AUTHOR_PROFILES);
  const dbProfile = await profilesCol.findOne({});
  const authorProfile = dbProfile 
    ? {
        topics: Array.isArray(dbProfile.topics) ? dbProfile.topics : DEFAULT_PROFILE.topics,
        forbidden_words: Array.isArray(dbProfile.forbidden_words) ? dbProfile.forbidden_words : DEFAULT_PROFILE.forbidden_words,
        cta_style: typeof dbProfile.cta_style === "string" ? dbProfile.cta_style : DEFAULT_PROFILE.cta_style,
        use_emoji: typeof dbProfile.use_emoji === "boolean" ? dbProfile.use_emoji : DEFAULT_PROFILE.use_emoji,
        tone: typeof dbProfile.tone === "string" ? dbProfile.tone : DEFAULT_PROFILE.tone,
      }
    : DEFAULT_PROFILE;

  // 3. Формируем промпт к LLM
  const systemPrompt = `You are a content strategist specializing in tech content marketing for LinkedIn.
Your task is to analyze a topic and design a content strategy for a LinkedIn post.

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
  ]);

  logger.info({ runId: job.runId, provider: response.provider, model: response.model }, "Content Strategy LLM planning complete");

  let parsedJson: any;
  try {
    parsedJson = parseCleanJson(response.text);
  } catch (err) {
    logger.error({ err, rawText: response.text }, "Failed to parse JSON from LLM response");
    throw new Error("LLM response was not valid JSON");
  }

  const sanitized = sanitizeLlmOutput(parsedJson);

  // Валидируем финальный результат Zod схемой
  const validated = StrategyOutputSchema.parse(sanitized);

  logger.info({ runId: job.runId, format: validated.format }, "Content strategy generated successfully");
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
