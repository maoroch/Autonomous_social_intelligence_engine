import "dotenv/config";
import express from "express";
import { createWorker, createQueue } from "@pipeline/shared/queue";
import { createLogger } from "@pipeline/shared/logger";
import { QueueName } from "@pipeline/shared";
import {
  AgentJobSchema,
  type AgentJob,
  PipelineEventSchema,
  type PipelineEvent,
  DesignOutputSchema,
} from "@pipeline/shared/schemas";
import { AiClient } from "@pipeline/shared/ai";
import { connectMongo, getCollection, Collections, getDb } from "@pipeline/shared/db";
import { GridFSBucket } from "mongodb";
import puppeteer from "puppeteer-core";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger("agent-design");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 4005);
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

const openrouterApiKey = process.env.OPENROUTER_API_KEY ?? "";
const groqApiKey = process.env.GROQ_API_KEY ?? "";

const aiClient = new AiClient({
  openrouterApiKey,
  groqApiKey,
  redisUrl: REDIS_URL,
});

const eventsQueue = createQueue<PipelineEvent>(QueueName.PIPELINE_EVENTS, REDIS_URL);

function parseCleanJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  cleaned = cleaned.trim();

  // Экранируем переводы строк внутри строковых литералов
  let inString = false;
  let result = "";
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prevChar = i > 0 ? cleaned[i - 1] : "";
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
      result += char;
    } else if (char === '\n' && inString) {
      result += '\\n';
    } else if (char === '\r' && inString) {
      result += '\\r';
    } else if (char === '\t' && inString) {
      result += '\\t';
    } else {
      result += char;
    }
  }

  return JSON.parse(result);
}

function sanitizeLlmOutput(rawObj: any): any {
  if (!rawObj || typeof rawObj !== "object") {
    throw new Error("LLM did not return an object");
  }

  const template_type = typeof rawObj.template_type === "string" ? rawObj.template_type.trim() : "html";
  const card_count = typeof rawObj.card_count === "number" ? rawObj.card_count : 5;
  const accent_color = typeof rawObj.accent_color === "string" ? rawObj.accent_color.trim() : "#8b5cf6";
  const template_name = typeof rawObj.template_name === "string" ? rawObj.template_name.trim() : undefined;
  const render_data = typeof rawObj.render_data === "object" && rawObj.render_data !== null ? rawObj.render_data : {};
  const preview_cover_1_id = typeof rawObj.preview_cover_1_id === "string" ? rawObj.preview_cover_1_id : undefined;
  const preview_cover_2_id = typeof rawObj.preview_cover_2_id === "string" ? rawObj.preview_cover_2_id : undefined;
  const zip_cover_1_id = typeof rawObj.zip_cover_1_id === "string" ? rawObj.zip_cover_1_id : undefined;
  const zip_cover_2_id = typeof rawObj.zip_cover_2_id === "string" ? rawObj.zip_cover_2_id : undefined;

  return {
    template_type,
    card_count,
    accent_color,
    template_name,
    render_data,
    preview_cover_1_id,
    preview_cover_2_id,
    zip_cover_1_id,
    zip_cover_2_id,
  };
}

async function processDesignJob(job: AgentJob): Promise<unknown> {
  logger.info({ runId: job.runId }, "Starting carousel slide deck design...");

  // 1. Получаем выбранную тему из БД
  const runsCol = getCollection(Collections.PIPELINE_RUNS);
  const run = await runsCol.findOne({ runId: job.runId });
  const topic = run?.topic ?? { title: "Rise of AI and Tech", summary: "" };

  // 2. Получаем стратегию из БД
  const stageResultsCol = getCollection(Collections.STAGE_RESULTS);
  const strategyResultDoc = await stageResultsCol.findOne({ runId: job.runId, stage: "strategy" });
  const strategy = (strategyResultDoc?.result as Record<string, unknown>) ?? {};

  // 3. Получаем текст поста из payload (от writing) или из БД
  const hook = typeof job.payload?.hook === "string" ? job.payload.hook : "";
  const text = typeof job.payload?.text === "string" ? job.payload.text : "";
  const cta = typeof job.payload?.cta === "string" ? job.payload.cta : "";

  let postTextCombined = `${hook}\n\n${text}\n\n${cta}`.trim();
  if (!postTextCombined) {
    // Пробуем получить из БД
    const writingResultDoc = await stageResultsCol.findOne({ runId: job.runId, stage: "writing" });
    const writingResult = writingResultDoc?.result as Record<string, unknown> | undefined;
    if (writingResult) {
      postTextCombined = `${writingResult.hook || ""}\n\n${writingResult.text || ""}\n\n${writingResult.cta || ""}`.trim();
    }
  }

  // 4. Проверяем, есть ли уже в БД результаты стадии design (например, после ручного редактирования)
  const existingDesignDoc = await stageResultsCol.findOne({ runId: job.runId, stage: "design" });
  let validated: any;

  if (existingDesignDoc && (existingDesignDoc.result as any)?.render_data) {
    logger.info({ runId: job.runId }, "Found existing design result. Bypassing LLM generation and using existing render_data.");
    validated = existingDesignDoc.result;
  } else {
    // 4. Формируем промпт к LLM
    const systemPrompt = `You are a creative designer specializing in visual LinkedIn carousels for tech posts.
Your task is to design the structure of a multi-card slide deck (carousel) representing the key takeaways of a LinkedIn post.

Design Rules:
1. Card Count: Select a suitable number of cards/slides (between 3 and 7 cards).
2. Accent Color: Choose a premium hex color code (e.g., "#0066cc" for professional/tech, "#10b981" for clean/coding, "#8b5cf6" for innovative/AI, etc.).
3. Template Type: Output "html".
4. Template Name: Choose either "cover-1" or "cover-2". "cover-1" is a clean white layout with grid lines and a green light badge (great for checklist, comparisons, or structured tutorials). "cover-2" is a premium dark theme with a purple pill/accent (great for opinionated, mistake-focused, or story posts).
5. Render Data: Generate a "render_data" JSON object. It must map slide keys (e.g., "slide_1", "slide_2", etc.) to their respective slide details:
   - "badge": A short 1-2 word tag for the slide header (e.g. "The fix", "Mistake", "Setup", etc.).
   - "title": A short, punchy slide title.
   - "bullets": An array of 1 to 3 concise bullet points or short sentences for the slide body.
   - "footer": A slide footer text (e.g. "@username").

You must return a single, valid JSON object:
{
  "template_type": "html",
  "template_name": "cover-2",
  "card_count": 5,
  "accent_color": "#8b5cf6",
  "render_data": {
    "slide_1": {
      "badge": "AI Agents",
      "title": "I stopped writing backend boilerplate. Here's what replaced it.",
      "bullets": [],
      "footer": "@username"
    },
    "slide_2": {
      "badge": "The Monolith",
      "title": "Keep boundaries clean",
      "bullets": ["One module per service", "No direct calls"],
      "footer": "@username"
    }
  }
}

Return ONLY valid raw JSON. Do NOT include markdown code blocks or conversational text.`;

    const userPrompt = `Here is the LinkedIn post details to design a carousel for:

---
Post Content:
"${postTextCombined}"

Topic Title: "${topic.title}"
Topic Summary: "${topic.summary}"

Strategy Format: "${strategy.format || "lessons_learned"}"
Strategy Core Idea: "${strategy.core_idea || ""}"
---

${job.extraInstructions ? `Additional instructions: ${job.extraInstructions}` : ""}

Please generate the carousel slide deck design structure in JSON format.`;

    const response = await aiClient.complete([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    logger.info({ runId: job.runId, provider: response.provider, model: response.model }, "Design LLM generation complete");

    let parsedJson: any;
    try {
      parsedJson = parseCleanJson(response.text);
    } catch (err) {
      logger.error({ err, rawText: response.text }, "Failed to parse JSON from LLM response");
      throw new Error("LLM response was not valid JSON");
    }

    const sanitized = sanitizeLlmOutput(parsedJson);

    // Валидируем финальный результат Zod схемой
    validated = DesignOutputSchema.parse(sanitized);
  }

  const slides = Object.values(validated.render_data as Record<string, any>);

  // Helper to find Chrome path
  function getChromePath(): string {
    if (fs.existsSync("/usr/bin/chromium-browser")) {
      return "/usr/bin/chromium-browser";
    }
    if (os.platform() === "darwin") {
      const paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome",
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
    }
    return "";
  }

  // Helper to escape HTML strings
  function escapeHtml(text: string): string {
    if (typeof text !== "string") return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Render a specific template style (cover-1 or cover-2) into a cover preview PNG + a ZIP of all slide PNGs
  async function renderStyle(
    browser: any,
    styleName: "cover-1" | "cover-2",
    slidesList: any[],
    runId: string,
    db: any
  ): Promise<{ previewId: string; zipId: string }> {
    const bucket = new GridFSBucket(db, { bucketName: "carousel_images" });
    const AdmZipClass = (await import("adm-zip")).default;
    const zip = new AdmZipClass();
    let firstSlideBuffer: Buffer | null = null;

    // Helper to find the best illustration
    function getIllustrationName(text: string): string {
      const t = text.toLowerCase();
      
      const directMap: Record<string, string> = {
        "ai-agents": "pipeline",
        "automation": "pipeline",
        "bullmq": "queue",
        "node.js": "laptop",
        "nodejs": "laptop",
        "next.js": "browser",
        "nextjs": "browser",
        "supabase": "database",
        "postgresql": "database",
        "postgres": "database",
        "trpc": "api",
        "rest": "api",
        "typescript": "typescript",
        "zod": "typescript",
        "deployment": "terminal",
        "docker": "terminal",
        "vercel": "cloud",
        "saas": "cloud",
        "backend": "server",
        "server": "server"
      };

      for (const [key, val] of Object.entries(directMap)) {
        if (t.includes(key)) return val;
      }

      const categoryMap: Record<string, string[]> = {
        "docker": ["docker", "containers", "devops"],
        "security": ["authentication", "jwt", "auth", "clerk", "security"],
        "performance": ["optimization", "cold-start", "speed", "performance"],
        "git": ["git", "version-control", "open-source"],
        "monitoring": ["logging", "metrics", "pino", "uptime", "monitoring"],
        "mobile": ["mobile", "react-native", "ios", "android"],
        "neural": ["llm", "openai", "groq", "machine-learning", "ai"],
        "testing": ["testing", "jest", "vitest", "qa"],
        "saas": ["saas", "stripe", "pricing", "monetization"],
        "webhook": ["webhook", "events", "real-time", "notifications"]
      };

      for (const [illustration, keywords] of Object.entries(categoryMap)) {
        for (const kw of keywords) {
          if (t.includes(kw)) {
            return illustration;
          }
        }
      }

      return "laptop";
    }

    for (let index = 0; index < slidesList.length; index++) {
      const slide = slidesList[index];
      const isCover = index === 0;

      // Cover uses cover-X, other slides use card-X
      const templateName = isCover ? styleName : (styleName === "cover-1" ? "card-1" : "card-2");
      const templatePath = path.resolve(__dirname, `../template/${templateName}.html`);
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templatePath}`);
      }
      let html = fs.readFileSync(templatePath, "utf8");

      const badgeText = escapeHtml(slide.badge || (isCover ? (styleName === "cover-1" ? "The fix" : "AI Agents") : "Setup"));
      const titleText = escapeHtml(slide.title || "");
      const footerLeft = escapeHtml(slide.footer || "@maoroch");
      const pageText = `${index + 1}/${slidesList.length}`;

      let bodyHtml = "";
      if (slide.bullets && slide.bullets.length > 0) {
        bodyHtml = (slide.bullets as string[])
          .map(b => `→ ${escapeHtml(b)}`)
          .join("<br/>");
      }

      let progressHtml = "";
      if (styleName === "cover-2") {
        for (let i = 0; i < slidesList.length; i++) {
          if (i === index) {
            progressHtml += `<div class="pill"></div>`;
          } else {
            progressHtml += `<div class="dot"></div>`;
          }
        }
      }

      // Dynamic illustration match
      const slideText = `${slide.title || ""} ${slide.badge || ""} ${(slide.bullets || []).join(" ")}`;
      const illName = getIllustrationName(slideText);
      const svgPath = path.resolve(__dirname, `../template/svg-illustrations/${illName}.svg`);
      let svgContent = "";
      if (fs.existsSync(svgPath)) {
        svgContent = fs.readFileSync(svgPath, "utf8");
      } else {
        const fallbackPath = path.resolve(__dirname, `../template/svg-illustrations/laptop.svg`);
        if (fs.existsSync(fallbackPath)) {
          svgContent = fs.readFileSync(fallbackPath, "utf8");
        }
      }

      html = html
        .replace("{{BADGE}}", badgeText)
        .replace("{{TITLE}}", titleText)
        .replace("{{BODY}}", bodyHtml)
        .replace("{{FOOTER_LEFT}}", footerLeft)
        .replace("{{PAGE_NUMBER}}", pageText)
        .replace("{{PROGRESS}}", progressHtml)
        .replace("{{ILLUSTRATION}}", svgContent);

      const page = await browser.newPage();
      try {
        await page.setViewport({
          width: 1080,
          height: 1350,
          deviceScaleFactor: 1,
        });
        try {
          await page.setContent(html, { waitUntil: "networkidle0", timeout: 8000 });
        } catch (e) {
          logger.warn({ err: e }, "Puppeteer setContent networkidle0 timed out. Falling back to domcontentloaded...");
          try {
            await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 5000 });
          } catch (e2) {
            logger.error({ err: e2 }, "Puppeteer setContent failed completely. Proceeding with current content anyway.");
          }
        }
        
        // Evaluate dynamic layout parameters based on exact rendered element heights
        await page.evaluate(`(() => {
          const headline = document.querySelector(".headline");
          const bodyText = document.querySelector(".body-text");
          const badge = document.querySelector(".badge");
          const container = document.querySelector(".illustration-container");
          const footer = document.querySelector(".footer");

          let textBottom = 155; // default padding top
          if (badge) {
            textBottom = Math.max(textBottom, badge.offsetTop + badge.offsetHeight);
          }
          if (headline) {
            textBottom = Math.max(textBottom, headline.offsetTop + headline.offsetHeight);
          }
          if (bodyText) {
            textBottom = Math.max(textBottom, bodyText.offsetTop + bodyText.offsetHeight);
          }

          let footerTop = 1350 - 108; // default footer position
          if (footer) {
            footerTop = footer.offsetTop;
          }

          // Spacing from footer: 60px
          const targetIllustrationBottom = footerTop - 60;
          const gap = 35;
          const targetTop = textBottom + gap;
          let targetHeight = targetIllustrationBottom - targetTop;

          if (container) {
            if (targetHeight < 180) {
              container.style.display = "none";
            } else {
              // Cap max height to 550px to prevent overflow
              if (targetHeight > 550) {
                targetHeight = 550;
              }
              container.style.height = targetHeight + "px";
              container.style.marginTop = gap + "px";
              container.style.display = "flex";
            }
          }
        })()`);

        // Take screenshot of the exact .post element to avoid border margins / cutoffs
        const element = await page.$(".post");
        if (!element) {
          throw new Error("Could not find .post element in template");
        }
        
        const screenshotBuffer = await element.screenshot({ type: "png" });
        const buffer = Buffer.from(screenshotBuffer);

        if (isCover) {
          firstSlideBuffer = buffer;
        }

        const filename = isCover ? `01_cover.png` : `${String(index + 1).padStart(2, "0")}_card.png`;
        zip.addFile(filename, buffer);
      } finally {
        await page.close();
      }
    }

    // Save cover preview image
    let previewId = "";
    if (firstSlideBuffer) {
      const uploadStreamPng = bucket.openUploadStream(`preview_${styleName}_${runId}.png`, {
        contentType: "image/png"
      });
      const pngPromise = new Promise<string>((resolve, reject) => {
        uploadStreamPng.on("error", reject);
        uploadStreamPng.on("finish", () => resolve(uploadStreamPng.id.toString()));
      });
      uploadStreamPng.end(firstSlideBuffer);
      previewId = await pngPromise;
    }

    // Save ZIP package
    const zipBuffer = zip.toBuffer();
    const uploadStreamZip = bucket.openUploadStream(`carousel_${styleName}_${runId}.zip`, {
      contentType: "application/zip"
    });
    const zipPromise = new Promise<string>((resolve, reject) => {
      uploadStreamZip.on("error", reject);
      uploadStreamZip.on("finish", () => resolve(uploadStreamZip.id.toString()));
    });
    uploadStreamZip.end(zipBuffer);
    const zipId = await zipPromise;

    return { previewId, zipId };
  }

  // Launch Puppeteer instance
  const chromePath = getChromePath();
  if (!chromePath) {
    throw new Error("Could not find Google Chrome or Chromium executable. Please verify installation.");
  }

  logger.info({ chromePath }, "Launching Puppeteer instance for dual layout rendering...");
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--headless",
    ],
  });

  const db = getDb();
  let result: any;

  try {
    // 1. Render Style 1 (cover-1 + card-1 templates)
    const style1 = await renderStyle(browser, "cover-1", slides, job.runId, db);

    // 2. Render Style 2 (cover-2 + card-2 templates)
    const style2 = await renderStyle(browser, "cover-2", slides, job.runId, db);

    const defaultTemplate = validated.template_name === "cover-1" ? "cover-1" : "cover-2";
    const selectedZipId = defaultTemplate === "cover-1" ? style1.zipId : style2.zipId;

    result = {
      ...validated,
      template_name: defaultTemplate,
      preview_cover_1_id: style1.previewId,
      preview_cover_2_id: style2.previewId,
      zip_cover_1_id: style1.zipId,
      zip_cover_2_id: style2.zipId,
      imageId: selectedZipId, // Default ZIP ID
    };
  } finally {
    await browser.close();
  }

  logger.info({ runId: job.runId, cardCount: validated.card_count, imageId: result.imageId }, "Carousel ZIP packages and Cover previews generated successfully");
  return result;
}

const worker = createWorker<AgentJob>(
  QueueName.DESIGN,
  async (job) => {
    const parsed = AgentJobSchema.parse(job.data);
    try {
      const result = await processDesignJob(parsed);
      await eventsQueue.add(
        "event",
        PipelineEventSchema.parse({
          runId: parsed.runId,
          stage: parsed.stage,
          status: "completed",
          result: result as Record<string, unknown>,
        } satisfies PipelineEvent),
      );
    } catch (err) {
      logger.error({ err, runId: parsed.runId }, "design job failed");
      await eventsQueue.add(
        "event",
        PipelineEventSchema.parse({
          runId: parsed.runId,
          stage: parsed.stage,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        } satisfies PipelineEvent),
      );
    }
  },
  REDIS_URL,
);

worker.on("error", (err) => logger.error({ err }, "worker error"));

const app = express();
app.get("/health", (_req, res) => res.json({ status: "ok", service: "agent-design" }));

async function start() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("Connected to MongoDB");

  app.listen(PORT, () => logger.info({ port: PORT }, "agent-design listening"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
