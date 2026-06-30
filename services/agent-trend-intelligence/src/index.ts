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
  TrendAgentOutputSchema,
} from "@pipeline/shared/schemas";
import { AiClient } from "@pipeline/shared/ai";
import { aggregateRawTrends, formatTrendsForLLM } from "./aggregator.js";

const logger = createLogger("agent-trend-intelligence");

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 4001);

const openrouterApiKey = process.env.OPENROUTER_API_KEY ?? "";
const groqApiKey = process.env.GROQ_API_KEY ?? "";

if (!openrouterApiKey && !groqApiKey) {
  logger.warn("Both OPENROUTER_API_KEY and GROQ_API_KEY are missing. LLM calls will fail.");
}

const aiClient = new AiClient({
  openrouterApiKey,
  groqApiKey,
  redisUrl: REDIS_URL,
});

// Очередь, в которую этот агент публикует результат своей работы для Open Claw.
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

function sanitizeLlmOutput(rawObj: any): any {
  if (!rawObj || typeof rawObj !== "object") {
    throw new Error("LLM did not return an object");
  }

  const items = Array.isArray(rawObj.items) ? rawObj.items : [];
  const sanitizedItems = items.map((item: any) => {
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
    };
  });

  return { items: sanitizedItems };
}

async function processTrendJob(job: AgentJob): Promise<unknown> {
  logger.info({ runId: job.runId }, "Starting trend aggregation from sources...");

  const rawTrends = await aggregateRawTrends();
  const rawTrendsText = formatTrendsForLLM(rawTrends);

  const limit = typeof job.payload?.topics_limit === "number" ? job.payload.topics_limit : 5;

  logger.info({ runId: job.runId, limit, rawCount: rawTrends.length }, "Sending raw trends to LLM...");

  const systemPrompt = `You are a professional technology trend spotter. You analyze raw developer discussions, trending repositories, and articles to identify the most significant IT/programming/software trends of the day.
Your output must be a single, valid JSON object containing an "items" array of trend objects.
Each trend object must contain:
1. "title": Catchy, descriptive title of the trend.
2. "summary": Detailed explanation of what the trend is, why it's popular, and key insights.
3. "score": An integer from 0 to 100 indicating popularity/urgency.
4. "keywords": Array of 3-5 tags.
5. "sources": Array of relevant source URLs from the inputs (use the EXACT URLs provided in the input, do not hallucinate URLs).

Output format:
{
  "items": [
    {
      "title": "Trend Title",
      "summary": "Trend summary...",
      "score": 90,
      "keywords": ["tag1", "tag2"],
      "sources": ["https://url1"]
    }
  ]
}

Return ONLY valid raw JSON. Do NOT include conversational text, comments, or markdown code blocks.`;

  const userPrompt = `Here are the raw trend items collected from Hacker News, GitHub, Dev.to, and Reddit:

${rawTrendsText}

${job.extraInstructions ? `Additional instructions from Orchestrator: ${job.extraInstructions}\n` : ""}
Analyze these raw inputs and identify up to ${limit} most important and coherent technology trends. Ensure every trend includes the source URLs that contributed to it.`;

  const response = await aiClient.complete([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  logger.info({ runId: job.runId, provider: response.provider, model: response.model }, "LLM response received");

  let parsedJson: any;
  try {
    parsedJson = parseCleanJson(response.text);
  } catch (err) {
    logger.error({ err, rawText: response.text }, "Failed to parse JSON from LLM response");
    throw new Error("LLM response was not valid JSON");
  }

  const sanitized = sanitizeLlmOutput(parsedJson);

  // Валидируем финальный результат Zod схемой
  const validated = TrendAgentOutputSchema.parse(sanitized);

  logger.info({ runId: job.runId, trendsCount: validated.items.length }, "Trend intelligence job processed successfully");
  return validated;
}

const worker = createWorker<AgentJob>(
  QueueName.TREND,
  async (job) => {
    const parsed = AgentJobSchema.parse(job.data);
    try {
      const result = await processTrendJob(parsed);
      const event: PipelineEvent = {
        runId: parsed.runId,
        stage: parsed.stage,
        status: "completed",
        result: result as Record<string, unknown>,
      };
      await eventsQueue.add("event", PipelineEventSchema.parse(event));
    } catch (err) {
      logger.error({ err, runId: parsed.runId }, "trend job failed");
      const event: PipelineEvent = {
        runId: parsed.runId,
        stage: parsed.stage,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
      await eventsQueue.add("event", PipelineEventSchema.parse(event));
    }
  },
  REDIS_URL,
);

worker.on("error", (err) => logger.error({ err }, "worker error"));

const app = express();
app.get("/health", (_req, res) => res.json({ status: "ok", service: "agent-trend-intelligence" }));
app.listen(PORT, () => logger.info({ port: PORT }, "agent-trend-intelligence listening"));
