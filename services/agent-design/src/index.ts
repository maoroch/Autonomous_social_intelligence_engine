import "dotenv/config";
import express from "express";
import { createWorker, createQueue } from "@pipeline/shared/queue";
import { createLogger } from "@pipeline/shared/logger";
import { QueueName, PipelineStage } from "@pipeline/shared";
import {
  AgentJobSchema,
  type AgentJob,
  type PipelineEvent,
  type IndustryProfile,
} from "@pipeline/shared/schemas";
import { AiClient } from "@pipeline/shared/ai";
import {
  connectMongo,
  getCollection,
  Collections,
  getDb,
  type PipelineRunDoc,
} from "@pipeline/shared/db";
import { GridFSBucket } from "mongodb";

import { templateRegistry } from "./registry/template-registry.js";
import { renderCarouselDeck } from "./render/deck-renderer.js";
import { generateSlideDeckWithLLM } from "./generator/llm-generator.js";
import { closeSharedBrowser } from "./render/browser-pool.js";
import { loadIllustrationsFromDb } from "./assets/illustration-loader.js";
import { DesignJobPayloadSchema } from "./validators/job-payload.validator.js";
import type { SlideDeck, SlideItem } from "./validators/slide-deck.validator.js";

const logger = createLogger("agent-design");

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 4005);
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

/**
 * Обработка задачи генерации/рендеринга карусели
 */
async function processDesignJob(job: AgentJob, notifyQueue = true): Promise<Record<string, any>> {
  const { runId, payload } = job;
  logger.info({ runId }, "Starting carousel slide deck design...");

  const parsedPayload = DesignJobPayloadSchema.parse(payload || {});
  const { isInlineEdit, template_name: requestedTemplateName, customSlides } = parsedPayload;

  const db = getDb();
  const bucket = new GridFSBucket(db, { bucketName: "carousel_images" });

  const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const stageResultsCol = getCollection(Collections.STAGE_RESULTS);
  const industryProfilesCol = getCollection(Collections.INDUSTRY_PROFILES);

  const runDoc = await runsCol.findOne({ runId });
  const tenantId = (payload as any)?.tenantId || runDoc?.tenantId || "software-development-default";

  const industryProfileDoc = await industryProfilesCol.findOne({ tenantId });
  const industryProfile = (industryProfileDoc as any)?.profile as IndustryProfile | undefined;

  // Извлекаем предыдущие стадии
  const [trendDoc, strategyDoc, writingDoc, existingDesignDoc] = await Promise.all([
    stageResultsCol.findOne({ runId, stage: "trend" }),
    stageResultsCol.findOne({ runId, stage: "strategy" }),
    stageResultsCol.findOne({ runId, stage: "writing" }),
    stageResultsCol.findOne({ runId, stage: "design" }),
  ]);

  const trendResult = trendDoc?.result as any;
  const strategyResult = strategyDoc?.result as any;
  const writingResult = writingDoc?.result as any;
  const existingDesignResult = existingDesignDoc?.result as any;
  const topicTitle = runDoc?.topic?.title || trendResult?.selected_topic?.title || (trendResult?.items && trendResult.items[0]?.title) || "Overview";
  const topicSummary = runDoc?.topic?.summary || trendResult?.selected_topic?.summary || (trendResult?.items && trendResult.items[0]?.summary) || "";
  const fallbackCoverDesc =
    writingResult?.hook || strategyResult?.core_idea || topicSummary || "";

  // 1. Получаем список стилей через TemplateRegistry
  const styleConfigs = templateRegistry.resolveStylesForTenant(tenantId, industryProfile);
  await loadIllustrationsFromDb();

  let slideDeck: SlideDeck;

  // 2. Inline Edit режим: обход LLM для мгновенного рендера
  if (isInlineEdit && (customSlides || existingDesignResult?.card_deck)) {
    logger.info({ runId, isInlineEdit, requestedTemplateName }, "Inline edit: Bypassing LLM generation completely.");
    const baseSlides = (customSlides || existingDesignResult.card_deck.slides) as SlideItem[];
    slideDeck = {
      template_name: requestedTemplateName || existingDesignResult?.card_deck?.template_name || styleConfigs[0]?.key,
      hook: existingDesignResult?.card_deck?.hook || writingResult?.hook || "",
      cta: existingDesignResult?.card_deck?.cta || writingResult?.call_to_action || "",
      slides: baseSlides,
    };
  } else {
    // 3. Первичная генерация текстового состава слайдов через LLM
    const strategyPillarId =
      (strategyResult as any)?.pillar ||
      (strategyResult as any)?.content_pillar_id ||
      (payload as any)?.targetPillarId ||
      runDoc?.contentPillarId ||
      "";

    slideDeck = await generateSlideDeckWithLLM(aiClient, {
      topicTitle,
      topicSummary,
      writingHook: writingResult?.hook,
      writingBody: writingResult?.text || writingResult?.body,
      writingCta: writingResult?.cta || writingResult?.call_to_action,
      strategyAngle: strategyResult?.angle,
      strategyCoreIdea: strategyResult?.core_idea || writingResult?.hook || topicSummary,
      strategyPillarId,
      tenantId,
      industryProfile,
      styleConfigs,
    });
  }

  // 4. Подготовка логотипа организации
  const isTestoTenant =
    tenantId === "testo" ||
    styleConfigs.some((s) => s.key.startsWith("testo-") || s.key === "industrial-measurement-equipment");
  const logoHtml = isTestoTenant
    ? `<img src="https://azia-test.com/wp-content/uploads/2025/02/logo.svg" alt="Azia Test" style="height: 52px; max-height: 52px; width: auto; display: block; object-fit: contain;" />`
    : undefined;

  // 5. Рендеринг всех подходящих шаблонов через DeckRenderer
  const renderedStyles: Record<string, any> = existingDesignResult?.rendered_styles
    ? { ...existingDesignResult.rendered_styles }
    : {};

  let primaryZipId = "";
  let primaryCoverId = "";
  let primaryImages: string[] = [];

  for (const style of styleConfigs) {
    if (requestedTemplateName && style.key !== requestedTemplateName && renderedStyles[style.key]) {
      continue;
    }

    try {
      const output = await renderCarouselDeck(
        slideDeck.slides,
        style,
        bucket,
        runId,
        fallbackCoverDesc,
        logoHtml
      );

      renderedStyles[style.key] = {
        zipId: output.zipId,
        coverImageId: output.coverId,
        imageIds: output.imageIds,
        templateName: style.name || style.key,
      };

      if (!primaryZipId || style.key === (requestedTemplateName || slideDeck.template_name)) {
        primaryZipId = output.zipId;
        primaryCoverId = output.coverId;
        primaryImages = output.imageIds;
      }
    } catch (err) {
      logger.error({ err, styleKey: style.key }, "Failed rendering style in carousel deck");
    }
  }

  const renderData: Record<string, any> = {};
  slideDeck.slides.forEach((s, idx) => {
    renderData[`slide_${idx + 1}`] = {
      title: s.title,
      badge: s.badge || (idx === 0 ? styleConfigs[0]?.defaultCoverBadge : styleConfigs[0]?.defaultCardBadge),
      bullets: s.bullets,
      illustration: s.illustration || s.illustration_name || "none",
      footer: s.footer || "",
    };
  });

  const finalDesignResult = {
    card_deck: slideDeck,
    render_data: renderData,
    rendered_styles: renderedStyles,
    template_name: requestedTemplateName || slideDeck.template_name || styleConfigs[0]?.key,
    card_count: slideDeck.slides.length,
    zipId: primaryZipId,
    coverImageId: primaryCoverId,
    imageIds: primaryImages,
    hook: slideDeck.hook || writingResult?.hook || "",
    cta: slideDeck.cta || writingResult?.call_to_action || "",
    format: "carousel",
    aspect_ratio: "4:5",
  };

  // 6. Сохранение результатов в MongoDB
  await stageResultsCol.updateOne(
    { runId, stage: "design" },
    {
      $set: {
        runId,
        stage: "design",
        result: finalDesignResult,
        status: "completed",
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  logger.info({ runId, cardCount: slideDeck.slides.length }, "Carousel design completed successfully.");

  if (notifyQueue) {
    // 7. Оповещение OpenClaw через очередь событий
    await eventsQueue.add("pipeline-event", {
      runId,
      stage: "design",
      status: "completed",
      result: finalDesignResult,
    });
  }

  return finalDesignResult;
}

/**
 * Запуск микросервиса agent-design
 */
async function start(): Promise<void> {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    logger.info("Connected to MongoDB");
    await loadIllustrationsFromDb();

    // Express Health, Templates & Direct Synchronous Inline Render API
    const app = express();
    app.use(express.json());

    app.get("/health", (_req, res) => {
      res.json({ status: "ok", service: "agent-design" });
    });

    app.get("/templates", (_req, res) => {
      res.json({ templates: templateRegistry.getAllTemplates() });
    });

    // Mutex promise queue per runId to guarantee strict sequential execution
    const runRenderLocks = new Map<string, Promise<any>>();

    app.post("/render-inline", async (req, res) => {
      const { runId, template_name, customSlides, tenantId } = req.body;
      const job: AgentJob = {
        runId,
        stage: PipelineStage.DESIGN,
        attempt: 1,
        payload: {
          isInlineEdit: true,
          template_name,
          customSlides,
          tenantId,
        },
      };

      const previousPromise = runRenderLocks.get(runId) || Promise.resolve();
      const currentPromise = (async () => {
        try {
          await previousPromise.catch(() => {});
        } catch {}
        return await processDesignJob(job, false);
      })();

      runRenderLocks.set(runId, currentPromise);

      try {
        const result = await currentPromise;
        if (runRenderLocks.get(runId) === currentPromise) {
          runRenderLocks.delete(runId);
        }
        res.json({ ok: true, result });
      } catch (err: any) {
        if (runRenderLocks.get(runId) === currentPromise) {
          runRenderLocks.delete(runId);
        }
        logger.error({ err, runId }, "Failed sequential inline design render");
        res.status(500).json({ ok: false, error: err?.message || "Internal error" });
      }
    });

    app.listen(PORT, () => {
      logger.info({ port: PORT }, "agent-design listening");
    });

    // BullMQ Worker
    createWorker<AgentJob>(
      QueueName.DESIGN,
      async (job) => {
        const agentJob = AgentJobSchema.parse(job.data);
        await processDesignJob(agentJob, true);
      },
      REDIS_URL,
      1
    );
  } catch (err) {
    logger.error({ err }, "Fatal error during agent-design startup");
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  await closeSharedBrowser();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await closeSharedBrowser();
  process.exit(0);
});

start();
