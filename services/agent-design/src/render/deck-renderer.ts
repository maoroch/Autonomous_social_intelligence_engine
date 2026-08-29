import AdmZip from "adm-zip";
import { GridFSBucket } from "mongodb";
import { getSharedBrowser } from "./browser-pool.js";
import { loadTemplateHtml, interpolateTemplate } from "./template-engine.js";
import { createLogger } from "@pipeline/shared/logger";
import type { SlideItem } from "../validators/slide-deck.validator.js";
import type { StyleConfig, RenderedStyleOutput } from "../types/index.js";

const logger = createLogger("agent-design:deck-renderer");

async function prefetchImageAsDataUri(url: string): Promise<string | null> {
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return null;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/png";
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    logger.warn({ err, url }, "Failed prefetching external image, falling back to direct URL");
    return null;
  }
}

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

      // Prefetch external image URL to Base64 if needed for instant offline rendering
      let processedSlide = slide;
      if (slide.illustration && (slide.illustration.startsWith("http://") || slide.illustration.startsWith("https://"))) {
        const prefetched = await prefetchImageAsDataUri(slide.illustration);
        if (prefetched) {
          processedSlide = { ...slide, illustration: prefetched };
        }
      }

      const html = interpolateTemplate(
        rawTemplate,
        processedSlide,
        style,
        i,
        slides.length,
        fallbackCoverDesc,
        logoHtml
      );

      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.evaluateHandle("document.fonts.ready");

      // Ensure all images (data URIs or cached) are fully decoded before screenshot
      await page.evaluate(`
        (async () => {
          const imgs = Array.from(document.querySelectorAll("img"));
          await Promise.all(
            imgs.map((img) => {
              if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
              return new Promise((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 1500);
              });
            })
          );
        })()
      `);

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
