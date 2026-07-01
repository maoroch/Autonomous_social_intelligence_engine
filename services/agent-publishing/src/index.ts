import "dotenv/config";
import { createWorker, createQueue } from "@pipeline/shared/queue";
import { createLogger } from "@pipeline/shared/logger";
import { connectMongo, getCollection, Collections, type PipelineRunDoc } from "@pipeline/shared/db";
import { QueueName, PipelineStage, type AgentJob, PipelineRunStatus } from "@pipeline/shared";

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

      try {
        // Mock publishing to LinkedIn
        logger.info({ runId, payload }, "Publishing post to LinkedIn...");

        // Wait a bit to mock network request
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const publishUrl = `https://linkedin.com/mock-post/${runId}`;
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
