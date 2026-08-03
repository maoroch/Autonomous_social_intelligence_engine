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
  type IndustryProfile,
} from "@pipeline/shared/schemas";
import { AiClient } from "@pipeline/shared/ai";
import { connectMongo, getCollection, Collections, getDb, type IndustryProfileDoc, type PipelineRunDoc } from "@pipeline/shared/db";
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

/**
 * Набор шаблонов (обложка + карточка) для конкретного template-set.
 * "software-development" — существующие 2 IT-стиля (обратная совместимость, рендерятся оба всегда).
 * "industrial-measurement-equipment" — Testo, один брендированный стиль (см. SKILL_testo_carousel_design.md).
 */
interface StyleConfig {
  key: string;
  coverTemplate: string; // относительный путь внутри /template без .html
  cardTemplate: string;
  defaultCoverBadge: string;
  defaultCardBadge: string;
  brand?: { accentColor: string; inkColor: string; paperColor: string };
}

const SOFTWARE_DEV_STYLES: StyleConfig[] = [
  { key: "cover-1", coverTemplate: "cover-1", cardTemplate: "card-1", defaultCoverBadge: "The fix", defaultCardBadge: "Setup" },
  { key: "cover-2", coverTemplate: "cover-2", cardTemplate: "card-2", defaultCoverBadge: "AI Agents", defaultCardBadge: "Setup" },
  { key: "cover-3", coverTemplate: "cover-3", cardTemplate: "card-3", defaultCoverBadge: "Terminal", defaultCardBadge: "Code" },
  { key: "cover-4", coverTemplate: "cover-4", cardTemplate: "card-4", defaultCoverBadge: "Blueprint", defaultCardBadge: "Spec" },
  { key: "cover-5", coverTemplate: "cover-5", cardTemplate: "card-5", defaultCoverBadge: "Glass", defaultCardBadge: "Insight" },
  { key: "cover-6", coverTemplate: "cover-6", cardTemplate: "card-6", defaultCoverBadge: "Editorial", defaultCardBadge: "Deep Dive" },
  { key: "cover-7", coverTemplate: "cover-7", cardTemplate: "card-7", defaultCoverBadge: "Matrix", defaultCardBadge: "Syntax" },
  { key: "cover-8", coverTemplate: "cover-8", cardTemplate: "card-8", defaultCoverBadge: "GitHub Trending", defaultCardBadge: "Open Source" },
  { key: "cover-9", coverTemplate: "cover-9", cardTemplate: "card-9", defaultCoverBadge: "Pet Project", defaultCardBadge: "Portfolio" },
];

function resolveStyleConfigs(industryProfile: IndustryProfile | undefined): StyleConfig[] {
  const templateSetId = industryProfile?.brandGuidelines?.templateSetId;

  if (!templateSetId || templateSetId === "software-development") {
    return SOFTWARE_DEV_STYLES;
  }

  // Нишевые вертикали (Testo и будущие клиенты) — один брендированный template-set.
  const palette = industryProfile!.brandGuidelines.colorPalette;
  const brand = {
    // Плейсхолдер-дефолты из SKILL_testo_carousel_design.md, если брендбук ещё не заполнен клиентом.
    accentColor: palette[0] ?? "#EE8432",
    inkColor: palette[1] ?? "#14171A",
    paperColor: palette[2] ?? "#FAF9F6",
  };

  return [
    {
      key: templateSetId,
      coverTemplate: `${templateSetId}/cover`,
      cardTemplate: `${templateSetId}/card`,
      defaultCoverBadge: "INSIGHT",
      defaultCardBadge: "DETAILS",
      brand,
    },
  ];
}

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
  const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const run = await runsCol.findOne({ runId: job.runId });
  const topic = run?.topic ?? { title: "Rise of AI and Tech", summary: "" };

  // Мультиарендность: определяем IndustryProfile для выбора template-set (см. resolveStyleConfigs).
  let industryProfile: IndustryProfile | undefined;
  if (run?.tenantId) {
    try {
      const doc = await getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES).findOne({ tenantId: run.tenantId });
      if (doc) industryProfile = doc;
    } catch (err) {
      logger.warn({ err, tenantId: run.tenantId }, "Failed to load IndustryProfile — falling back to default software-development styles");
    }
  }
  const styleConfigs = resolveStyleConfigs(industryProfile);

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
4. Template Name: Choose one of: ${styleConfigs.map((s) => `"${s.key}"`).join(", ")}.${styleConfigs === SOFTWARE_DEV_STYLES ? ' "cover-1" is a clean white layout with grid lines and a green light badge (great for checklist, comparisons, or structured tutorials). "cover-2" is a premium dark theme with a purple pill/accent (great for opinionated, mistake-focused, or story posts).' : ""}
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

    if (run?.contentPillarId === "github-trending-repos") {
      sanitized.template_name = "cover-8";
    } else if (run?.contentPillarId === "pet-projects-showcase") {
      sanitized.template_name = "cover-9";
    }

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

  // Render a specific style config into a cover preview PNG + a ZIP of all slide PNGs
  async function renderStyle(
    browser: any,
    style: StyleConfig,
    slidesList: any[],
    runId: string,
    db: any
  ): Promise<{ previewId: string; zipId: string }> {
    const bucket = new GridFSBucket(db, { bucketName: "carousel_images" });
    const AdmZipClass = (await import("adm-zip")).default;
    const zip = new AdmZipClass();
    let firstSlideBuffer: Buffer | null = null;

    // Load author profile to get the custom footer username
    let customUsername = "@maoroch";
    try {
      const runsCol = db.collection(Collections.PIPELINE_RUNS);
      const runDoc = await runsCol.findOne({ runId });
      const profilesCol = db.collection(Collections.AUTHOR_PROFILES);
      let profileDoc = null;
      if (runDoc?.profileId) {
        const { ObjectId } = await import("mongodb");
        profileDoc = await profilesCol.findOne({ _id: new ObjectId(runDoc.profileId) });
      }
      if (!profileDoc) {
        profileDoc = await profilesCol.findOne({});
      }
      if (profileDoc && profileDoc.username) {
        customUsername = profileDoc.username.startsWith("@") ? profileDoc.username : `@${profileDoc.username}`;
      }
    } catch (err) {
      logger.warn({ err, runId }, "Failed to load custom username for footer rendering");
    }

    // Библиотеки иллюстраций СТРОГО разделены по вертикали (см. запрос "библиотеки не должны смешиваться"):
    // - software-development (tech-портал) — SVG-библиотека, IT-иконки (docker, git, database и т.д.)
    // - любая нишевая вертикаль (Testo и будущие клиенты) — СОБСТВЕННАЯ PNG-библиотека,
    //   отдельная коллекция Mongo, отфильтрованная по templateSetId. SVG-набор для неё не читается вообще.
    const isNicheStyle = !!style.brand;

    const illustrationsMap = new Map<string, string>(); // svg markup
    const pngIllustrationsMap = new Map<string, string>(); // base64 png content

    if (!isNicheStyle) {
      const illustrationsCol = db.collection(Collections.SVG_ILLUSTRATIONS);
      const illustrationsList = await illustrationsCol.find({}).toArray();
      for (const item of illustrationsList) {
        illustrationsMap.set(item.name, item.svgContent);
      }
    } else {
      const pngCol = db.collection(Collections.PNG_ILLUSTRATIONS);
      const pngList = await pngCol.find({ templateSetId: style.key }).toArray();
      for (const item of pngList) {
        pngIllustrationsMap.set(item.name, item.base64Content);
      }
    }

    const usedIllustrations = new Set<string>();

    // Helper to find the best illustration (IT-вертикаль — по ключевым словам кода/технологий)
    function getIllustrationName(slideItem: any, used: Set<string>): string {
      // Manual override check
      if (slideItem.illustration !== undefined) {
        return slideItem.illustration || "none";
      }

      const text = `${slideItem.title || ""} ${slideItem.badge || ""} ${(slideItem.bullets || []).join(" ")}`;
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
        if (t.includes(key)) {
          if (!used.has(val) && illustrationsMap.has(val)) {
            used.add(val);
            return val;
          }
        }
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
            if (!used.has(illustration) && illustrationsMap.has(illustration)) {
              used.add(illustration);
              return illustration;
            }
          }
        }
      }

      // Check if general fallback 'laptop' is available and not yet used
      if (!used.has("laptop") && illustrationsMap.has("laptop")) {
        used.add("laptop");
        return "laptop";
      }

      return "none";
    }

    // Подбор PNG-иллюстрации для нишевых вертикалей — по ключевым словам отрасли (не IT-специфике).
    // Расширяется вместе с industryProfile.glossary/contentPillars по мере роста PNG-библиотеки клиента.
    function getPngIllustrationName(slideItem: any, used: Set<string>): string {
      if (slideItem.illustration !== undefined) {
        return slideItem.illustration || "none";
      }

      const text = `${slideItem.title || ""} ${slideItem.badge || ""} ${(slideItem.bullets || []).join(" ")}`;
      const t = text.toLowerCase();

      const nicheKeywordMap: Record<string, string[]> = {
        thermometer: ["temperature", "температур", "thermo", "heat", "тепло"],
        gauge: ["accuracy", "measurement", "точност", "измерен", "range", "диапазон"],
        certificate: ["certificate", "calibration", "сертификат", "калибров", "iso", "compliance"],
        "alert-triangle": ["warning", "mistake", "ошибк", "риск", "risk", "myth", "миф"],
        calendar: ["season", "сезон", "schedule", "график", "annual", "quarterly"],
      };

      for (const [illustration, keywords] of Object.entries(nicheKeywordMap)) {
        for (const kw of keywords) {
          if (t.includes(kw)) {
            if (!used.has(illustration) && pngIllustrationsMap.has(illustration)) {
              used.add(illustration);
              return illustration;
            }
          }
        }
      }

      // Дефолт для нишевых обложек — gauge (нейтральная иконка точности измерения)
      if (!used.has("gauge") && pngIllustrationsMap.has("gauge")) {
        used.add("gauge");
        return "gauge";
      }

      return "none";
    }

    for (let index = 0; index < slidesList.length; index++) {
      const slide = slidesList[index];
      const isCover = index === 0;

      // Cover uses coverTemplate, other slides use cardTemplate
      const templateName = isCover ? style.coverTemplate : style.cardTemplate;
      const templatePath = path.resolve(__dirname, `../template/${templateName}.html`);
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templatePath}`);
      }
      let html = fs.readFileSync(templatePath, "utf8");

      const badgeText = escapeHtml(slide.badge || (isCover ? style.defaultCoverBadge : style.defaultCardBadge));
      const titleText = escapeHtml(slide.title || "");
      let footerLeftVal = slide.footer || customUsername;
      if (footerLeftVal === "@username" || footerLeftVal === "@maoroch") {
        footerLeftVal = customUsername;
      }
      const footerLeft = escapeHtml(footerLeftVal);
      const pageText = `${index + 1}/${slidesList.length}`;
      const rawSlideBulletsText = slide.bullets ? (slide.bullets as string[]).join(" ") : "";

      let bodyHtml = "";
      if (slide.bullets && slide.bullets.length > 0) {
        const cleanBullets = (slide.bullets as string[]).filter(b => {
          const trimmed = b.trim();
          if (/^(?:github|url|link|repo|repository):\s*https?:\/\//i.test(trimmed)) return false;
          if (/^https?:\/\/github\.com/i.test(trimmed)) return false;
          return true;
        });
        bodyHtml = cleanBullets
          .map(b => `→ ${escapeHtml(b)}`)
          .join("<br/>");
      }

      const allRepoUrls = Array.from(postTextCombined.matchAll(/(?:https?:\/\/)?github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/gi))
        .map(m => m[1] ? `github.com/${m[1].replace(/\/$/, "")}` : "")
        .filter(u => u.length > 0);

      const slideRepoMatch = rawSlideBulletsText.match(/(?:https?:\/\/)?github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i) ||
                             titleText.match(/(?:https?:\/\/)?github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i);

      let githubUrl = "";
      if (!isCover) {
        const cardRepoIdx = index - 1;
        if (slideRepoMatch && slideRepoMatch[1]) {
          githubUrl = `github.com/${slideRepoMatch[1].replace(/\/$/, "")}`;
        } else if (allRepoUrls[cardRepoIdx]) {
          githubUrl = allRepoUrls[cardRepoIdx] || "";
        } else if (allRepoUrls[0]) {
          githubUrl = allRepoUrls[0] || "";
        }
      }

      let progressHtml = "";
      if (style.key === "cover-2") {
        for (let i = 0; i < slidesList.length; i++) {
          if (i === index) {
            progressHtml += `<div class="pill"></div>`;
          } else {
            progressHtml += `<div class="dot"></div>`;
          }
        }
      }

      // Dynamic illustration match — раздельная логика для tech (SVG) и нишевых вертикалей (PNG)
      let svgContent = "";
      if (isNicheStyle) {
        const illName = getPngIllustrationName(slide, usedIllustrations);
        slide.illustration = illName;
        if (illName && illName !== "none") {
          const base64Content = pngIllustrationsMap.get(illName);
          if (base64Content) {
            svgContent = `<img src="data:image/png;base64,${base64Content}" alt="${escapeHtml(illName)}" style="height:100%;width:auto;object-fit:contain;" />`;
          }
        }
      } else {
        const illName = getIllustrationName(slide, usedIllustrations);
        slide.illustration = illName; // Save matched illustration name back to the slide metadata
        if (illName && illName !== "none") {
          svgContent = illustrationsMap.get(illName) || "";
        }
      }

      html = html
        .replace("{{BADGE}}", badgeText)
        .replace("{{TITLE}}", titleText)
        .replace("{{BODY}}", bodyHtml)
        .replace("{{FOOTER_LEFT}}", footerLeft)
        .replace("{{PAGE_NUMBER}}", pageText)
        .replace("{{PROGRESS}}", progressHtml)
        .replace("{{ILLUSTRATION}}", svgContent)
        .replace(/\{\{GITHUB_URL\}\}/g, escapeHtml(githubUrl));

      // Инъекция брендовых CSS-переменных для нишевых template-set (Testo и будущие клиенты).
      if (style.brand) {
        html = html
          .replace(/\{\{ACCENT_COLOR\}\}/g, style.brand.accentColor)
          .replace(/\{\{INK_COLOR\}\}/g, style.brand.inkColor)
          .replace(/\{\{PAPER_COLOR\}\}/g, style.brand.paperColor);
      }

      const page = await browser.newPage();
      try {
        await page.setViewport({
          width: 1080,
          height: 1350,
          deviceScaleFactor: 1,
        });
        try {
          await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 5000 });
        } catch (e) {
          logger.warn({ err: e }, "Puppeteer setContent domcontentloaded timed out. Proceeding with current content anyway.");
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
      const uploadStreamPng = bucket.openUploadStream(`preview_${style.key}_${runId}.png`, {
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
    const uploadStreamZip = bucket.openUploadStream(`carousel_${style.key}_${runId}.zip`, {
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
    // Рендерим все сконфигурированные для этого tenant стили (1 для нишевых вертикалей, 2 для software-development).
    const renderedStyles: Array<{ key: string; previewId: string; zipId: string }> = [];
    for (const style of styleConfigs) {
      const rendered = await renderStyle(browser, style, slides, job.runId, db);
      renderedStyles.push({ key: style.key, ...rendered });
    }

    const requestedKey = typeof validated.template_name === "string" ? validated.template_name : undefined;
    const defaultStyle = renderedStyles.find((s) => s.key === requestedKey) ?? renderedStyles[0];
    if (!defaultStyle) {
      throw new Error("No carousel styles were rendered — styleConfigs was empty");
    }

    const rendered_styles: Record<string, { previewId: string; zipId: string }> = {};
    for (const s of renderedStyles) {
      rendered_styles[s.key] = { previewId: s.previewId, zipId: s.zipId };
    }

    result = {
      ...validated,
      template_name: defaultStyle.key,
      rendered_styles,
      preview_cover_1_id: renderedStyles[0]?.previewId,
      preview_cover_2_id: renderedStyles[1]?.previewId,
      zip_cover_1_id: renderedStyles[0]?.zipId,
      zip_cover_2_id: renderedStyles[1]?.zipId,
      imageId: defaultStyle.zipId, // Default ZIP ID
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

async function seedSvgIllustrations() {
  try {
    const col = getCollection<any>(Collections.SVG_ILLUSTRATIONS);
    const count = await col.countDocuments();
    if (count === 0) {
      logger.info("Initializing/Seeding SVG illustrations to MongoDB...");
      const dirPath = path.resolve(__dirname, "../template/svg-illustrations");
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        const docs = [];
        for (const file of files) {
          if (file.endsWith(".svg")) {
            const name = path.basename(file, ".svg");
            const svgContent = fs.readFileSync(path.join(dirPath, file), "utf8");
            docs.push({ name, svgContent });
          }
        }
        if (docs.length > 0) {
          await col.insertMany(docs);
          logger.info({ count: docs.length }, "Seeded SVG illustrations to MongoDB");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed SVG illustrations");
  }
}

/**
 * Сидит PNG-библиотеки иллюстраций для нишевых вертикалей (Testo и будущие клиенты).
 * Каждый template-set хранится в СВОЕЙ поддиректории template/png-illustrations/<templateSetId>/
 * и сохраняется в Mongo с полем templateSetId — это и есть механизм изоляции между библиотеками:
 * agent-design при рендеринге фильтрует PNG_ILLUSTRATIONS строго по templateSetId текущего стиля
 * (см. renderStyle -> pngCol.find({ templateSetId: style.key })), поэтому Testo и любой будущий
 * клиент никогда не увидят и не смогут выбрать иконки друг друга.
 */
async function seedPngIllustrations() {
  try {
    const col = getCollection<any>(Collections.PNG_ILLUSTRATIONS);
    const baseDir = path.resolve(__dirname, "../template/png-illustrations");
    if (!fs.existsSync(baseDir)) return;

    const templateSetDirs = fs.readdirSync(baseDir).filter((d) => fs.statSync(path.join(baseDir, d)).isDirectory());

    for (const templateSetId of templateSetDirs) {
      const existingCount = await col.countDocuments({ templateSetId });
      if (existingCount > 0) continue; // уже засеяно для этого template-set

      const dirPath = path.join(baseDir, templateSetId);
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".png"));
      const docs = files.map((file) => {
        const name = path.basename(file, ".png");
        const base64Content = fs.readFileSync(path.join(dirPath, file)).toString("base64");
        return { name, templateSetId, base64Content };
      });

      if (docs.length > 0) {
        await col.insertMany(docs);
        logger.info({ count: docs.length, templateSetId }, "Seeded PNG illustrations to MongoDB");
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed PNG illustrations");
  }
}

async function start() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("Connected to MongoDB");

  await seedSvgIllustrations();
  await seedPngIllustrations();

  app.listen(PORT, () => logger.info({ port: PORT }, "agent-design listening"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
