import { checkNumericGrounding, type RetrievableChunk } from "@pipeline/shared/ai";
import { getCollection, Collections, type PipelineRunDoc } from "@pipeline/shared/db";
import { createLogger } from "@pipeline/shared/logger";
import type { IndustryProfile } from "@pipeline/shared/schemas";

const logger = createLogger("agent-writing:grounding-guard");

export async function verifyNumericGrounding(
  runId: string,
  postText: string,
  topic: { title: string; summary: string },
  coreIdea: string,
  retrievedFacts: RetrievableChunk[],
  industryProfile?: IndustryProfile
): Promise<boolean> {
  if (!industryProfile || !industryProfile.complianceConfig.factCheckRequired) {
    return true;
  }

  const factsText = retrievedFacts.map((f) => f.content).join(" ");
  const sourceContext = `${topic.title} ${topic.summary} ${coreIdea} ${factsText}`;
  const grounding = checkNumericGrounding(postText, sourceContext);

  if (!grounding.ok) {
    logger.warn(
      { runId, ungroundedClaims: grounding.ungroundedClaims },
      "Writing output contains numeric claims not found in source context — flagging run for mandatory compliance review"
    );
    await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).updateOne(
      { runId },
      { $set: { needsComplianceReview: true, updatedAt: new Date() } }
    );
    return false;
  }

  return true;
}
