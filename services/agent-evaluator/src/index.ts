import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";
import type { GoldenEvaluationDoc, IndustryProfileDoc, PipelineRunDoc } from "@pipeline/shared/db";
import type { TerminologyRules } from "@pipeline/shared/schemas";
import { validateTerminology } from "./terminology.js";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4007;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "linkedin_pipeline";

export interface EvaluateRequest {
  runId: string;
  tenantId?: string;
  platform: "linkedin" | "instagram" | "telegram" | "threads";
  text: string;
  pillarId?: string;
  targetLanguage?: string;
  terminologyRules?: TerminologyRules;
}

export function evaluateText(req: EvaluateRequest): { alignmentScore: number; driftReport: { rule: string; passed: boolean; details: string }[] } {
  const { platform, text, pillarId, tenantId, targetLanguage, terminologyRules } = req;
  const driftReport: { rule: string; passed: boolean; details: string }[] = [];
  let deductions = 0;

  // 0. Mandatory Header Emoji Rule
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  const firstLine = lines[0] || "";
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const headerStartsWithEmoji = emojiRegex.test(firstLine.slice(0, 4));

  if (platform === "telegram" || platform === "threads" || targetLanguage === "ru") {
    if (!headerStartsWithEmoji) {
      deductions += 20;
      driftReport.push({
        rule: "mandatory_header_emoji",
        passed: false,
        details: "Отклонение: краткий заголовок поста в 1-й строке должен обязательно начинаться с эмодзи",
      });
    } else {
      driftReport.push({
        rule: "mandatory_header_emoji",
        passed: true,
        details: "Соблюдено: краткий заголовок в 1-й строке начинается с обязательного эмодзи",
      });
    }
  }

  // 1. Emoji Policy Guard (For RU Telegram & Threads: Emojis ONLY in title/header lines 1-2)
  const bodyLines = lines.slice(2);
  const bodyText = bodyLines.join("\n");
  const hasBodyEmojis = emojiRegex.test(bodyText);

  if (platform === "telegram" || platform === "threads" || targetLanguage === "ru") {
    if (hasBodyEmojis) {
      deductions += 25;
      driftReport.push({
        rule: "emoji_policy_guard",
        passed: false,
        details: "Отклонение: эмодзи обнаружены в основном теле текста (разрешены только в заголовке)",
      });
    } else {
      driftReport.push({
        rule: "emoji_policy_guard",
        passed: true,
        details: "Соблюдено: эмодзи присутствуют только в заголовках",
      });
    }
  }

  // 2. Hashtags Check
  const hashtagRegex = /#[\wа-яА-ЯёЁ_-]+/g;
  const hashtagsFound = text.match(hashtagRegex) || [];
  if (hashtagsFound.length === 0) {
    deductions += 15;
    driftReport.push({
      rule: "hashtags_check",
      passed: false,
      details: "Отклонение: блок тематических хэштегов отсутствует внизу текста",
    });
  } else {
    driftReport.push({
      rule: "hashtags_check",
      passed: true,
      details: `Соблюдено: найдено ${hashtagsFound.length} хэштегов`,
    });
  }

  // 3. Language Verification
  if (targetLanguage === "ru" || platform === "telegram" || platform === "threads") {
    const cyrillicRegex = /[а-яА-ЯёЁ]/;
    if (!cyrillicRegex.test(text)) {
      deductions += 30;
      driftReport.push({
        rule: "language_check",
        passed: false,
        details: "Отклонение: текст не на русском языке",
      });
    } else {
      driftReport.push({
        rule: "language_check",
        passed: true,
        details: "Соблюдено: профессиональный русский язык",
      });
    }
  }

  // 4. Structure & No Placeholders
  const placeholders = ["TODO", "[INSERT", "[LINK]", "XXXX"];
  const foundPlaceholders = placeholders.filter(p => text.toUpperCase().includes(p));
  if (foundPlaceholders.length > 0) {
    deductions += 30;
    driftReport.push({
      rule: "no_placeholders",
      passed: false,
      details: `Отклонение: обнаружены плейсхолдеры (${foundPlaceholders.join(", ")})`,
    });
  } else {
    driftReport.push({
      rule: "no_placeholders",
      passed: true,
      details: "Соблюдено: готовый к публикации контент без заглушек",
    });
  }
  // 5. Pharma Specific Validation Rules (Testo Pharma Rubrics)
  const isPharmaRubric = pillarId?.startsWith("pharma-") || text.includes("GxP") || text.includes("21 CFR Part 11") || text.includes("холодовая цепь");

  if (isPharmaRubric) {
    const hasDisclaimer = text.toLowerCase().includes("документации производителя") || text.toLowerCase().includes("характеристики уточняйте");
    if (!hasDisclaimer) {
      deductions += 20;
      driftReport.push({
        rule: "pharma_disclaimer_check",
        passed: false,
        details: "Отклонение: отсутствует обязательный фарм-дисклеймер производителю в конце текста",
      });
    } else {
      driftReport.push({
        rule: "pharma_disclaimer_check",
        passed: true,
        details: "Соблюдено: обязательный дисклеймер производителю присутствует",
      });
    }

    if (pillarId === "pharma-compliance-explained") {
      const hasTerms = /21 CFR Part 11|Audit Trail|ERES|FDA|EMA|GxP/i.test(text);
      if (!hasTerms) {
        deductions += 20;
        driftReport.push({
          rule: "gxp_terms_check",
          passed: false,
          details: "Отклонение: отсутствуют ключевые термины регуляторного комплаенса (21 CFR Part 11, Audit Trail, ERES)",
        });
      } else {
        driftReport.push({
          rule: "gxp_terms_check",
          passed: true,
          details: "Соблюдено: ключевые нормативные термины GxP присутствуют",
        });
      }
    } else if (pillarId === "pharma-cold-chain-story") {
      const hasColdTerms = /холодовая цепь|cold chain|GDP|температур|контроль/i.test(text);
      if (!hasColdTerms) {
        deductions += 20;
        driftReport.push({
          rule: "cold_chain_terms_check",
          passed: false,
          details: "Отклонение: отсутствуют ключевые термины холодовой цепи и GDP логистики",
        });
      } else {
        driftReport.push({
          rule: "cold_chain_terms_check",
          passed: true,
          details: "Соблюдено: терминология холодовой цепи присутствует",
        });
      }
    }
  }

  // 6. Instagram Caption Length Limit
  if (platform === "instagram" && text.length > 450) {
    deductions += 25;
    driftReport.push({
      rule: "instagram_caption_length",
      passed: false,
      details: `Отклонение: длина подписи Instagram (${text.length} симв.) превышает лимит в 400-450 символов`,
    });
  } else if (platform === "instagram") {
    driftReport.push({
      rule: "instagram_caption_length",
      passed: true,
      details: `Соблюдено: длина подписи Instagram (${text.length} симв.) соответствует нормативу`,
    });
  }

  // 7. Dynamic Terminology Validation Engine (Niche Glossary & Mandatory Terms)
  if (terminologyRules) {
    const termRes = validateTerminology(text, terminologyRules, pillarId);
    deductions += termRes.deductions;
    driftReport.push(...termRes.driftReport);
  }

  const alignmentScore = Math.max(0, 100 - deductions);

  return { alignmentScore, driftReport };
}

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", service: "agent-evaluator" });
});

app.post("/evaluate", async (req: Request, res: Response) => {
  try {
    let { runId, tenantId, platform, text, pillarId, targetLanguage } = req.body as EvaluateRequest;
    if (!text || !platform) {
      return res.status(400).json({ error: "Missing required fields: text, platform" });
    }

    // Auto-fallback: if runId is provided but tenantId or pillarId are omitted, resolve from DB
    if (runId && (!tenantId || !pillarId)) {
      try {
        const runDoc = await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).findOne({ runId });
        if (runDoc) {
          if (!tenantId) tenantId = runDoc.tenantId;
          if (!pillarId) pillarId = runDoc.contentPillarId;
        }
      } catch (err) {
        console.warn(`Failed to resolve tenantId/pillarId from pipeline_runs for runId: ${runId}`);
      }
    }

    let terminologyRules: TerminologyRules | undefined;
    if (tenantId) {
      try {
        const profile = await getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES).findOne({ tenantId });
        if (profile?.terminologyRules) {
          terminologyRules = profile.terminologyRules;
        }
      } catch (err) {
        console.warn(`Failed to fetch IndustryProfile for tenantId: ${tenantId}`);
      }
    }

    const { alignmentScore, driftReport } = evaluateText({ runId, tenantId, platform, text, pillarId, targetLanguage, terminologyRules });

    // Store evaluation log in MongoDB if runId provided
    if (runId) {
      const col = getCollection<GoldenEvaluationDoc>(Collections.GOLDEN_EVALUATIONS);
      await col.insertOne({
        runId,
        platform,
        alignmentScore,
        driftReport,
        evaluatedAt: new Date(),
      });
    }

    res.json({
      runId,
      platform,
      alignmentScore,
      driftReport,
      isGoldenMatch: alignmentScore >= 80,
    });
  } catch (err: any) {
    console.error("Evaluation error:", err);
    res.status(500).json({ error: "Failed to evaluate text against Golden Datasets" });
  }
});

async function start() {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    console.log(`[agent-evaluator] Connected to Mongo at ${MONGO_URI}/${MONGO_DB_NAME}`);
    app.listen(PORT, () => {
      console.log(`[agent-evaluator] Microservice running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start agent-evaluator:", err);
    process.exit(1);
  }
}

start();
