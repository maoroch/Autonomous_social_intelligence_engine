import "dotenv/config";
import express from "express";
import { createWorker, createQueue } from "@pipeline/shared/queue";
import { createLogger } from "@pipeline/shared/logger";
import { QueueName, PipelineStage } from "@pipeline/shared";
import {
  AgentJobSchema,
  type AgentJob,
  PipelineEventSchema,
  type PipelineEvent,
  WritingOutputSchema,
  type IndustryProfile,
} from "@pipeline/shared/schemas";
import { AiClient, checkNumericGrounding, retrieveRelevantChunks, formatFactsForPrompt, type RetrievableChunk } from "@pipeline/shared/ai";
import { connectMongo, getCollection, Collections, type PipelineRunDoc, type IndustryProfileDoc, type FactChunkDoc } from "@pipeline/shared/db";
import { ObjectId } from "mongodb";

const logger = createLogger("agent-writing");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const PORT = Number(process.env.PORT ?? 4004);
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

const openrouterApiKey = process.env.OPENROUTER_API_KEY ?? "";
const geminiApiKey = process.env.GEMINI_API_KEY ?? "";
const groqApiKey = process.env.GROQ_API_KEY ?? "";

const aiClient = new AiClient({
  geminiApiKey,
  openrouterApiKey,
  groqApiKey,
  redisUrl: REDIS_URL,
});

const DEFAULT_PROFILE = {
  topics: ["Node.js", "Next.js", "AI", "SaaS", "Backend", "Automation", "Supabase"],
  forbidden_words: ["crypto", "web3", "nft"],
  cta_style: "Задайте открытый вопрос в конце для вовлечения",
  use_emoji: true,
  tone: "профессиональный, но доступный, без лишней \"воды\"",
};

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

  try {
    return JSON.parse(result);
  } catch (err) {
    const firstBrace = result.indexOf("{");
    const lastBrace = result.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = result.substring(firstBrace, lastBrace + 1);
      return JSON.parse(extracted);
    }
    throw err;
  }
}

function sanitizeLlmOutput(rawObj: any): any {
  if (!rawObj || typeof rawObj !== "object") {
    throw new Error("LLM did not return an object");
  }

  const text = typeof rawObj.text === "string" ? rawObj.text.trim() : "No text generated";
  const hook = typeof rawObj.hook === "string" ? rawObj.hook.trim() : "No hook generated";
  const cta = typeof rawObj.cta === "string" ? rawObj.cta.trim() : "No CTA generated";

  return {
    text,
    hook,
    cta,
  };
}

async function processWritingJob(job: AgentJob): Promise<unknown> {
  logger.info({ runId: job.runId }, "Starting text generation for the LinkedIn post...");

  // 1. Получаем выбранную тему из БД
  const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const run = await runsCol.findOne({ runId: job.runId });
  const topic = run?.topic ?? { title: "Rise of AI and Tech", summary: "" };

  // 2. Получаем профиль автора из БД
  const profilesCol = getCollection(Collections.AUTHOR_PROFILES);
  let dbProfile = null;
  if (run?.profileId) {
    try {
      dbProfile = await profilesCol.findOne({ _id: new ObjectId(run.profileId) });
    } catch (err) {
      logger.warn({ runId: job.runId, profileId: run.profileId }, "Failed to find specified profile, falling back to default");
    }
  }
  if (!dbProfile) {
    dbProfile = await profilesCol.findOne({});
  }
  const authorProfile = dbProfile
    ? {
      topics: Array.isArray(dbProfile.topics) ? dbProfile.topics : DEFAULT_PROFILE.topics,
      forbidden_words: Array.isArray(dbProfile.forbidden_words) ? dbProfile.forbidden_words : DEFAULT_PROFILE.forbidden_words,
      cta_style: typeof dbProfile.cta_style === "string" ? dbProfile.cta_style : DEFAULT_PROFILE.cta_style,
      use_emoji: typeof dbProfile.use_emoji === "boolean" ? dbProfile.use_emoji : DEFAULT_PROFILE.use_emoji,
      tone: typeof dbProfile.tone === "string" ? dbProfile.tone : DEFAULT_PROFILE.tone,
    }
    : DEFAULT_PROFILE;

  // Мультиарендность: определяем tenantId и подгружаем IndustryProfile.
  const tenantId: string = run?.tenantId ?? dbProfile?.tenantId ?? "software-development-default";
  let industryProfile: IndustryProfile | undefined;
  try {
    const doc = await getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES).findOne({ tenantId });
    if (doc) industryProfile = doc;
  } catch (err) {
    logger.warn({ err, tenantId }, "Failed to load IndustryProfile — proceeding with default tech-portal writing style");
  }
  const isNicheVertical = !!industryProfile && industryProfile.verticalName !== "software-development";

  // 3. Получаем стратегию из payload
  const strategy = job.payload ?? {};

  // 3.5. Получаем примеры стилей (Golden Dataset) из базы со строгой изоляцией по рубрикам
  const targetPillarId = (job.payload as any)?.targetPillarId || (run as any)?.targetPillarId || (strategy as any)?.content_pillar_id || run?.contentPillarId || "";
  const isTestoTenant = tenantId === "testo" || targetPillarId.startsWith("pharma-");

  let goldenPosts: any[] = [];
  try {
    if (isTestoTenant) {
      const testoCol = getCollection(Collections.GOLDEN_TESTO_PHARMA);
      goldenPosts = await testoCol.find({ pillarId: targetPillarId }).limit(2).toArray();
      if (goldenPosts.length === 0 && targetPillarId) {
        // Strict isolation: if no exact pillar match, search by tenant without cross-rubric fallback
        goldenPosts = await testoCol.find({}).limit(2).toArray();
      }
    } else {
      const goldenCol = getCollection(Collections.GOLDEN_WRITING);
      const selectedFormat = strategy.format || "tutorial";
      const filter = targetPillarId
        ? { $or: [{ pillarId: targetPillarId }, { format: selectedFormat }] }
        : { format: selectedFormat };
      goldenPosts = await goldenCol.find(filter).limit(2).toArray();
    }
  } catch (err) {
    logger.warn({ err, tenantId }, "Failed to fetch golden posts style examples");
  }

  let fewShotText = "";
  if (goldenPosts.length > 0) {
    fewShotText = `\nSTYLE EXAMPLES (FEW-SHOT EXAMPLES FOR THIS SPECIFIC RUBRIC):
Here are examples of high-performing posts matching strictly this content rubric. 
Study their tone, spacing, scannability, list structure, hook strength, and copy their style:
${goldenPosts.map((gp, i) => `
--- Example ${i + 1} ---
Hook: ${gp.hook || ""}
Text:
${gp.text || gp.caption || ""}
${gp.cta ? `CTA: ${gp.cta}` : ""}
----------------------`).join("\n")}
`;
  }

  // ---------- Мультиарендная адаптация стиля письма (TZ_v3_instagram_testo_portal.md, раздел 2.2) ----------
  const rawTargetPillar = (job.payload as any)?.targetPillarId || (run as any)?.targetPillarId || (strategy as any)?.content_pillar_id || run?.contentPillarId || "";
  const topicTitle = (topic?.title as string) || (run?.topic?.title as string) || "";

  let styleRulesBlock = "";
  let complianceBlock = "";
  let glossaryBlock = "";
  let platformBlock = "";
  let platformLabel = "LinkedIn";
  let ctaInstruction = authorProfile.cta_style;
  let emojiInstruction = authorProfile.use_emoji ? "Use relevant emojis sparingly to make the text lively." : "Do NOT use emojis.";
  let retrievedFacts: RetrievableChunk[] = [];

  if (isNicheVertical && industryProfile) {
    const rules = industryProfile.contentStyleRules;
    const adaptation = industryProfile.platformAdaptation[0];
    platformLabel = adaptation?.platform === "instagram" ? "Instagram" : adaptation?.platform ?? "Instagram";

    emojiInstruction =
      rules.maxEmojis === 0
        ? "Do NOT use emojis. This is a strict formal B2B industry — emojis undermine credibility."
        : `Use at most ${rules.maxEmojis} emoji(s) total, and only where it adds genuine clarity, not decoration.`;

    ctaInstruction =
      rules.hashtagStrategy === "none"
        ? "Do not add hashtags."
        : `Add approximately ${adaptation?.hashtagCount ?? 8} relevant hashtags at the end, mixing broad industry tags and specific niche tags.`;

    const ctaStyleInstruction =
      adaptation?.ctaStyle === "soft"
        ? 'Use a SOFT call to action (e.g. "Save this post", "More in bio") — never pushy sales language like "Buy now".'
        : "Use a direct call to action.";

    styleRulesBlock = `\nFormality level: ${rules.formalityLevel}. ${ctaStyleInstruction}
${rules.forbiddenPhrases.length > 0 ? `Additionally forbidden phrases (marketing clichés for this brand): ${rules.forbiddenPhrases.join(", ")}.` : ""}\n`;

    if (rules.requiredDisclaimers.length > 0) {
      complianceBlock = `\nMANDATORY DISCLAIMER(S): You MUST include the following disclaimer text verbatim somewhere in the post (naturally integrated, not just appended): ${rules.requiredDisclaimers.join(" ")}\n`;
    }

    if (industryProfile.complianceConfig.factCheckRequired) {
      // RAG-слой: подтягиваем релевантные факты из базы IndustryProfile перед генерацией,
      // чтобы модель цитировала числа ИЗ базы, а не "додумывала" их (см. shared-lib/src/ai/retrieval.ts).
      try {
        const factChunksCol = getCollection<FactChunkDoc>(Collections.FACT_CHUNKS);
        const allChunks = await factChunksCol.find({ tenantId }).toArray();
        const query = `${topic.title} ${topic.summary} ${strategy.core_idea ?? ""} ${rawTargetPillar}`;
        retrievedFacts = retrieveRelevantChunks(query, allChunks, 3);
      } catch (err) {
        logger.warn({ err, tenantId }, "Failed to retrieve fact chunks for RAG grounding");
      }

      if (retrievedFacts.length > 0) {
        complianceBlock += `\nCRITICAL FACTUAL ACCURACY REQUIREMENT: This is a regulated industry. Below are VERIFIED FACTS retrieved from the official spec database. If you state any numeric technical characteristic (measurement range, accuracy, certification, etc.), it MUST come from this list, cited close to verbatim. If a needed number is not in this list, write about the concept qualitatively instead of inventing a figure.

VERIFIED FACTS:
${formatFactsForPrompt(retrievedFacts)}
`;
      } else {
        complianceBlock += `\nCRITICAL FACTUAL ACCURACY REQUIREMENT: This is a regulated industry, and no verified fact sheet was found for this topic. NEVER invent, guess, or approximate specific numeric technical characteristics (measurement ranges, accuracy percentages, certification numbers, etc.). Write about the concept qualitatively instead of inventing any figure.\n`;
      }
    }

    if (industryProfile.glossary.length > 0) {
      let filteredGlossary = industryProfile.glossary;
      const isGasTopic = rawTargetPillar.startsWith("gas-") || /газоанализатор|выброс|пелтье|testo\s*350|testo\s*300|testo\s*340|testo\s*310|котельн/i.test(`${topic.title} ${topic.summary}`);
      if (isGasTopic) {
        filteredGlossary = industryProfile.glossary.filter(g => !/21\s*CFR|GxP|холодов|лиофилиз/i.test(g.term));
      } else if (rawTargetPillar.startsWith("pharma-")) {
        filteredGlossary = industryProfile.glossary.filter(g => !/избытка\s*воздуха|Пельтье|qA|расширение\s*диапазона/i.test(g.term));
      }
      glossaryBlock = `\nINDUSTRY GLOSSARY (use these terms precisely):
${filteredGlossary.map((g) => `- "${g.term}"${g.definition ? `: ${g.definition}` : ""}`).join("\n")}\n`;
    }

    if (adaptation) {
      platformBlock = `\nPlatform: ${platformLabel}. Maximum caption length: ~${adaptation.maxCaptionLength} characters — be concise, this is NOT a long-form LinkedIn article. Visual emphasis is ${adaptation.visualEmphasis} — the image/carousel carries most of the information, the caption should hook and complement it, not repeat it in full.\n`;
    }
  }

  // 4. Формируем промпт к LLM
  const writerDomain = isNicheVertical
    ? `You are a professional social media copywriter specializing in B2B content for the "${industryProfile!.verticalName}" industry, writing for ${platformLabel}.`
    : "You are a professional LinkedIn content writer specializing in tech/programming topics.";

  const contentPillarId = run?.contentPillarId || (strategy as any)?.content_pillar_id || (job.payload as any)?.targetPillarId;

  let rubricWritingInstruction = "";
  if (contentPillarId === "pet-projects-showcase") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Подборка pet проектов для твоего github"):
- Structure this post as a curated showcase of 3-4 creative pet-project ideas to build for a GitHub portfolio.
- For each project, specify:
  1. Project Title & Concept
  2. Recommended Tech Stack (e.g. Next.js 15, TypeScript, Tailwind, Supabase, OpenAI API)
  3. Key Architecture Features / Key Learning Takeaways.
- Include practical setup guidelines. Keep it super engaging and actionable for software engineers!`;
  } else if (contentPillarId === "github-trending-repos") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Подборка github репозитории"):
- Structure this post as a curated showcase of 3-4 trending open-source GitHub repositories/tools.
- STRICT RULE: Every repository mentioned MUST BE UNIQUE. Do NOT feature or repeat the same repository twice.
- COVER SLIDE TITLE FORMULA (Slide 1): Must use a high-converting headline formula with sub-caption:
  * Productivity: "5 GitHub Repos That Will Save You 10+ Hours This Week" (Sub-caption: "Stop reinventing the wheel. Bookmark these today 📌")
  * Senior/Architecture: "7 Production-Ready Repos Senior Engineers Keep Quiet About" (Sub-caption: "Learn how large-scale applications are actually built.")
  * Hidden Gems: "5 Underrated GitHub Repos You'll Wish You Found Sooner" (Sub-caption: "Small tools with insanely high impact.")
- REPOSITORY CARDS (Slides 2..N):
  * Slide Title: Strictly the Repository Name ONLY (e.g. "sqlfluff", "airllm", "bonsai").
  * Slide Description: A concise, punchy 2-3 sentence paragraph explaining what the project is, what it does, and why it is valuable to the reader. Do NOT use bullet arrows (→).
- For each repository, specify:
  1. Repo Name & Star Badge (e.g., ⭐ 8.5k stars)
  2. Primary Language & Core Functionality (What problem it solves)
  3. Verified GitHub Link format (e.g., https://github.com/owner/repo)
- Include concise developer highlights!`;
  } else if (contentPillarId === "tech-discussions-debates") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Обсуждения и споры вокруг технологий"):
- Structure this post as a provocative engineering debate comparing two contrasting tech stacks or architectural approaches (e.g. Monolith vs Microservices, REST vs gRPC, SPA vs SSR, ORM vs Raw SQL, Node.js vs Go).
- COVER SLIDE TITLE FORMULA (Slide 1): High-converting battle title with sub-caption:
  * Formula: "[Option A] vs [Option B]: Which Architecture Wins in 2026?" (Sub-caption: "Pros, cons, and when to pick each approach ⚔️")
- REPOSITORY / ARGUMENT CARDS (Slides 2..N):
  * Slide 2: Option A — Key Advantages & Ideal Use Cases
  * Slide 3: Option B — Key Advantages & Ideal Use Cases
  * Slide 4: Real-World Performance & Trade-offs (Cost, Complexity, Team Scalability)
  * Slide 5: Final Engineering Verdict & Guidelines
- Tone: Analytical, objective, encouraging comments and discussion among developers!`;
  } else if (contentPillarId === "pharma-compliance-explained") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("GxP на пальцах / 21 CFR Part 11"):
- Structure this post as an educational breakdown explaining complex regulatory GxP & 21 CFR Part 11 requirements in plain, accessible terms.
- Focus on key audit points: Data Integrity, Electronic Signatures, Audit Trail, and Continuous Monitoring with Testo equipment.
- Use relevant pharmaceutical hashtags ONLY (e.g., #pharma #gxp #21cfrpart11 #testo #фармацевтика). Do NOT use tech/GitHub hashtags.`;
  } else if (contentPillarId === "pharma-cold-chain-story") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Холодовая цепь без слепых зон"):
- Structure this post as a risk-analysis journey showing where temperature control breaks during pharmaceutical transport (GDP logistics).
- Emphasize the impact of temperature excursions on drug batch degradation and the necessity of 3-tier data logging redundancy with Testo Saveris.
- Use relevant cold chain hashtags ONLY (e.g., #coldchain #pharma #logistics #testo #холодоваяцепь). Do NOT use tech/GitHub hashtags.`;
  } else if (contentPillarId === "pharma-audit-ready") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Готовы к инспекции? / Audit Preparedness"):
- Structure this post as a checklist debunking common myths about FDA/EMA audit readiness.
- Contrast naive logging ("we record data") with true GxP compliance (Traceability, ERES compliance, immutable logs with Testo).
- Use relevant audit hashtags ONLY (e.g., #audit #gxp #pharma #testo #инспекция). Do NOT use tech/GitHub hashtags.`;
  } else if (contentPillarId === "testo-device-breakdown") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Разбор прибора Testo / Equipment Breakdown"):
- Structure this post as an in-depth B2B device spotlight analyzing a specific Testo instrument (e.g. Testo Saveris Pharma, Testo 174T, Testo 883, Testo 440).
- Highlight key physical specs: measurement range, accuracy tolerances, IP protection class, battery/power specs, and memory capacity.
- Explain the precise B2B business problem solved: eliminating human paper log errors, automated alarm dispatch via SMS/Email, passing FDA/EMA audits without findings.
- Use relevant device hashtags ONLY (e.g., #testo #testosaveris #testo174t #testo883 #измерительныеприборы #gxp). Do NOT use tech/GitHub hashtags.`;
  } else if (contentPillarId === "marvel-mcu-lore") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Marvel & Geek Lore"):
- Structure this post as an exciting geek-breakdown of Marvel Cinematic Universe (MCU) news, trailers, fan theories, Easter eggs, or comic comparisons.
- Tone: Engaging, enthusiastic geek journalism with intriguing hooks and discussion-provoking questions in CTA.
- Use relevant Marvel/geek hashtags ONLY (e.g., #marvel #mcu #comics #geek #cinema).`;
  } else if (contentPillarId === "cinema-history-backstage") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("История кино и Закулисье"):
- Structure this post as a captivating "How it was made" behind-the-scenes story of iconic film scenes, stunt work without double, revolutionary VFX, or director/actor improvisations.
- Tone: Cinematic storytelling, fascinating production facts, and engaging tone.
- Use relevant cinema hashtags ONLY (e.g., #cinema #backstage #filmmaking #vfx #hollywood).`;
  } else if (contentPillarId === "box-office-analytics") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Индустрия и Кассовые сборы"):
- Structure this post as an insightful box office & movie industry breakdown analyzing weekend grosses, blockbuster budgets, box office records/flops, or streaming strategies (Netflix, HBO Max, Disney+).
- Tone: Analytical, sharp, engaging for film industry enthusiasts.
- Use relevant industry hashtags ONLY (e.g., #boxoffice #cinema #hollywood #streaming #movieindustry).`;
  } else if (contentPillarId === "daily-quick-recap") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Дайджест и Новости дня"):
- Structure this post as a fast-paced 60-second express recap of major breaking movie news, castings, premiere date announcements, and fresh trailers.
- Tone: Dynamic, concise, hype-driven news digest.
- Use relevant movie news hashtags ONLY (e.g., #cinemanews #trailers #casting #premiere #movies).`;
  } else if (contentPillarId === "product-in-action" || contentPillarId === "before-after" || contentPillarId === "myths") {
    rubricWritingInstruction = `\nSPECIFIC RUBRIC INSTRUCTION ("Industrial Measurement & HVAC Calibration"):
- Structure this post around real-world industrial measurement scenarios (HVAC/R, thermal imaging, calibration certificates).
- Focus on practical field challenges, accurate measurement ranges, and risk prevention.`;
  }

  // Достаем проверенные источники из стадии trend
  const stageResultsCol = getCollection(Collections.STAGE_RESULTS);
  const trendResultDoc = await stageResultsCol.findOne({ runId: job.runId, stage: PipelineStage.TREND });
  const trendItems = (trendResultDoc?.result as any)?.items ?? [];

  const extractGithubUrl = (text: string): string => {
    if (!text || typeof text !== "string") return "";
    const m = text.match(/(?:https?:\/\/)?github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i);
    if (m && m[1] && !m[1].endsWith("/trending")) {
      return `https://github.com/${m[1].replace(/\/$/, "")}`;
    }
    return "";
  };

  const isGithubShowcase = !isTestoTenant && (rawTargetPillar === "github-trending-repos" || rawTargetPillar === "pet-projects-showcase" || (tenantId === "software-development-default" && /github/i.test(topicTitle)));

  const trendItemsList: { title: string; summary: string; url: string }[] = [];
  const seenUrls = new Set<string>();

  if (isGithubShowcase && Array.isArray(trendItems)) {
    for (const item of trendItems) {
      let foundUrl = extractGithubUrl(item.url);
      if (!foundUrl && Array.isArray(item.sources)) {
        for (const s of item.sources) {
          foundUrl = extractGithubUrl(s);
          if (foundUrl) break;
        }
      }
      if (!foundUrl) {
        foundUrl = extractGithubUrl(item.summary || "") || extractGithubUrl(item.title || "");
      }
      if (foundUrl && !seenUrls.has(foundUrl)) {
        seenUrls.add(foundUrl);
        trendItemsList.push({
          title: item.title,
          summary: item.summary || "",
          url: foundUrl,
        });
      }
    }
  }

  let verifiedSourcesBlock = "";
  if (isGithubShowcase && trendItemsList.length > 0) {
    verifiedSourcesBlock = `\nCRITICAL GITHUB REPOSITORY MATCHING REQUIREMENT:
You MUST feature 3-4 DIFFERENT repositories using the titles and exact URLs below:
${trendItemsList.map((t, idx) => `- Repo #${idx + 1}: "${t.title}" -> ${t.url}`).join("\n")}
DO NOT REPEAT THE SAME REPOSITORY OR THE SAME URL MULTIPLE TIMES. EVERY REPOSITORY MUST HAVE A UNIQUE URL.\n`;
  }

  const isRussianTenant = tenantId === "testo" || (industryProfile?.language?.includes("ru") ?? false);
  const isGasAnalyzerTopic = rawTargetPillar.startsWith("gas-") || /газоанализатор|выброс|пелтье|testo\s*350|testo\s*300|testo\s*340|testo\s*310|котельн|горелк/i.test(`${topicTitle} ${topic?.summary || ""}`);

  let productValueProp = "In every post, you MUST explicitly demonstrate how Testo measurement equipment solves industry challenges.";
  if (isGasAnalyzerTopic) {
    productValueProp = "In every post, you MUST explicitly demonstrate how Testo Gas Analyzers (Testo 350, Testo 300, Testo 340, Testo 310 II, Testo 316) solve industrial emissions monitoring, boiler/burner tuning, Peltier gas sample preparation (+3°C), and gas safety in Kazakhstan.";
  } else if (isTestoTenant) {
    productValueProp = "In every post, you MUST explicitly demonstrate how Testo measurement equipment (Testo Saveris Pharma, thermal imagers, data loggers, smart probes) solves pharmaceutical compliance challenges (automating 21 CFR Part 11, preventing batch loss in cold chain, audit readiness).";
  }

  const languageInstruction = isRussianTenant
    ? `\nCRITICAL LANGUAGE & TESTO BRAND REQUIREMENTS:
1. Language: The target audience for this portal (${tenantId}) is EXCLUSIVELY RUSSIAN-SPEAKING. You MUST write ALL fields ("text", "hook", "cta", and "ru_post") STRICTLY IN HIGH-QUALITY RUSSIAN. Do NOT write any English text.
2. Product Value Proposition: ${productValueProp}`
    : `\nLanguage: Write "text" in English for LinkedIn, and provide "ru_post" in Russian.`;

  let systemPrompt = "";
  if (isGithubShowcase) {
    systemPrompt = `You are a professional tech copywriter specializing in high-converting GitHub repository collections for software engineers.
Your task is to write a concise, highly engaging LinkedIn post featuring 3-4 trending open-source GitHub repositories.

STRICT FORMAT & LENGTH RULES:
1. Cover Title & Sub-caption (Slide 1):
   - Hook Title MUST follow a proven formula:
     * Productivity: "5 GitHub Repos That Will Save You 10+ Hours This Week"
     * Senior/Architecture: "7 Production-Ready Repos Senior Engineers Keep Quiet About"
     * Hidden Gems: "5 Underrated GitHub Repos You'll Wish You Found Sooner"
   - Sub-caption: Maximum 1 short sentence (under 90 characters, STRICTLY MAXIMUM 3 VISUAL LINES).
2. Repository Cards (Slides 2..N):
   - Title: MUST be strictly the Repository Name ONLY (e.g., "sqlfluff", "airllm", "bonsai").
   - Description: MUST be a rich, detailed 2 to 3 sentence paragraph (MUST BE 45 to 60 words, ~260-320 characters, EXACTLY 4 TO 5 VISUAL LINES). Explain: 1) What the project is, 2) Core capabilities & architecture, 3) Real developer productivity impact.
   - Do NOT use bullet arrows (→). Do NOT write multi-paragraph text blocks.
3. Tone & Words: Tone: ${authorProfile.tone}. Forbidden words: ${authorProfile.forbidden_words.join(", ")}.
${styleRulesBlock}${platformBlock}${verifiedSourcesBlock}${languageInstruction}
You must return a single, valid JSON object containing:
- "text": The complete text of the post.
- "hook": The first line (Hook) of the post.
- "cta": The final Call to Action string.

Output format:
{
  "text": "Full text of the post...",
  "hook": "Catchy first line...",
  "cta": "Engaging question at the end..."
}

Return ONLY valid raw JSON. Do NOT include markdown code blocks or conversational text.`;
  } else {
    systemPrompt = `${writerDomain}
Your job is to write an engaging, high-performing post based on the provided topic and content strategy.

Style Guidelines:
1. Tone: ${authorProfile.tone}
2. Hook: Create a very strong first line (Hook) that grabs attention immediately.
3. Readability: Write in short, scanable paragraphs (1-3 sentences maximum). Use bullet points and clean lists. Avoid large blocks/walls of text.
4. Emojis: ${emojiInstruction}
5. Call to Action: ${ctaInstruction}
6. Forbidden Words: Never use these words: ${authorProfile.forbidden_words.join(", ")}
${styleRulesBlock}${complianceBlock}${glossaryBlock}${platformBlock}${rubricWritingInstruction}${verifiedSourcesBlock}${fewShotText}${languageInstruction}
You must return a single, valid JSON object containing:
- "text": The complete text of the post (strictly in Russian for Testo portal).
- "hook": The first line (Hook) of the post.
- "cta": The final Call to Action string.
- "ru_post": An object containing the high-quality Russian post adaptation for Telegram & Threads:
  - "hook": Russian header starting with a single emoji (e.g. "⚡ 5 инструментов...")
  - "text": Full Russian post body, formatted into scanable paragraphs, ending with hashtags.
  - "hashtags": Array of relevant hashtags (e.g. ["#фармацевтика", "#GxP"])

Output format:
{
  "text": "Full text of the LinkedIn post...",
  "hook": "Catchy first line...",
  "cta": "Engaging question at the end...",
  "ru_post": {
    "hook": "⚡ 5 инструментов для оптимизации Node.js",
    "text": "⚡ 5 инструментов для оптимизации Node.js\n\nОптимизация производительности...",
    "hashtags": ["#nodejs", "#performance"]
  }
}

Return ONLY valid raw JSON. Do NOT include markdown code blocks or conversational text.`;
  }

  const userPrompt = `Here are the inputs for the post:

---
Topic:
Title: "${topic.title}"
Summary: "${topic.summary}"

Strategy:
Format: "${strategy.format || "tutorial"}"
Target Audience: "${strategy.target_audience || "Developers"}"
Core Idea: "${strategy.core_idea || ""}"
---

${job.extraInstructions ? `Additional guidance from Editor: ${job.extraInstructions}` : ""}

Please write the post and return the JSON.`;

  // Для регулируемых ниш (Testo и подобные) снижаем temperature — фактологическая точность
  // важнее творческой вариативности формулировок.
  const isRegulated = isNicheVertical && industryProfile!.complianceConfig.regulatedIndustry;
  const response = await aiClient.complete(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { temperature: isRegulated ? 0.3 : 0.7, preferredProvider: "gemini" },
  );

  logger.info({ runId: job.runId, provider: response.provider, model: response.model }, "Writing LLM generation complete");

  let parsedJson: any;
  try {
    parsedJson = parseCleanJson(response.text);
  } catch (err) {
    logger.error({ err, rawText: response.text }, "Failed to parse JSON from LLM response");
    throw new Error("LLM response was not valid JSON");
  }

  const sanitized = sanitizeLlmOutput(parsedJson);

  // Detect text language to prevent mixed English/Russian CTAs
  const isEnglishText = !/[а-яА-ЯёЁ]/.test(sanitized.text);

  const PRESET_CTAS_EN: Record<string, Record<string, string>> = {
    testo: {
      default: "Contact the official Testo distributor for certified equipment and calibration.",
    },
    "software-development-default": {
      "github-trending-repos": "Bookmark this roundup and share it with your dev colleagues!",
      "pet-projects-showcase": "Save these project ideas for your GitHub portfolio!",
      "tech-discussions-debates": "What approach do you use in your project? Share your thoughts in the comments!",
      default: "Share your thoughts in the comments below!",
    },
  };

  const PRESET_CTAS_RU: Record<string, Record<string, string>> = {
    testo: {
      "pharma-compliance-explained": "Заказывайте оригинальное оборудование Testo у официального дистрибьютора для полной гарантии, Госреестра СИ и калибровки.",
      "pharma-cold-chain-story": "Обращайтесь к официальному дистрибьютору Testo за решениями непрерывного температурного мониторинга холодовой цепи.",
      "pharma-audit-ready": "Подготовьтесь к аудиту GxP с цифровыми системами Testo от официального дистрибьютора.",
      default: "Заказывайте оригинальное оборудование Testo у официального дистрибьютора для полной гарантии и калибровки.",
    },
    "software-development-default": {
      "github-trending-repos": "Сохраните подборку в закладки и поделитесь с коллегами-разработчиками!",
      "pet-projects-showcase": "Сохраните идеи для своего портфолио на GitHub!",
      "tech-discussions-debates": "А какой подход используете вы в своём проекте? Напишите свои аргументы в комментариях!",
      default: "Поделитесь вашим мнением в комментариях!",
    },
  };

  const ctaMap = isEnglishText ? PRESET_CTAS_EN : PRESET_CTAS_RU;
  const presetCta = ctaMap[tenantId]?.[contentPillarId] || ctaMap[tenantId]?.["default"];

  if (presetCta) {
    sanitized.cta = presetCta;
    if (!sanitized.text.includes(presetCta)) {
      sanitized.text = `${sanitized.text.trim()}\n\n${presetCta}`;
    }
  }

  const verifiedGithubUrls = isGithubShowcase ? Array.from(new Set(trendItemsList.map(t => t.url).filter(u => u.length > 0))) : [];

  if (isGithubShowcase && verifiedGithubUrls.length > 0) {
    let urlIdx = 0;
    const usedUrls = new Set<string>();
    const githubUrlRegex = /https:\/\/github\.com\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?/g;
    sanitized.text = sanitized.text.replace(githubUrlRegex, (match: string) => {
      if (verifiedGithubUrls.includes(match) && !usedUrls.has(match)) {
        usedUrls.add(match);
        return match;
      }
      let substitute: string = verifiedGithubUrls[urlIdx % verifiedGithubUrls.length] || verifiedGithubUrls[0] || "https://github.com/trending";
      if (usedUrls.has(substitute) && verifiedGithubUrls.length > usedUrls.size) {
        const unused = verifiedGithubUrls.find((u: string) => !usedUrls.has(u));
        if (unused) substitute = unused;
      }
      usedUrls.add(substitute);
      urlIdx++;
      return substitute;
    });
  }

  // Валидируем финальный результат Zod схемой
  const validated = WritingOutputSchema.parse(sanitized);

  // Автоматически сохраняем качественный русскую версию (ru_post) в адаптации Telegram & Threads для экономии токенов Gemini
  if (sanitized.ru_post && sanitized.ru_post.text) {
    const cleanRu = applyDeterministicPostProcessing(sanitized.ru_post.text, "telegram", sanitized.ru_post.hashtags || []);
    const adaptationData = {
      text: cleanRu.text,
      hook: sanitized.ru_post.hook || "",
      hashtags: sanitized.ru_post.hashtags || [],
      length: "long",
      alignmentScore: 100,
      evaluatedAt: new Date(),
    };
    await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).updateOne(
      { runId: job.runId },
      {
        $set: {
          "adaptations.telegram": adaptationData,
          "adaptations.threads": adaptationData,
          updatedAt: new Date(),
        },
      },
    );
    logger.info({ runId: job.runId }, "Pre-populated Telegram & Threads adaptations from unified ru_post");
  }

  // Детерминированная защита от галлюцинированных технических характеристик (см. shared-lib/src/ai/grounding.ts).
  // НЕ полагаемся только на промпт-инструкцию "не выдумывай цифры" — проверяем результат программно.
  if (industryProfile && industryProfile.complianceConfig.factCheckRequired) {
    const factsText = retrievedFacts.map((f) => f.content).join(" ");
    const sourceContext = `${topic.title} ${topic.summary} ${strategy.core_idea ?? ""} ${factsText}`;
    const grounding = checkNumericGrounding(validated.text, sourceContext);
    if (!grounding.ok) {
      logger.warn(
        { runId: job.runId, ungroundedClaims: grounding.ungroundedClaims },
        "Writing output contains numeric claims not found in source context — flagging run for mandatory compliance review",
      );
      await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).updateOne(
        { runId: job.runId },
        { $set: { needsComplianceReview: true, updatedAt: new Date() } },
      );
    }
  }

  const cleaned = applyDeterministicPostProcessing(validated.text, "linkedin", [], isTestoTenant);
  validated.text = cleaned.text;

  logger.info({ runId: job.runId }, "Post text generated successfully");
  return validated;
}

// ─── Deterministic Post-Processing Helper ─────────────────────────────────
export function applyDeterministicPostProcessing(
  rawText: string,
  platform: "linkedin" | "telegram" | "threads",
  defaultHashtags: string[] = [],
  isTesto: boolean = false
): { text: string; headerEmojiUsed: boolean; bodyEmojisStrippedCount: number } {
  let text = rawText.trim();
  if (isTesto) {
    // Strip accidental tech/github hashtags from Testo posts
    text = text.replace(/#(?:github|backend|softwareengineering|frontend|devops|typescript|python|code|repository|petprojects)\b/gi, "").replace(/[ \t]{2,}/g, " ").trim();
  } else {
    // Strip accidental pharma/Testo hashtags from Tech posts
    text = text.replace(/#(?:testo|gxp|pharma|комплаенс|холодоваяцепь|21cfrpart11|фармацевтика|фармпроизводство)\b/gi, "").replace(/[ \t]{2,}/g, " ").trim();
  }

  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  let bodyEmojisStrippedCount = 0;
  let headerEmojiUsed = false;

  const lines = text.split("\n");
  if (lines.length > 0 && lines[0] !== undefined) {
    let firstLine = lines[0].trim();
    if (platform === "telegram" || platform === "threads") {
      const match = firstLine.match(emojiRegex);
      if (match) {
        headerEmojiUsed = true;
      } else {
        firstLine = `📌 ${firstLine}`;
        headerEmojiUsed = true;
      }
      lines[0] = firstLine;

      // Body Emoji Stripper: Strip all emojis from lines 2+
      for (let i = 1; i < lines.length; i++) {
        const lineContent = lines[i];
        if (lineContent !== undefined) {
          const lineEmojis = lineContent.match(emojiRegex);
          if (lineEmojis) {
            bodyEmojisStrippedCount += lineEmojis.length;
            lines[i] = lineContent.replace(emojiRegex, "").replace(/[ \t]{2,}/g, " ");
          }
        }
      }
    }
  }

  text = lines.join("\n").trim();

  // Hashtags Sanitizer: Extract hashtags, strip from body, and append clean hashtag block at the absolute bottom
  const hashtagRegex = /#[\wа-яА-ЯёЁ_-]+/g;
  let matches = text.match(hashtagRegex) || [];
  let hashtags = Array.from(new Set(matches));

  if (isTesto) {
    hashtags = hashtags.filter(t => !/#(?:github|backend|softwareengineering|frontend|devops|typescript|python|code|repository|petprojects)\b/i.test(t));
  } else {
    hashtags = hashtags.filter(t => !/#(?:testo|gxp|pharma|комплаенс|холодоваяцепь|21cfrpart11|фармацевтика|фармпроизводство)\b/i.test(t));
  }

  if (hashtags.length === 0) {
    const fallbackTags = isTesto
      ? ["#testo", "#gxp", "#pharma", "#комплаенс"]
      : ["#github", "#backend", "#softwareengineering"];
    hashtags = defaultHashtags.length > 0 ? defaultHashtags : fallbackTags;
  }

  // Remove hashtags from main body text so they are not duplicated in the middle
  let cleanBody = text.replace(hashtagRegex, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  text = `${cleanBody}\n\n${hashtags.join(" ")}`;

  return { text, headerEmojiUsed, bodyEmojisStrippedCount };
}

const worker = createWorker<AgentJob>(
  QueueName.WRITING,
  async (job) => {
    const parsed = AgentJobSchema.parse(job.data);
    try {
      const result = await processWritingJob(parsed);
      const writingResult = result as { text: string; hook?: string; cta?: string };

      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      const runDoc = await runsCol.findOne({ runId: parsed.runId });
      const isTesto = runDoc?.tenantId === "testo" || (runDoc as any)?.templateSetId === "industrial-measurement-equipment" || (runDoc as any)?.contentPillarId?.startsWith("pharma-") || (runDoc as any)?.contentPillarId === "testo-device-breakdown";

      // Apply deterministic post-processing
      const cleaned = applyDeterministicPostProcessing(writingResult.text, "linkedin", [], isTesto);
      writingResult.text = cleaned.text;

      // ─── Golden Dataset Validation & Self-Correction Loop ───────────────────
      const EVALUATOR_URL = process.env.EVALUATOR_URL ?? "http://agent-evaluator:4008";
      try {
        let evalRes = await fetch(`${EVALUATOR_URL}/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: parsed.runId,
            platform: "linkedin",
            text: writingResult.text,
          }),
        });
        if (evalRes.ok) {
          let evalData = await evalRes.json() as {
            alignmentScore: number;
            driftReport: { rule: string; passed: boolean; details: string }[];
            isGoldenMatch: boolean;
          };

          // 🔄 Self-Correction Feedback Loop (Auto-Reflection Pass)
          if (!evalData.isGoldenMatch && evalData.alignmentScore < 85) {
            logger.warn(
              { runId: parsed.runId, alignmentScore: evalData.alignmentScore },
              "Drift detected — executing 1-pass Self-Correction LLM Pass",
            );
            const failedRulesText = evalData.driftReport
              .filter((r) => !r.passed)
              .map((r) => `- ${r.rule}: ${r.details}`)
              .join("\n");

            const correctionPrompt = `Предыдущий сгенерированный текст НЕ прошёл валидацию (Alignment Score: ${evalData.alignmentScore}%).
Нарушенные правила:
${failedRulesText}

Пожалуйста, перепишите текст, СТРОГО исправив указанные ошибки.
Оригинальный текст:
${writingResult.text}`;

            try {
              const retryResponse = await aiClient.complete([
                { role: "system", content: "Вы — строгий технический редактор. Исправьте текст согласно замечаниям." },
                { role: "user", content: correctionPrompt },
              ]);
              if (retryResponse.text) {
                const retryCleaned = applyDeterministicPostProcessing(retryResponse.text, "linkedin");
                writingResult.text = retryCleaned.text;

                const reEvalRes = await fetch(`${EVALUATOR_URL}/evaluate`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ runId: parsed.runId, platform: "linkedin", text: writingResult.text }),
                });
                if (reEvalRes.ok) {
                  evalData = await reEvalRes.json() as any;
                  logger.info({ runId: parsed.runId, newScore: evalData.alignmentScore }, "Self-Correction Pass finished");
                }
              }
            } catch (retryErr) {
              logger.warn({ retryErr, runId: parsed.runId }, "Self-correction LLM call failed — keeping original text");
            }
          }

          await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).updateOne(
            { runId: parsed.runId },
            {
              $set: {
                "evaluation.writing": {
                  alignmentScore: evalData.alignmentScore,
                  driftReport: evalData.driftReport,
                  isGoldenMatch: evalData.isGoldenMatch,
                  evaluatedAt: new Date(),
                },
                updatedAt: new Date(),
              },
            },
          );
          logger.info({ runId: parsed.runId, alignmentScore: evalData.alignmentScore }, "Writing evaluation complete");
        }
      } catch (evalErr) {
        logger.warn({ evalErr, runId: parsed.runId }, "Evaluator call failed (non-blocking)");
      }
      // ───────────────────────────────────────────────────────────────────

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
      logger.error({ err, runId: parsed.runId }, "writing job failed");
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
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "agent-writing" }));

app.post("/adapt", async (req, res) => {
  try {
    const { runId, topicTitle, topicSummary, existingText, targetPlatform, textLength, pillarId } = req.body;
    if (!targetPlatform || (!topicTitle && !existingText)) {
      return res.status(400).json({ error: "Missing required fields: targetPlatform, and topicTitle or existingText" });
    }

    let tenantId = req.body.tenantId;
    if (!tenantId && runId) {
      const runDoc = await getCollection(Collections.PIPELINE_RUNS).findOne({ runId });
      if (runDoc) tenantId = runDoc.tenantId;
    }
    const isTesto = tenantId === "testo" || (pillarId && (pillarId.startsWith("pharma-") || pillarId.startsWith("industrial-")));

    const platform = targetPlatform === "threads" ? "threads" : "telegram";
    const lengthMode = textLength === "short" ? "short" : "long";

    // 1. Fetch Golden Dataset examples
    let goldenExamplesText = "";
    try {
      const collectionName = isTesto
        ? Collections.GOLDEN_TESTO_PHARMA
        : (platform === "threads" ? Collections.GOLDEN_RU_THREADS : Collections.GOLDEN_RU_TELEGRAM);
      const col = getCollection(collectionName);
      const query = pillarId ? { $or: [{ pillarId }, { pillarId: "all" }, { pillarId: { $exists: false } }] } : {};
      const docs = await col.find(query).limit(3).toArray();
      if (docs.length > 0) {
        goldenExamplesText = `\n\nЭТАЛОННЫЕ ПРИМЕРЫ (GOLDEN DATASET):\n` + docs.map((d: any, idx: number) => `--- ПРИМЕР ${idx + 1} ---\n${d.expected_output?.text || d.text}`).join("\n\n");
      }
    } catch (err) {
      logger.warn({ err }, "Could not load golden dataset for adaptation");
    }

    // 2. Build Prompt
    const systemPrompt = isTesto
      ? `Вы — эксперт по измерительным приборам и фармацевтическому комплаенсу Testo. Напишите пост для ${platform === "threads" ? "Threads" : "Telegram"} строго на РУССКОМ языке.

КРИТИЧЕСКИЕ ПРАВИЛА И ОГРАНИЧЕНИЯ:
1. ЯЗЫК: 100% профессиональный русский язык.
2. ТОН: Экспертный, убедительный тон. Фокус на 21 CFR Part 11, GxP, точности измерений и оборудовании Testo.
3. ЭМОДЗИ (СТРОГОЕ ПРАВИЛО): Эмодзи разрешены ТОЛЬКО в первой строке заглавия (например 📌 или ⚡). В основном теле текста использование эмодзи ЗАПРЕЩЕНО.
4. ДЛИНА ТЕКСТА: ${lengthMode === "short" ? "Краткий емкий пост (~400-600 символов)" : "Подробный разбор (~1500-2200 символов)"}.
5. ХЭШТЕГИ: В самом конце поста обязательно добавьте блок из 3-5 тематических фармацевтических хэштегов (например #testo #pharma #gxp #21cfrpart11 #комплаенс). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать IT/ПО хэштеги (#github, #backend, #softwareengineering).

Отвечайте в формате JSON:
{
  "hook": "Заголовок поста с одним эмодзи",
  "text": "Полный текст поста с заголовком и хэштегами внизу",
  "hashtags": ["#tag1", "#tag2"]
}`
      : `Вы — ведущий технический копирайтер IT-портала. Напишите пост для ${platform === "threads" ? "Threads" : "Telegram"} строго на РУССКОМ языке.

КРИТИЧЕСКИЕ ПРАВИЛА И ОГРАНИЧЕНИЯ:
1. ЯЗЫК: 100% профессиональный русский язык.
2. ТОН: Строго профессиональный инженерный тон без эмоций и лишней воды.
3. ЭМОДЗИ (СТРОГОЕ ПРАВИЛО): Эмодзи разрешены ТОЛЬКО в первой строке заглавия (например 📌 или ⚡). В основном теле текста (строки 2 и далее) использование эмодзи КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО.
4. ДЛИНА ТЕКСТА: ${lengthMode === "short" ? "Краткий емкий пост (~400-600 символов)" : "Подробный разбор (~1500-2200 символов)"}.
5. ХЭШТЕГИ: В самом конце поста обязательно добавьте блок из 3-5 тематических хэштегов (например #github #backend #architecture).

Отвечайте в формате JSON:
{
  "hook": "Заголовок поста с одним эмодзи",
  "text": "Полный текст поста с заголовком и хэштегами внизу",
  "hashtags": ["#tag1", "#tag2"]
}`;

    const userPrompt = `Тема: ${topicTitle || (isTesto ? "Фарм Комплаенс Testo" : "IT Разбор")}\nКраткая суть: ${topicSummary || ""}\nИсходный LinkedIn текст: ${existingText || ""}${goldenExamplesText}`;

    const aiRes = await aiClient.complete([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const parsed = parseCleanJson(aiRes.text);

    // Ensure hook starts with an emoji
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    let rawHook = (parsed.hook || topicTitle || "Разбор технологии").trim();
    if (!emojiRegex.test(rawHook.slice(0, 4))) {
      rawHook = `📌 ${rawHook}`;
    }

    let fullText = (parsed.text || "").trim();
    // If fullText doesn't start with rawHook, prepend it neatly
    if (!fullText.startsWith(rawHook)) {
      // Remove any existing leading emoji/header from description if duplicated
      const cleanBody = fullText.replace(/^[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*\s*[^\n]+\n*/u, "").trim();
      fullText = `${rawHook}\n\n${cleanBody.length > 0 ? cleanBody : fullText}`;
    }

    if (isTesto) {
      fullText = fullText.replace(/#(?:github|backend|softwareengineering|frontend|devops|typescript|python|code|repository|petprojects)\b/gi, "").replace(/\s{2,}/g, " ").trim();
    }

    // Ensure hashtags block is present at the end of fullText
    const hashtagRegex = /#[\wа-яА-ЯёЁ_-]+/g;
    if (!hashtagRegex.test(fullText)) {
      const defaultHashtags = Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0
        ? parsed.hashtags
        : (isTesto ? ["#testo", "#gxp", "#pharma", "#комплаенс"] : ["#programming", "#backend", "#softwareengineering", "#devtools"]);
      fullText = `${fullText}\n\n${defaultHashtags.join(" ")}`;
    }

    return res.json({
      runId,
      platform,
      length: lengthMode,
      hook: rawHook,
      text: fullText,
      hashtags: parsed.hashtags || [],
    });
  } catch (err: any) {
    logger.error({ err }, "Adaptation failed");
    return res.status(500).json({ error: err.message || "Failed to adapt text" });
  }
});

async function start() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  logger.info("Connected to MongoDB");

  app.listen(PORT, () => logger.info({ port: PORT }, "agent-writing listening"));
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
