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
  type IndustryProfile,
} from "@pipeline/shared/schemas";
import { AiClient } from "@pipeline/shared/ai";
import { connectMongo, getCollection, Collections, type PipelineRunDoc, type IndustryProfileDoc } from "@pipeline/shared/db";
import { ObjectId } from "mongodb";

import { fetchTrendsForTenant } from "./sources/source-factory.js";
import { deduplicateRawTrends } from "./analyzer/trend-deduplicator.js";
import { analyzeTrendsWithLLM } from "./analyzer/trend-llm-analyzer.js";

const logger = createLogger("agent-trend-intelligence");

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 4001);
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

const openrouterApiKey = process.env.OPENROUTER_API_KEY ?? "";
const groqApiKey = process.env.GROQ_API_KEY ?? "";
const geminiApiKey = process.env.GEMINI_API_KEY ?? "";

const aiClient = new AiClient({
  geminiApiKey,
  openrouterApiKey,
  groqApiKey,
  redisUrl: REDIS_URL,
});

const eventsQueue = createQueue<PipelineEvent>(QueueName.PIPELINE_EVENTS, REDIS_URL);

async function processTrendJob(job: AgentJob): Promise<unknown> {
  logger.info({ runId: job.runId }, "Starting trend intelligence aggregation and analysis...");

  // 1. Resolve tenant and IndustryProfile from PipelineRun or DB
  const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const run = await runsCol.findOne({ runId: job.runId });

  let tenantId = run?.tenantId ?? "software-development-default";
  let industryProfile: IndustryProfile | undefined;

  try {
    const doc = await getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES).findOne({ tenantId });
    if (doc) industryProfile = doc;
  } catch (err) {
    logger.warn({ err, tenantId }, "Failed to load IndustryProfile for trend agent");
  }

  // 2. Fetch raw trends via Source Factory (Den of Geek for cinema, Adapters for Tech/Testo, Telegram @github for GitHub pillars)
  const targetPillar = run?.targetPillarId || run?.contentPillarId || (job.payload as any)?.targetPillarId;
  const rawTrends = await fetchTrendsForTenant(tenantId, industryProfile, targetPillar);

  if (rawTrends.length === 0) {
    logger.warn({ runId: job.runId, tenantId }, "No raw trends fetched from any source — returning empty list");
    return { items: [] };
  }

  // 3. Deduplicate
  const deduplicated = deduplicateRawTrends(rawTrends);
  logger.info({ runId: job.runId, tenantId, rawCount: rawTrends.length, uniqueCount: deduplicated.length }, "Raw trends collected and deduplicated");

  // 4. LLM Analysis & Scoring
  const analyzed = await analyzeTrendsWithLLM(aiClient, deduplicated, tenantId, industryProfile, targetPillar);

  // 5. Schema validation
  const validated = TrendAgentOutputSchema.parse(analyzed);
  logger.info({ runId: job.runId, tenantId, itemCount: validated.items.length }, "Trend intelligence processing complete");

  return validated;
}

const worker = createWorker<AgentJob>(
  QueueName.TREND,
  async (job) => {
    const parsed = AgentJobSchema.parse(job.data);
    try {
      const result = await processTrendJob(parsed);
      await eventsQueue.add(
        "event",
        PipelineEventSchema.parse({
          runId: parsed.runId,
          stage: parsed.stage,
          status: "completed",
          result: result as Record<string, unknown>,
        } satisfies PipelineEvent)
      );
    } catch (err) {
      logger.error({ err, runId: parsed.runId }, "Trend intelligence job failed");
      await eventsQueue.add(
        "event",
        PipelineEventSchema.parse({
          runId: parsed.runId,
          stage: parsed.stage,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        } satisfies PipelineEvent)
      );
    }
  },
  REDIS_URL
);

worker.on("error", (err) => logger.error({ err }, "worker error"));

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "agent-trend-intelligence" }));

async function start() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("Connected to MongoDB");

  app.listen(PORT, () => logger.info({ port: PORT }, "agent-trend-intelligence listening"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
