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
import { createCanvas } from "canvas";

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
  const render_data = typeof rawObj.render_data === "object" && rawObj.render_data !== null ? rawObj.render_data : {};

  return {
    template_type,
    card_count,
    accent_color,
    render_data,
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

  // 4. Формируем промпт к LLM
  const systemPrompt = `You are a creative designer specializing in visual LinkedIn carousels for tech posts.
Your task is to design the structure of a multi-card slide deck (carousel) representing the key takeaways of a LinkedIn post.

Design Rules:
1. Card Count: Select a suitable number of cards/slides (between 3 and 7 cards).
2. Accent Color: Choose a premium hex color code (e.g., "#0066cc" for professional/tech, "#10b981" for clean/coding, "#8b5cf6" for innovative/AI, etc.).
3. Template Type: Output "html".
4. Render Data: Generate a "render_data" JSON object. It must map slide keys (e.g., "slide_1", "slide_2", etc.) to their respective slide details:
   - "title": A short, punchy slide title.
   - "bullets": An array of 1 to 3 concise bullet points or short sentences for the slide body.
   - "footer": A slide footer text (e.g. "Swipe left", "Page X of Y", or Call to action on the last slide).

You must return a single, valid JSON object:
{
  "template_type": "html",
  "card_count": 5,
  "accent_color": "#8b5cf6",
  "render_data": {
    "slide_1": {
      "title": "Slide Title",
      "bullets": ["Point one", "Point two"],
      "footer": "Swipe left"
    },
    ...
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
  const validated = DesignOutputSchema.parse(sanitized);

  // Generate PNG
  const slides = Object.values(validated.render_data as Record<string, any>);
  const slideWidth = 1080;
  const slideHeight = 1080;
  const totalWidth = slideWidth * slides.length;

  const canvas = createCanvas(totalWidth, slideHeight);
  const ctx = canvas.getContext("2d");

  slides.forEach((slide, index) => {
    const xOffset = index * slideWidth;

    // Background
    ctx.fillStyle = validated.accent_color;
    ctx.fillRect(xOffset, 0, slideWidth, slideHeight);

    // Title
    ctx.fillStyle = "white";
    ctx.font = "bold 60px Arial";
    ctx.fillText(slide.title || "Slide Title", xOffset + 100, 200, slideWidth - 200);

    // Bullets
    ctx.font = "40px Arial";
    let y = 350;
    for (const bullet of (slide.bullets || [])) {
      ctx.fillText(`• ${bullet}`, xOffset + 100, y, slideWidth - 200);
      y += 80;
    }

    // Footer
    ctx.font = "30px Arial";
    ctx.fillText(slide.footer || "", xOffset + 100, slideHeight - 100, slideWidth - 200);
  });

  const buffer = canvas.toBuffer("image/png");

  // Save to GridFS
  const db = getDb();
  const bucket = new GridFSBucket(db, { bucketName: "carousel_images" });

  const uploadStream = bucket.openUploadStream(`carousel_${job.runId}.png`, {
    contentType: "image/png"
  });

  const imageIdPromise = new Promise<string>((resolve, reject) => {
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => {
      resolve(uploadStream.id.toString());
    });
  });

  uploadStream.end(buffer);
  const imageId = await imageIdPromise;

  logger.info({ runId: job.runId, cardCount: validated.card_count, imageId }, "Carousel design structure and PNG generated successfully");
  return { ...validated, imageId };
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
