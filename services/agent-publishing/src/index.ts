import "dotenv/config";
import { createWorker, createQueue } from "@pipeline/shared/queue";
import { createLogger } from "@pipeline/shared/logger";
import { connectMongo, getCollection, Collections, type PipelineRunDoc, getDb } from "@pipeline/shared/db";
import { QueueName, PipelineStage, type AgentJob, PipelineRunStatus } from "@pipeline/shared";
import { GridFSBucket, ObjectId } from "mongodb";
import AdmZip from "adm-zip";

const logger = createLogger("agent-publishing");

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

async function main() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("connected to MongoDB");

  const eventsQueue = createQueue(QueueName.PIPELINE_EVENTS, REDIS_URL);

  const worker = createWorker<AgentJob>(
    QueueName.PUBLISHING,
    async (job) => {
      logger.info({ jobId: job.id, runId: job.data.runId }, "started publishing job");

      const { runId, payload } = job.data;
      const { text, imageId } = payload as { text: string; imageId: string };

      try {
        if (!imageId) {
          throw new Error("No imageId (ZIP file) provided for publishing");
        }

        logger.info({ runId, imageId }, "Downloading ZIP from GridFS...");
        const db = getDb();
        const bucket = new GridFSBucket(db, { bucketName: "carousel_images" });
        const zipId = new ObjectId(imageId);

        const chunks: Buffer[] = [];
        const downloadStream = bucket.openDownloadStream(zipId);
        
        await new Promise<void>((resolve, reject) => {
          downloadStream.on("data", (chunk) => chunks.push(chunk));
          downloadStream.on("end", () => resolve());
          downloadStream.on("error", (err) => reject(err));
        });
        const zipBuffer = Buffer.concat(chunks);

        const zip = new AdmZip(zipBuffer);
        const zipEntries = zip.getEntries();

        const pngEntries = zipEntries
          .filter(entry => entry.entryName.endsWith(".png"))
          .sort((a, b) => a.entryName.localeCompare(b.entryName));

        logger.info({ runId, count: pngEntries.length }, `Extracted PNG slides from ZIP archive`);

        const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
        let ownerUrn = process.env.LINKEDIN_OWNER_URN;

        if (accessToken && (!ownerUrn || ownerUrn.includes("ВАШ_ID"))) {
          logger.info({ runId }, "LINKEDIN_OWNER_URN not provided. Attempting to fetch automatically from LinkedIn OpenID /v2/userinfo...");
          try {
            const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });
            if (meRes.ok) {
              const meData = (await meRes.json()) as any;
              if (meData.sub) {
                ownerUrn = `urn:li:person:${meData.sub}`;
                logger.info({ runId, ownerUrn }, "Successfully fetched owner URN automatically");
              } else {
                logger.warn({ runId }, "LinkedIn /v2/userinfo response did not contain sub");
              }
            } else {
              const errText = await meRes.text();
              logger.warn({ runId, status: meRes.status, errText }, "Failed to fetch LinkedIn profile ID");
            }
          } catch (err) {
            logger.error({ err, runId }, "Error requesting LinkedIn profile URN");
          }
        }

        if (accessToken && ownerUrn) {
          logger.info({ runId, ownerUrn }, "LinkedIn API credentials verified. Publishing real PNG carousel to LinkedIn...");

          const imageUrns: string[] = [];

          for (const entry of pngEntries) {
            const pngBuffer = entry.getData();
            logger.info({ runId, entryName: entry.entryName }, `Registering upload for slide image...`);

            // Step 1: Register upload (Versioned Images API)
            const registerRes = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "LinkedIn-Version": "202602",
                "X-Restli-Protocol-Version": "2.0.0",
              },
              body: JSON.stringify({
                initializeUploadRequest: {
                  owner: ownerUrn,
                },
              }),
            });

            if (!registerRes.ok) {
              const errText = await registerRes.text();
              throw new Error(`Failed to register LinkedIn upload: ${registerRes.status} ${errText}`);
            }

            const registerData = (await registerRes.json()) as any;
            const uploadUrl = registerData.value.uploadUrl;
            const assetUrn = registerData.value.image;

            // Step 2: Upload image binary via PUT
            logger.info({ runId, entryName: entry.entryName }, `Uploading image binary to LinkedIn...`);
            const uploadRes = await fetch(uploadUrl, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "image/png",
              },
              body: pngBuffer,
            });

            if (!uploadRes.ok) {
              const errText = await uploadRes.text();
              throw new Error(`Failed to upload image to LinkedIn: ${uploadRes.status} ${errText}`);
            }

            imageUrns.push(assetUrn);
          }

          // Step 3: Create Post (Versioned Posts API)
          logger.info({ runId, imageCount: imageUrns.length }, "Creating final LinkedIn publication...");

          const postRes = await fetch("https://api.linkedin.com/rest/posts", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "LinkedIn-Version": "202602",
              "X-Restli-Protocol-Version": "2.0.0",
            },
            body: JSON.stringify({
              author: ownerUrn,
              commentary: text,
              visibility: "PUBLIC",
              distribution: {
                feedDistribution: "MAIN_FEED",
                targetEntities: [],
                thirdPartyDistributionChannels: [],
              },
              content: {
                multiImage: {
                  images: imageUrns.map((urn) => ({ id: urn })),
                },
              },
              lifecycleState: "PUBLISHED",
            }),
          });

          if (!postRes.ok) {
            const errText = await postRes.text();
            throw new Error(`Failed to create LinkedIn post: ${postRes.status} ${errText}`);
          }

          const postUrn = postRes.headers.get("x-restli-id") || (await postRes.json() as any)?.id || "unknown";
          const publishUrl = `https://www.linkedin.com/feed/update/${postUrn}`;
          
          logger.info({ runId, publishUrl }, "Successfully published to LinkedIn!");

          // Update run status to PUBLISHED
          await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).updateOne(
            { runId },
            { $set: { status: PipelineRunStatus.PUBLISHED, updatedAt: new Date() } }
          );

          // Send success event
          await eventsQueue.add("event", {
            runId,
            stage: PipelineStage.PUBLISHING,
            status: "completed",
            result: { url: publishUrl },
          });

        } else {
          logger.warn({ runId }, "LINKEDIN_ACCESS_TOKEN or LINKEDIN_OWNER_URN not found. Falling back to MOCK publishing.");

          // Wait a bit to mock network request
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const publishUrl = `https://linkedin.com/mock-post/${runId}`;
          logger.info({ runId, publishUrl }, "Successfully simulated publishing to LinkedIn!");

          // Update run status to PUBLISHED
          await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).updateOne(
            { runId },
            { $set: { status: PipelineRunStatus.PUBLISHED, updatedAt: new Date() } }
          );

          // Send success event
          await eventsQueue.add("event", {
            runId,
            stage: PipelineStage.PUBLISHING,
            status: "completed",
            result: { url: publishUrl },
          });
        }
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
    REDIS_URL
  );

  worker.on("error", (err) => logger.error({ err }, "worker error"));

  logger.info("publishing agent is running and listening for jobs...");
}

main().catch((err) => {
  logger.error({ err }, "fatal error during startup");
  process.exit(1);
});
