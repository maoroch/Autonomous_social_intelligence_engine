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
  WritingOutputSchema,
} from "@pipeline/shared/schemas";
import { AiClient } from "@pipeline/shared/ai";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";

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

  // 3. Получаем стратегию из payload
  const strategy = job.payload ?? {};

  // 4. Формируем промпт к LLM
  const systemPrompt = `You are a professional LinkedIn content writer specializing in tech/programming topics.
Your job is to write an engaging, high-performing LinkedIn post based on the provided topic and content strategy.

Style Guidelines:
1. Tone: ${authorProfile.tone}
2. Hook: Create a very strong first line (Hook) that grabs attention immediately.
3. Readability: Write in short, scanable paragraphs (1-3 sentences maximum). Use bullet points and clean lists. Avoid large blocks/walls of text.
4. Emojis: ${authorProfile.use_emoji ? "Use relevant emojis sparingly to make the text lively." : "Do NOT use emojis."}
5. Call to Action: ${authorProfile.cta_style}
6. Forbidden Words: Never use these words: ${authorProfile.forbidden_words.join(", ")}

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

  const response = await aiClient.complete([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  logger.info({ runId: job.runId, provider: response.provider, model: response.model }, "Writing LLM generation complete");

  let parsedJson: any;
  try {
    parsedJson = parseCleanJson(response.text);
  } catch (err) {
    logger.error({ err, rawText: response.text }, "Failed to parse JSON from LLM response");
    throw new Error("LLM response was not valid JSON");
  }

  const sanitized = sanitizeLlmOutput(parsedJson);

  // Валидируем финальный результат Zod схемой
  const validated = WritingOutputSchema.parse(sanitized);

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
