import { getCollection, Collections } from "@pipeline/shared/db";
import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("agent-writing:golden-loader");

export async function loadFewShotExamples(
  tenantId: string,
  selectedFormat: string = "tutorial"
): Promise<string> {
  const isTestoTenant = tenantId === "testo";

  let goldenPosts: any[] = [];
  try {
    if (isTestoTenant) {
      const testoCol = getCollection(Collections.GOLDEN_TESTO_PHARMA);
      goldenPosts = await testoCol.find({}).limit(2).toArray();
    } else if (tenantId === "cinema-media") {
      const cinemaCol = getCollection(Collections.GOLDEN_CINEMA_MEDIA);
      goldenPosts = await cinemaCol.find({}).limit(2).toArray();
    } else {
      const goldenCol = getCollection(Collections.GOLDEN_WRITING);
      goldenPosts = await goldenCol.find({ format: selectedFormat }).limit(2).toArray();
      if (goldenPosts.length === 0) {
        goldenPosts = await goldenCol.find({}).limit(2).toArray();
      }
    }
  } catch (err) {
    logger.warn({ err, tenantId }, "Failed to fetch golden posts style examples");
    return "";
  }

  if (goldenPosts.length === 0) return "";

  return `\nSTYLE EXAMPLES (GOLDEN REFERENCE EXAMPLES FOR THIS PORTAL):
Here are examples of high-performing, authentic posts for this portal. 
Study their tone, spacing, scannability, bullet structure, hook strength, and match their quality:
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
