import puppeteer, { type Browser } from "puppeteer-core";
import { createLogger } from "@pipeline/shared/logger";
import * as os from "os";

const logger = createLogger("agent-design:browser-pool");

let sharedBrowser: Browser | null = null;
let browserCreationPromise: Promise<Browser> | null = null;

export async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.connected) {
    return sharedBrowser;
  }
  if (browserCreationPromise) {
    return browserCreationPromise;
  }

  browserCreationPromise = (async () => {
    const isAlpine = os.platform() === "linux";
    const chromePath = isAlpine
      ? "/usr/bin/chromium-browser"
      : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

    logger.info({ chromePath }, "Launching reusable Puppeteer Browser instance...");
    try {
      const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--font-render-hinting=none",
        ],
      });
      sharedBrowser = browser;
      browserCreationPromise = null;
      return browser;
    } catch (err) {
      browserCreationPromise = null;
      logger.error({ err }, "Failed to launch reusable Puppeteer browser");
      throw err;
    }
  })();

  return browserCreationPromise;
}

export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch (e) {
      // ignore
    }
    sharedBrowser = null;
  }
}
