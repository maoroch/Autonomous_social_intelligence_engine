import "dotenv/config";
import { createWorker, createQueue } from "@pipeline/shared/queue";
import { createLogger } from "@pipeline/shared/logger";
import { connectMongo, getCollection, Collections, type PipelineRunDoc, type OrganizationDoc, type IndustryProfileDoc, getDb } from "@pipeline/shared/db";
import { QueueName, PipelineStage, type AgentJob, PipelineRunStatus } from "@pipeline/shared";
import type { AuthorProfile, PublishingPlatform } from "@pipeline/shared/schemas";
import { GridFSBucket, ObjectId } from "mongodb";
import AdmZip from "adm-zip";
import { LinkedInPublisher } from "./publishers/linkedin.js";
import { InstagramPublisher } from "./publishers/instagram.js";
import { TelegramPublisher } from "./publishers/telegram.js";
import type { PlatformPublisher, PublishCredentials } from "./publishers/types.js";

const logger = createLogger("agent-publishing");

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";
// Публичный домен, на котором openclaw раздаёт GridFS-изображения через GET /images/:id.
// ОБЯЗАТЕЛЕН для Instagram Graph API (требует реального публичного image_url, не localhost).
const OPENCLAW_PUBLIC_BASE_URL = process.env.OPENCLAW_PUBLIC_BASE_URL ?? "";

async function main() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("connected to MongoDB");

  const eventsQueue = createQueue(QueueName.PIPELINE_EVENTS, REDIS_URL);
  const db = getDb();
  const carouselBucket = new GridFSBucket(db, { bucketName: "carousel_images" });

  /** Загружает PNG-слайд в GridFS и возвращает публичный URL для Instagram Graph API. */
  async function uploadSlideAndGetPublicUrl(buffer: Buffer, filename: string): Promise<string> {
    if (!OPENCLAW_PUBLIC_BASE_URL) {
      throw new Error(
        "OPENCLAW_PUBLIC_BASE_URL is not configured — required to host images publicly for Instagram Graph API",
      );
    }
    const uploadStream = carouselBucket.openUploadStream(filename, { contentType: "image/png" });
    await new Promise<void>((resolve, reject) => {
      uploadStream.end(buffer, (err?: Error | null) => (err ? reject(err) : resolve()));
    });
    const fileId = uploadStream.id as ObjectId;
    return `${OPENCLAW_PUBLIC_BASE_URL.replace(/\/$/, "")}/images/${fileId.toHexString()}`;
  }

  const publishers: Partial<Record<PublishingPlatform, PlatformPublisher>> = {
    linkedin: new LinkedInPublisher(),
    instagram: new InstagramPublisher(uploadSlideAndGetPublicUrl),
    telegram: new TelegramPublisher(),
  };

  /**
   * Определяет платформу и креды публикации для данного прогона.
   * Приоритет: PipelineRun.tenantId -> Organization.publishingTargets[0] -> AuthorProfile.connectedPlatforms.
   * Если tenant не сконфигурирован (tech-портал по умолчанию, ещё без миграции) — используется
   * старое поведение через глобальные LINKEDIN_ACCESS_TOKEN/LINKEDIN_OWNER_URN (обратная совместимость).
   */
  async function resolvePublishTarget(
    run: PipelineRunDoc | null,
  ): Promise<{ platform: PublishingPlatform; credentials: PublishCredentials }> {
    const tenantId = run?.tenantId;

    if (tenantId) {
      const org = await getCollection<OrganizationDoc>(Collections.ORGANIZATIONS).findOne({ tenantId });
      const platform: PublishingPlatform = run?.targetPlatform ?? org?.publishingTargets?.[0] ?? "linkedin";

      const profilesCol = getCollection<AuthorProfile & { _id?: ObjectId }>(Collections.AUTHOR_PROFILES);
      const profile = run?.profileId
        ? await profilesCol.findOne({ _id: new ObjectId(run.profileId) })
        : await profilesCol.findOne({ tenantId });

      const connected = profile?.connectedPlatforms?.find((p) => p.platform === platform);
      if (connected) {
        return { platform, credentials: { accessToken: connected.accessToken, accountId: connected.accountId } };
      }

      logger.warn(
        { tenantId, platform },
        "No connectedPlatforms credentials found for tenant — falling back to legacy env vars (only works for LinkedIn)",
      );
    }

    // Legacy fallback: поведение как в исходном index.ts, до внедрения мультиарендности.
    return {
      platform: "linkedin",
      credentials: {
        accessToken: process.env.LINKEDIN_ACCESS_TOKEN ?? "",
        accountId: process.env.LINKEDIN_OWNER_URN,
      },
    };
  }

  const worker = createWorker<AgentJob>(
    QueueName.PUBLISHING,
    async (job) => {
      logger.info({ jobId: job.id, runId: job.data.runId }, "started publishing job");

      const { runId, payload } = job.data;
      const { text, imageId } = payload as { text: string; imageId: string };

      const existingRun = await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).findOne({ runId });
      if (existingRun?.status === PipelineRunStatus.PUBLISHED) {
        logger.warn({ runId }, "Run is already published. Skipping duplicate publication for idempotency.");
        await eventsQueue.add("event", {
          runId,
          stage: PipelineStage.PUBLISHING,
          status: "completed",
          result: { url: `already-published`, platform: existingRun.targetPlatform ?? "linkedin" },
        });
        return;
      }

      try {
        if (!imageId) {
          throw new Error("No imageId (ZIP file) provided for publishing");
        }

        logger.info({ runId, imageId }, "Downloading ZIP from GridFS...");
        const zipId = new ObjectId(imageId);

        const chunks: Buffer[] = [];
        const downloadStream = carouselBucket.openDownloadStream(zipId);

        await new Promise<void>((resolve, reject) => {
          downloadStream.on("data", (chunk) => chunks.push(chunk));
          downloadStream.on("end", () => resolve());
          downloadStream.on("error", (err) => reject(err));
        });
        const zipBuffer = Buffer.concat(chunks);

        const zip = new AdmZip(zipBuffer);
        const zipEntries = zip.getEntries();

        const pngEntries = zipEntries
          .filter((entry) => entry.entryName.endsWith(".png"))
          .sort((a, b) => a.entryName.localeCompare(b.entryName));

        logger.info({ runId, count: pngEntries.length }, "Extracted PNG slides from ZIP archive");

        const slides = pngEntries.map((entry) => ({ entryName: entry.entryName, buffer: entry.getData() }));

        const run = await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).findOne({ runId });
        const { platform, credentials } = await resolvePublishTarget(run);

        const hasCredentials = !!credentials.accessToken;

        let publishUrl: string;
        if (hasCredentials) {
          logger.info({ runId, platform }, `Publishing carousel to ${platform}...`);
          const publisher = publishers[platform];
          if (!publisher) {
            throw new Error(`Direct automated publisher for '${platform}' is not configured. Use manual copy/paste adaptation.`);
          }
          const result = await publisher.publish({ runId, text, slides, credentials });
          publishUrl = result.url;
        } else {
          logger.warn({ runId, platform }, "No credentials found. Falling back to MOCK publishing.");
          await new Promise((resolve) => setTimeout(resolve, 2000));
          publishUrl = `https://${platform}.com/mock-post/${runId}`;
          logger.info({ runId, publishUrl }, `Successfully simulated publishing to ${platform}!`);
        }

        await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).updateOne(
          { runId },
          { $set: { status: PipelineRunStatus.PUBLISHED, updatedAt: new Date() } },
        );

        await eventsQueue.add("event", {
          runId,
          stage: PipelineStage.PUBLISHING,
          status: "completed",
          result: { url: publishUrl, platform },
        });
      } catch (error) {
        logger.error({ err: error, runId }, "failed to publish");

        await eventsQueue.add("event", {
          runId,
          stage: PipelineStage.PUBLISHING,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    REDIS_URL,
  );

  worker.on("error", (err) => logger.error({ err }, "worker error"));

  logger.info("publishing agent is running and listening for jobs...");
}

main().catch((err) => {
  logger.error({ err }, "fatal error during startup");
  process.exit(1);
});
