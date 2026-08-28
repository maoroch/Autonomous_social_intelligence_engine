import "dotenv/config";
import express from "express";
import { createQueue, createWorker } from "@pipeline/shared/queue";
import { createLogger } from "@pipeline/shared/logger";
import { connectMongo, getDb } from "@pipeline/shared/db";
import { GridFSBucket, ObjectId } from "mongodb";
import { QueueName, PipelineStage, type AgentJob, PipelineEventSchema, type PipelineEvent } from "@pipeline/shared";
import {
  startPipelineRun,
  handleAgentCompleted,
  handleAgentFailed,
  type AgentQueues,
} from "./pipeline/runner.js";
import { createApprovalRouter } from "./validators/approval.js";
import { illustrationsRouter } from "./validators/illustrations.js";

const logger = createLogger("openclaw");

const PORT = Number(process.env.PORT ?? 4000);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

async function main() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("connected to MongoDB");

  const queues: AgentQueues = {
    [PipelineStage.TREND]: createQueue<AgentJob>(QueueName.TREND, REDIS_URL),
    [PipelineStage.POSITIONING]: createQueue<AgentJob>(QueueName.POSITIONING, REDIS_URL),
    [PipelineStage.STRATEGY]: createQueue<AgentJob>(QueueName.STRATEGY, REDIS_URL),
    [PipelineStage.WRITING]: createQueue<AgentJob>(QueueName.WRITING, REDIS_URL),
    [PipelineStage.DESIGN]: createQueue<AgentJob>(QueueName.DESIGN, REDIS_URL),
    [PipelineStage.SEO]: createQueue<AgentJob>(QueueName.SEO, REDIS_URL),
  };

  // Worker, реально потребляющий джобы из очереди событий, которые публикуют агенты
  // по завершении работы (успех/ошибка). Раньше тут стоял только QueueEvents-листенер,
  // который слушает pub/sub-уведомления, но НЕ продвигает джобы из wait -> active -> completed —
  // это делает исключительно Worker.process(). Без воркера события так и оставались в wait
  // и пайплайн зависал после первой стадии.
  const eventsWorker = createWorker<PipelineEvent>(
    QueueName.PIPELINE_EVENTS,
    async (job) => {
      const parsed = PipelineEventSchema.safeParse(job.data);
      if (!parsed.success) {
        logger.error({ jobId: job.id, error: parsed.error }, "invalid pipeline event payload");
        return;
      }

      const event = parsed.data;
      const stage = event.stage as PipelineStage;

      if (event.status === "completed") {
        await handleAgentCompleted(queues, logger, event.runId, stage, event.result ?? {});

        // Уведомление микросервиса telegram-bot через очередь событий
        if (stage === PipelineStage.SEO || stage === PipelineStage.DESIGN) {
          const telegramNotifierQueue = createQueue<PipelineEvent>("queue-telegram-approval-notifier", REDIS_URL);
          await telegramNotifierQueue.add("approval-notify", event);
        }
      } else {
        await handleAgentFailed(queues, logger, event.runId, stage, event.error ?? "unknown error");
      }
    },
    REDIS_URL,
    1, // обрабатываем события последовательно, чтобы избежать гонок по одному runId
  );

  eventsWorker.on("error", (err) => logger.error({ err }, "events worker error"));

  // Автоматический планировщик: запуск пайплайна каждые 5 часов
  const schedulerQueue = createQueue("queue-scheduler", REDIS_URL);
  
  try {
    const repeatableJobs = await schedulerQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await schedulerQueue.removeRepeatableByKey(job.key);
    }
  } catch (err) {
    logger.warn({ err }, "Failed to clear previous repeatable jobs");
  }

  const intervalMs = 5 * 60 * 60 * 1000;
  await schedulerQueue.add(
    "trigger-pipeline",
    {},
    {
      repeat: {
        every: intervalMs,
      },
    }
  );
  logger.info({ intervalMs }, "Initialized 5-hour repeatable pipeline scheduler");

  const schedulerWorker = createWorker(
    "queue-scheduler",
    async (job) => {
      logger.info("Scheduler triggered automatically (every 5 hours). Starting a new pipeline run...");
      try {
        const runId = await startPipelineRun(queues, logger, { title: "", summary: "" });
        logger.info({ runId }, "Pipeline run started successfully by scheduler");
      } catch (err) {
        logger.error({ err }, "Failed to start pipeline run from scheduler");
      }
    },
    REDIS_URL,
    1
  );

  schedulerWorker.on("error", (err) => logger.error({ err }, "scheduler worker error"));

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "openclaw" }));

  app.get("/images/:id", async (req, res) => {
    try {
      const db = getDb();
      const bucket = new GridFSBucket(db, { bucketName: "carousel_images" });
      const id = new ObjectId(req.params.id);

      const file = await db.collection("carousel_images.files").findOne({ _id: id });
      const downloadStream = bucket.openDownloadStream(id);

      downloadStream.on('error', (error) => {
        logger.error({ err: error, id: req.params.id }, "Error downloading image");
        res.status(404).send("Image not found");
      });

      res.set('Content-Type', file?.contentType || 'image/png');
      downloadStream.pipe(res);
    } catch (err) {
      res.status(400).send("Invalid image ID");
    }
  });

  // Ручной запуск прогона пайплайна (на следующем шаге заменится на Scheduler).
  app.post("/runs", async (req, res) => {
    const topic = req.body?.topic ?? { title: "", summary: "" };
    const profileId = req.body?.profileId;
    const tenantId = req.body?.tenantId;
    const targetPillarId = req.body?.targetPillarId;
    const runId = await startPipelineRun(queues, logger, topic, profileId, tenantId, targetPillarId);
    res.status(201).json({ runId });
  });

  app.use("/approval", createApprovalRouter(logger));
  app.use("/illustrations", illustrationsRouter());

  app.listen(PORT, () => logger.info({ port: PORT }, "openclaw listening"));
}

main().catch((err) => {
  logger.error({ err }, "fatal error during startup");
  process.exit(1);
});
