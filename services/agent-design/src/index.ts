import "dotenv/config";
import express from "express";
import { createWorker, createQueue } from "@pipeline/shared/queue";
import { createLogger } from "@pipeline/shared/logger";
import { QueueName } from "@pipeline/shared";
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
async function processDesignJob(job: AgentJob): Promise<void> {
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
  const tenantId = runDoc?.tenantId ?? "software-development-default";

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

  const topicTitle = trendResult?.selected_topic?.title ?? "Overview";
  const topicSummary = trendResult?.selected_topic?.summary ?? "";
  const fallbackCoverDesc =
    strategyResult?.core_idea || writingResult?.hook || topicSummary || "";

  // 1. Получаем список стилей через TemplateRegistry
  const styleConfigs = templateRegistry.resolveStylesForTenant(tenantId, industryProfile);

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
    slideDeck = await generateSlideDeckWithLLM(aiClient, {
      topicTitle,
      topicSummary,
      writingHook: writingResult?.hook,
      writingBody: writingResult?.body,
      writingCta: writingResult?.call_to_action,
      strategyAngle: strategyResult?.angle,
      strategyCoreIdea: strategyResult?.core_idea,
      tenantId,
      industryProfile,
      styleConfigs,
    });
  }

  // 4. Подготовка логотипа организации
  let logoHtml: string | undefined;
  if (tenantId === "testo") {
    logoHtml = `<img src="https://azia-test.com/wp-content/uploads/2025/02/logo.svg" alt="Testo" style="height: 52px; max-height: 52px; width: auto; display: block; object-fit: contain;" />`;
  }

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

  // 7. Оповещение OpenClaw через очередь событий
  await eventsQueue.add("pipeline-event", {
    runId,
    stage: "design",
    status: "completed",
    result: finalDesignResult,
  });
}

/**
 * Запуск микросервиса agent-design
 */
async function start(): Promise<void> {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    logger.info("Connected to MongoDB");

    // Express Health & Templates API
    const app = express();
    app.use(express.json());

    app.get("/health", (_req, res) => {
      res.json({ status: "ok", service: "agent-design" });
    });

    app.get("/templates", (_req, res) => {
      res.json({ templates: templateRegistry.getAllTemplates() });
    });

    app.listen(PORT, () => {
      logger.info({ port: PORT }, "agent-design listening");
    });

    // BullMQ Worker
    createWorker<AgentJob>(
      QueueName.DESIGN,
      async (job) => {
        const agentJob = AgentJobSchema.parse(job.data);
        await processDesignJob(agentJob);
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
