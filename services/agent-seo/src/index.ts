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
  SeoOutputSchema,
} from "@pipeline/shared/schemas";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";
import { AiClient } from "@pipeline/shared/ai";

const logger = createLogger("agent-seo");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 4006);
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

const openrouterApiKey = process.env.OPENROUTER_API_KEY ?? "";
const groqApiKey = process.env.GROQ_API_KEY ?? "";

const aiClient = new AiClient({
  openrouterApiKey,
  groqApiKey,
  redisUrl: REDIS_URL,
});

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

  let score = typeof rawObj.score === "number" ? rawObj.score : 80;
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  const recommendations = Array.isArray(rawObj.recommendations)
    ? rawObj.recommendations.filter((rec: any) => typeof rec === "string").map((rec: string) => rec.trim())
    : [];

  return {
    score,
    recommendations,
  };
}

async function processSeoJob(job: AgentJob): Promise<unknown> {
  logger.info({ runId: job.runId }, "Starting SEO audit on post...");

  // Достаем результаты шага WRITING из базы данных
  const stageResultsCol = getCollection(Collections.STAGE_RESULTS);
  const writingResultDoc = await stageResultsCol.findOne({ runId: job.runId, stage: "writing" });
  const writingResult = writingResultDoc?.result as Record<string, unknown> | undefined;

  const text = typeof writingResult?.text === "string" ? writingResult.text : "";
  const hook = typeof writingResult?.hook === "string" ? writingResult.hook : "";
  const cta = typeof writingResult?.cta === "string" ? writingResult.cta : "";

  if (!text) {
    logger.warn({ runId: job.runId }, "Post text is empty for SEO audit");
  }

  let fewShotText = "";
  try {
    const targetPillarId = (job.payload as any)?.targetPillarId || (job.payload as any)?.contentPillarId || "";
    const col = getCollection(Collections.GOLDEN_SEO);
    const filter = targetPillarId
      ? { $or: [{ pillarId: targetPillarId }, { pillarId: "all" }, { pillarId: { $exists: false } }] }
      : {};
    let examples = await col.find(filter).limit(2).toArray();
    if (examples.length === 0) {
      examples = await col.find({}).limit(2).toArray();
    }
    if (examples.length > 0) {
      fewShotText = `\nSTYLE EXAMPLES (FEW-SHOT EXAMPLES):
Here are examples of how to audit a post and suggest specific, actionable recommendations:
${examples.map((ex: any, i) => `
--- Example ${i+1} ---
Input Post:
${JSON.stringify(ex.input.post, null, 2)}

Expected Output:
${JSON.stringify(ex.expected_output, null, 2)}
----------------------`).join("\n")}
`;
    }
  } catch (err) {
    logger.warn({ err }, "Failed to fetch golden SEO examples");
  }

  const systemPrompt = `You are a LinkedIn SEO and content optimization expert.
Your job is to audit a drafted LinkedIn post and provide a rating (score) and a list of specific, actionable recommendations.
Analyze the following aspects:
1. Hook: Is the first line engaging? Does it make the reader want to click "see more"?
2. Readability: Is the post easy to scan? Does it use short paragraphs and clear formatting?
3. Keywords & HashTags: Are relevant keywords present? Should hashtags be added?
4. CTA (Call to Action): Is there a clear, engaging call to action or question at the end?
5. Formatting & Length: Does it fit LinkedIn's style (avoiding walls of text)?
${fewShotText}
You must return a single, valid JSON object containing:
- "score": A rating from 0 to 100 based on the quality and engagement potential of the post.
- "recommendations": An array of strings, each containing a specific improvement. If the post is excellent, this list can be empty.

Output format:
{
  "score": 85,
  "recommendations": [
    "Shorten the hook to under 80 characters.",
    "Add empty lines between paragraphs to improve readability."
  ]
}

Return ONLY valid raw JSON. Do NOT include conversational text, comments, or markdown code blocks.`;

  const userPrompt = `Here is the draft LinkedIn post to analyze:

---
Hook:
${hook || "No hook separate field"}

CTA:
${cta || "No CTA separate field"}

Full Text:
${text}
---

${job.extraInstructions ? `Additional guidance: ${job.extraInstructions}` : ""}

Please perform the audit and return the JSON.`;

  const response = await aiClient.complete([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  logger.info({ runId: job.runId, provider: response.provider, model: response.model }, "SEO LLM audit completed");

  let parsedJson: any;
  try {
    parsedJson = parseCleanJson(response.text);
  } catch (err) {
    logger.error({ err, rawText: response.text }, "Failed to parse JSON from LLM response");
    throw new Error("LLM response was not valid JSON");
  }

  const sanitized = sanitizeLlmOutput(parsedJson);

  // Валидируем финальный результат Zod схемой
  const validated = SeoOutputSchema.parse(sanitized);

  logger.info({ runId: job.runId, score: validated.score, recsCount: validated.recommendations.length }, "SEO audit successfully completed");
  return validated;
}

const worker = createWorker<AgentJob>(
  QueueName.SEO,
  async (job) => {
    const parsed = AgentJobSchema.parse(job.data);
    try {
      const result = await processSeoJob(parsed);
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
      logger.error({ err, runId: parsed.runId }, "seo job failed");
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
app.get("/health", (_req, res) => res.json({ status: "ok", service: "agent-seo" }));

async function start() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("Connected to MongoDB");

  app.listen(PORT, () => logger.info({ port: PORT }, "agent-seo listening"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
