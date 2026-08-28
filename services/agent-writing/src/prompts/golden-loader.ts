import { getCollection, Collections } from "@pipeline/shared/db";
import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("agent-writing:golden-loader");

export async function loadFewShotExamples(
  tenantId: string,
  targetPillarId: string,
  selectedFormat: string = "tutorial"
): Promise<string> {
  const isTestoTenant = tenantId === "testo" || targetPillarId.startsWith("pharma-") || targetPillarId.startsWith("gas-");

  let goldenPosts: any[] = [];
  try {
    if (isTestoTenant) {
      const testoCol = getCollection(Collections.GOLDEN_TESTO_PHARMA);
      goldenPosts = await testoCol.find({ pillarId: targetPillarId }).limit(2).toArray();
      if (goldenPosts.length === 0 && targetPillarId) {
        // Strict isolation: if no exact pillar match, search by tenant without cross-rubric fallback
        goldenPosts = await testoCol.find({}).limit(2).toArray();
      }
    } else if (tenantId === "cinema-media") {
      const cinemaCol = getCollection(Collections.GOLDEN_CINEMA_MEDIA);
      goldenPosts = await cinemaCol.find({}).limit(2).toArray();
    } else {
      const goldenCol = getCollection(Collections.GOLDEN_WRITING);
      const filter = targetPillarId
        ? { $or: [{ pillarId: targetPillarId }, { format: selectedFormat }] }
        : { format: selectedFormat };
      goldenPosts = await goldenCol.find(filter).limit(2).toArray();
    }
  } catch (err) {
    logger.warn({ err, tenantId }, "Failed to fetch golden posts style examples");
    return "";
  }

  if (goldenPosts.length === 0) return "";

  return `\nSTYLE EXAMPLES (FEW-SHOT EXAMPLES FOR THIS SPECIFIC RUBRIC):
Here are examples of high-performing posts matching strictly this content rubric. 
Study their tone, spacing, scannability, list structure, hook strength, and copy their style:
${goldenPosts
  .map(
    (gp, i) => `
--- Example ${i + 1} ---
Hook: ${gp.hook || ""}
Text:
${gp.text || gp.caption || ""}
${gp.cta ? `CTA: ${gp.cta}` : ""}
----------------------`
  )
  .join("\n")}
`;
}
