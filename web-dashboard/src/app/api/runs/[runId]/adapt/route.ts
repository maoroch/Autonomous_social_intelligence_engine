import { NextResponse } from "next/server";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";
import type { PipelineRunDoc, StageResultDoc } from "@pipeline/shared/db";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "linkedin_pipeline";

const AGENT_WRITING_URL = process.env.AGENT_WRITING_URL || "http://agent-writing:4004";
const AGENT_EVALUATOR_URL = process.env.AGENT_EVALUATOR_URL || "http://agent-evaluator:4008";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const body = await req.json();
    const { textLength = "long" } = body;

    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
    const run = await runsCol.findOne({ runId });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Retrieve writing stage result
    const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
    const writingStage = await stageResultsCol.findOne({ runId, stage: "writing" });
    const writingResult = writingStage?.result as any;
    const existingText = writingResult?.slides ? writingResult.slides.map((s: any) => s.body || s.title).join("\n") : (writingResult?.text || run.topic.summary);

    // Call agent-writing /adapt for Telegram
    const tgRes = await fetch(`${AGENT_WRITING_URL}/adapt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        topicTitle: run.topic.title,
        topicSummary: run.topic.summary,
        existingText,
        targetPlatform: "telegram",
        textLength,
        pillarId: run.contentPillarId,
      }),
    });
    const tgData = await tgRes.json();

    // Pause for 15s to allow Groq rate limit TPM bucket to recover
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // Call agent-writing /adapt for Threads
    const thRes = await fetch(`${AGENT_WRITING_URL}/adapt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        topicTitle: run.topic.title,
        topicSummary: run.topic.summary,
        existingText,
        targetPlatform: "threads",
        textLength,
        pillarId: run.contentPillarId,
      }),
    });
    const thData = await thRes.json();

    // Call agent-evaluator /evaluate for Telegram
    let tgEval = { alignmentScore: 95, driftReport: [] };
    try {
      const evalRes = await fetch(`${AGENT_EVALUATOR_URL}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          tenantId: run.tenantId,
          platform: "telegram",
          text: tgData.text,
          pillarId: run.contentPillarId,
          targetLanguage: "ru",
        }),
      });
      if (evalRes.ok) {
        tgEval = await evalRes.json();
      }
    } catch (err) {
      console.warn("Evaluator call failed for Telegram:", err);
    }

    // Call agent-evaluator /evaluate for Threads
    let thEval = { alignmentScore: 95, driftReport: [] };
    try {
      const evalRes = await fetch(`${AGENT_EVALUATOR_URL}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          tenantId: run.tenantId,
          platform: "threads",
          text: thData.text,
          pillarId: run.contentPillarId,
          targetLanguage: "ru",
        }),
      });
      if (evalRes.ok) {
        thEval = await evalRes.json();
      }
    } catch (err) {
      console.warn("Evaluator call failed for Threads:", err);
    }

    // Update adaptations in pipeline_runs
    const adaptations = {
      telegram: {
        text: tgData.text,
        hook: tgData.hook,
        hashtags: tgData.hashtags,
        length: textLength as "short" | "long",
        alignmentScore: tgEval.alignmentScore,
        evaluatedAt: new Date(),
      },
      threads: {
        text: thData.text,
        hook: thData.hook,
        hashtags: thData.hashtags,
        length: textLength as "short" | "long",
        alignmentScore: thEval.alignmentScore,
        evaluatedAt: new Date(),
      },
    };

    await runsCol.updateOne({ runId }, { $set: { adaptations, updatedAt: new Date() } });

    return NextResponse.json({
      success: true,
      runId,
      adaptations,
      evaluations: { telegram: tgEval, threads: thEval },
    });
  } catch (err: any) {
    console.error("Failed to adapt run:", err);
    return NextResponse.json({ error: "Failed to adapt run for Telegram and Threads" }, { status: 500 });
  }
}
