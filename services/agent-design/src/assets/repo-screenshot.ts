import { getSharedBrowser } from "../render/browser-pool.js";
import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("agent-design:repo-screenshot");

export async function captureRepoScreenshot(repoUrl: string): Promise<string> {
  logger.info({ repoUrl }, "Capturing GitHub repository preview screenshot...");
  const browser = await getSharedBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
    await page.goto(repoUrl, { waitUntil: "networkidle2", timeout: 15000 });
    const buffer = await page.screenshot({ type: "png" });
    await page.close();
    return Buffer.from(buffer).toString("base64");
  } catch (err) {
    await page.close().catch(() => {});
    logger.warn({ repoUrl, err }, "Failed to capture repo screenshot, using fallback placeholder");
    return "";
  }
}
