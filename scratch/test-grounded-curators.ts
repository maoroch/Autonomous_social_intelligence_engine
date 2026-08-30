import { connectMongo, getCollection, Collections, type PipelineRunDoc, disconnectMongo } from "@pipeline/shared/db";
import { TechCuratorService } from "../services/telegram-bot/src/services/tech-curator.js";
import { TestoCuratorService } from "../services/telegram-bot/src/services/testo-curator.js";

async function main() {
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27018";
  const dbName = process.env.MONGO_DB_NAME || "linkedin_pipeline";

  await connectMongo(mongoUri, dbName);
  console.log("Connected to MongoDB for Curator Test Verification");

  const techCurator = new TechCuratorService();
  const testoCurator = new TestoCuratorService();

  const techArticles = techCurator.getFallbackArticles("popular");
  const testoArticles = testoCurator.getFallbackArticles("gas");

  console.log("Tech Article 0:", techArticles[0]?.title);
  console.log("Testo Article 0:", testoArticles[0]?.title);

  // Fake queues object for testing MongoDB fallback path
  const mockQueues: any = {
    writing: {
      add: async (name: string, data: any) => {
        console.log(`Mock Queue writing.add: ${name}`, data.runId, data.payload?.targetPillarId);
      },
    },
  };

  const techRunId = await techCurator.launchGroundedPipeline(
    techArticles[0]!,
    "http://localhost:4000",
    mockQueues
  );
  console.log("Created Tech Run ID:", techRunId);

  const testoRunId = await testoCurator.launchGroundedPipeline(
    testoArticles[0]!,
    "http://localhost:4000",
    mockQueues
  );
  console.log("Created Testo Run ID:", testoRunId);

  const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const techRun = await runsCol.findOne({ runId: techRunId });
  const testoRun = await runsCol.findOne({ runId: testoRunId });

  console.log("Verified Tech Run in DB:", techRun?.runId, techRun?.tenantId, (techRun as any)?.targetPillarId);
  console.log("Verified Testo Run in DB:", testoRun?.runId, testoRun?.tenantId, (testoRun as any)?.targetPillarId);

  if (
    techRun?.tenantId === "software-development-default" &&
    testoRun?.tenantId === "testo"
  ) {
    console.log("✅ All multi-tenant curator pipelines verified successfully!");
  } else {
    console.error("❌ Multi-tenant verification mismatch!");
    process.exit(1);
  }

  await disconnectMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
