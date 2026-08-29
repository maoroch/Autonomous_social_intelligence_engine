import "dotenv/config";
import express from "express";
import { ObjectId } from "mongodb";
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
import { AiClient, retrieveRelevantChunks, type RetrievableChunk } from "@pipeline/shared/ai";
import {
  connectMongo,
  getCollection,
  Collections,
  type PipelineRunDoc,
  type IndustryProfileDoc,
  type FactChunkDoc,
} from "@pipeline/shared/db";

import { DEFAULT_PROFILE } from "./config/constants.js";
import { AdaptationRequestSchema } from "./validators/writing.validator.js";
import { buildWritingPrompts } from "./prompts/prompt-builder.js";
import { loadFewShotExamples } from "./prompts/golden-loader.js";
import {
  extractVerifiedGithubSources,
  buildVerifiedSourcesBlock,
  substituteGithubUrlsInText,
} from "./prompts/source-extractor.js";
import { generatePostContent } from "./generator/llm-writer.js";
import { adaptPostForPlatform } from "./generator/adaptation-service.js";
import { applyDeterministicPostProcessing } from "./post-processing/post-processor.js";
import { injectPresetCta } from "./post-processing/cta-inject.js";
import { verifyNumericGrounding } from "./post-processing/grounding-guard.js";
import { runWritingEvaluationAndSelfCorrection } from "./evaluation/self-correction.js";

const logger = createLogger("agent-writing");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 4004);
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";
const EVALUATOR_URL = process.env.EVALUATOR_URL ?? "http://agent-evaluator:4008";

const aiClient = new AiClient({
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  redisUrl: REDIS_URL,
});

const eventsQueue = createQueue<PipelineEvent>(QueueName.PIPELINE_EVENTS, REDIS_URL);

async function processWritingJob(job: AgentJob): Promise<unknown> {
  logger.info({ runId: job.runId }, "Starting text generation for the LinkedIn post...");

  // 1. Получаем тему и профиль автора из БД
  const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const run = await runsCol.findOne({ runId: job.runId });
  const topic = run?.topic ?? { title: "Rise of AI and Tech", summary: "" };

  const profilesCol = getCollection(Collections.AUTHOR_PROFILES);
  let dbProfile = null;
  if (run?.profileId) {
    try {
      dbProfile = await profilesCol.findOne({ _id: new ObjectId(run.profileId) });
    } catch {
      logger.warn({ runId: job.runId, profileId: run.profileId }, "Failed to find author profile, falling back to default");
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

  // 2. Мультиарендность: Industry Profile
  const tenantId: string = run?.tenantId ?? dbProfile?.tenantId ?? "software-development-default";
  let industryProfile: IndustryProfile | undefined;
  try {
    const doc = await getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES).findOne({ tenantId });
    if (doc) industryProfile = doc;
  } catch (err) {
    logger.warn({ err, tenantId }, "Failed to load IndustryProfile");
  }

  const strategy = job.payload ?? {};
  const contentPillarId = (job.payload as any)?.targetPillarId || (run as any)?.targetPillarId || (strategy as any)?.content_pillar_id || run?.contentPillarId || "";
  const isTestoTenant = tenantId === "testo" || contentPillarId.startsWith("pharma-") || contentPillarId.startsWith("gas-");
  const isGithubShowcase = !isTestoTenant && (contentPillarId === "github-trending-repos" || contentPillarId === "pet-projects-showcase" || (tenantId === "software-development-default" && /github/i.test(topic.title)));

  // 3. Загружаем эталонные примеры (Few-Shot) и RAG факты
  const fewShotText = await loadFewShotExamples(tenantId, contentPillarId, (strategy as any)?.format || "tutorial");

  let retrievedFacts: RetrievableChunk[] = [];
  if (industryProfile?.complianceConfig.factCheckRequired) {
    try {
      const factChunksCol = getCollection<FactChunkDoc>(Collections.FACT_CHUNKS);
      const allChunks = await factChunksCol.find({ tenantId }).toArray();
      const query = `${topic.title} ${topic.summary} ${(strategy as any)?.core_idea ?? ""} ${contentPillarId}`;
      retrievedFacts = retrieveRelevantChunks(query, allChunks, 3);
    } catch (err) {
      logger.warn({ err, tenantId }, "Failed to retrieve fact chunks for RAG grounding");
    }
  }

  // 4. Достаем проверенные ссылки и батчи статей
  const stageResultsCol = getCollection(Collections.STAGE_RESULTS);
  const trendResultDoc = await stageResultsCol.findOne({ runId: job.runId, stage: PipelineStage.TREND });
  const trendItems = (trendResultDoc?.result as any)?.items ?? [];
  const selectedTrend = trendItems[0] || {};

  const effectiveTopic = {
    title: topic.title || selectedTrend.title || "Cinema Lore",
    summary: topic.summary || selectedTrend.summary || "",
    url: (topic as any).url || selectedTrend.url,
    fullArticleText: (topic as any).fullArticleText || selectedTrend.fullArticleText,
    batches: (topic as any).batches || selectedTrend.batches || (job.payload as any)?.batches || [],
  };

  const verifiedSources = extractVerifiedGithubSources(trendItems, isGithubShowcase);
  const verifiedSourcesBlock = buildVerifiedSourcesBlock(verifiedSources);

  // 5. Формируем промпт и генерируем текст через LLM
  const isRegulated = !!industryProfile && industryProfile.complianceConfig.regulatedIndustry;
  const { systemPrompt, userPrompt } = buildWritingPrompts({
    topic: effectiveTopic,
    strategy,
    authorProfile,
    industryProfile,
    tenantId,
    contentPillarId,
    retrievedFacts,
    verifiedSourcesBlock,
    fewShotText,
    extraInstructions: (job.payload as any)?.extraInstructions,
    isGithubShowcase,
  });

  const generated = await generatePostContent(aiClient, systemPrompt, userPrompt, isRegulated, job.runId);

  // 6. Инъекция официального CTA и подстановка URL
  const withCta = injectPresetCta(generated.text, generated.cta, tenantId, contentPillarId);
  generated.text = withCta.text;
  generated.cta = withCta.cta;

  if (isGithubShowcase && verifiedSources.length > 0) {
    generated.text = substituteGithubUrlsInText(generated.text, verifiedSources);
  }

  if ((isTestoTenant || tenantId === "cinema-media") && generated.ru_post && generated.ru_post.text) {
    generated.text = generated.ru_post.text;
    if (generated.ru_post.hook) {
      generated.hook = generated.ru_post.hook;
    }
  }

  // 7. Пост-обработка основного текста (удаление коллизий хэштегов)
  const cleanMain = applyDeterministicPostProcessing(
    generated.text,
    tenantId === "cinema-media" ? "telegram" : "linkedin",
    generated.ru_post?.hashtags || [],
    isTestoTenant,
    tenantId
  );
  generated.text = cleanMain.text;

  // 8. Валидация схемы
  const validated = WritingOutputSchema.parse(generated);

  // 9. Автоматическое сохранение русской адаптации для Telegram & Threads
  if (generated.ru_post && generated.ru_post.text) {
    const cleanRu = applyDeterministicPostProcessing(
      generated.ru_post.text,
      "telegram",
      generated.ru_post.hashtags || [],
      isTestoTenant,
      tenantId
    );
    const adaptationData = {
      text: cleanRu.text,
      hook: generated.ru_post.hook || "",
      hashtags: generated.ru_post.hashtags || [],
      length: "long",
      alignmentScore: 100,
      evaluatedAt: new Date(),
    };
    await runsCol.updateOne(
      { runId: job.runId },
      {
        $set: {
          "adaptations.telegram": adaptationData,
          "adaptations.threads": adaptationData,
          updatedAt: new Date(),
        },
      }
    );
    logger.info({ runId: job.runId }, "Pre-populated Telegram & Threads adaptations from unified ru_post");
  }

  // 9. Детерминированное заземление фактов (RAG Grounding)
  await verifyNumericGrounding(
    job.runId,
    validated.text,
    topic,
    String((strategy as any)?.core_idea ?? ""),
    retrievedFacts,
    industryProfile
  );

  // 10. Детерминированная очистка
  const cleaned = applyDeterministicPostProcessing(validated.text, "linkedin", [], isTestoTenant);
  validated.text = cleaned.text;

  logger.info({ runId: job.runId }, "Post text generated successfully");
  return validated;
}

const worker = createWorker<AgentJob>(
  QueueName.WRITING,
  async (job) => {
    const parsed = AgentJobSchema.parse(job.data);
    try {
      const result = await processWritingJob(parsed);
      const writingResult = result as { text: string; hook?: string; cta?: string };

      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      const runDoc = await runsCol.findOne({ runId: parsed.runId });
      const isTesto =
        runDoc?.tenantId === "testo" ||
        (runDoc as any)?.templateSetId === "industrial-measurement-equipment" ||
        (runDoc as any)?.contentPillarId?.startsWith("pharma-") ||
        (runDoc as any)?.contentPillarId?.startsWith("gas-") ||
        (runDoc as any)?.contentPillarId === "testo-device-breakdown";

      const cleaned = applyDeterministicPostProcessing(writingResult.text, "linkedin", [], isTesto);
      writingResult.text = cleaned.text;

      // ─── Golden Dataset Validation & Self-Correction Feedback Loop ─────────
      const corrected = await runWritingEvaluationAndSelfCorrection(
        aiClient,
        parsed.runId,
        writingResult.text,
        EVALUATOR_URL
      );
      writingResult.text = corrected.text;

      // Сохранение stage_results для WRITING в MongoDB
      const stageResultsCol = getCollection(Collections.STAGE_RESULTS);
      await stageResultsCol.updateOne(
        { runId: parsed.runId, stage: PipelineStage.WRITING },
        {
          $set: {
            runId: parsed.runId,
            stage: PipelineStage.WRITING,
            attempt: parsed.attempt ?? 1,
            result: writingResult,
            status: "completed",
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );

      await eventsQueue.add(
        "event",
        PipelineEventSchema.parse({
          runId: parsed.runId,
          stage: parsed.stage,
          status: "completed",
          result: writingResult as Record<string, unknown>,
        } satisfies PipelineEvent)
      );
    } catch (err) {
      logger.error({ err, runId: parsed.runId }, "Writing job failed");
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
app.get("/health", (_req, res) => res.json({ status: "ok", service: "agent-writing" }));

app.post("/adapt", async (req, res) => {
  try {
    const params = AdaptationRequestSchema.parse(req.body);
    const adapted = await adaptPostForPlatform(aiClient, params);
    return res.json(adapted);
  } catch (err: any) {
    logger.error({ err }, "Adaptation failed");
    return res.status(500).json({ error: err.message || "Failed to adapt text" });
  }
});

async function start() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("Connected to MongoDB");

  app.listen(PORT, () => logger.info({ port: PORT }, "agent-writing listening"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
