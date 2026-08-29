import AdmZip from "adm-zip";
import { GridFSBucket } from "mongodb";
import { getSharedBrowser } from "./browser-pool.js";
import { loadTemplateHtml, interpolateTemplate } from "./template-engine.js";
import { createLogger } from "@pipeline/shared/logger";
import type { SlideItem } from "../validators/slide-deck.validator.js";
import type { StyleConfig, RenderedStyleOutput } from "../types/index.js";

const logger = createLogger("agent-design:deck-renderer");

export async function renderCarouselDeck(
  slides: SlideItem[],
  style: StyleConfig,
  bucket: GridFSBucket,
  runId: string,
  fallbackCoverDesc?: string,
  logoHtml?: string
): Promise<RenderedStyleOutput> {
  const browser = await getSharedBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });

  const coverTemplateHtml = loadTemplateHtml(style.coverTemplate);
  const cardTemplateHtml = loadTemplateHtml(style.cardTemplate);

  const zip = new AdmZip();
  const imageIds: string[] = [];
  let coverId = "";

  try {
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]!;
      const isCover = i === 0 || slide.isCover === true;
      const rawTemplate = isCover ? coverTemplateHtml : cardTemplateHtml;

      const html = interpolateTemplate(
        rawTemplate,
        slide,
        style,
        i,
        slides.length,
        fallbackCoverDesc,
        logoHtml
      );

      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.evaluateHandle("document.fonts.ready");
      const buffer = (await page.screenshot({ type: "png" })) as Buffer;

      const slideFilename = `slide_${i + 1}.png`;
      zip.addFile(slideFilename, buffer);

      // Сохраняем в GridFS
      const uploadStream = bucket.openUploadStream(`${runId}_${style.key}_slide_${i + 1}.png`, {
        metadata: { runId, style: style.key, slideIndex: i },
      });
      uploadStream.end(buffer);
      const fileId = uploadStream.id.toString();
      imageIds.push(fileId);

      if (i === 0) {
        coverId = fileId;
      }
    }

    // Сохраняем ZIP в GridFS
    const zipBuffer = zip.toBuffer();
    const zipUploadStream = bucket.openUploadStream(`${runId}_${style.key}_carousel.zip`, {
      metadata: { runId, style: style.key, isZip: true },
    });
    zipUploadStream.end(zipBuffer);
    const zipId = zipUploadStream.id.toString();

    await page.close();

    return {
      zipId,
      coverId,
      imageIds,
    };
  } catch (err) {
    await page.close().catch(() => {});
    logger.error({ err, runId, style: style.key }, "Failed to render carousel deck");
    throw err;
  }
}
