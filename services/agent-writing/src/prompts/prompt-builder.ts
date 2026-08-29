import type { IndustryProfile } from "@pipeline/shared/schemas";
import { formatFactsForPrompt, type RetrievableChunk } from "@pipeline/shared/ai";
import { getRubricWritingInstruction } from "./rubric-instructions.js";

export interface PromptBuilderParams {
  topic: { title: string; summary: string; url?: string; fullArticleText?: string; batches?: string[] };
  strategy: Record<string, any>;
  authorProfile: {
    topics: string[];
    forbidden_words: string[];
    cta_style: string;
    use_emoji: boolean;
    tone: string;
  };
  industryProfile?: IndustryProfile;
  tenantId: string;
  contentPillarId: string;
  retrievedFacts: RetrievableChunk[];
  verifiedSourcesBlock: string;
  fewShotText: string;
  extraInstructions?: string;
  isGithubShowcase: boolean;
}

export function buildWritingPrompts(params: PromptBuilderParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const {
    topic,
    strategy,
    authorProfile,
    industryProfile,
    tenantId,
    contentPillarId,
    retrievedFacts,
    verifiedSourcesBlock,
    fewShotText,
    extraInstructions,
    isGithubShowcase,
  } = params;

  const isNicheVertical = !!industryProfile && industryProfile.verticalName !== "software-development";
  const isTestoTenant = tenantId === "testo" || contentPillarId.startsWith("pharma-") || contentPillarId.startsWith("gas-");
  const isRussianTenant = isTestoTenant || tenantId === "cinema-media" || (industryProfile?.language?.includes("ru") ?? false);
  const isGasAnalyzerTopic =
    contentPillarId.startsWith("gas-") ||
    (!contentPillarId.startsWith("pharma-") &&
      /газоанализатор|выброс|пелтье|testo\s*350|testo\s*300|testo\s*340|testo\s*310|котельн|горелк/i.test(
        `${topic.title} ${topic.summary}`
      ));

  let styleRulesBlock = "";
  let complianceBlock = "";
  let glossaryBlock = "";
  let platformBlock = "";
  let platformLabel = "LinkedIn";
  let ctaInstruction = authorProfile.cta_style;
  let emojiInstruction = authorProfile.use_emoji
    ? "Use relevant emojis sparingly to make the text lively."
    : "Do NOT use emojis.";

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
      if (isGasAnalyzerTopic) {
        filteredGlossary = industryProfile.glossary.filter((g) => !/21\s*CFR|GxP|холодов|лиофилиз/i.test(g.term));
      } else if (contentPillarId.startsWith("pharma-")) {
        filteredGlossary = industryProfile.glossary.filter((g) => !/избытка\s*воздуха|Пельтье|qA|расширение\s*диапазона/i.test(g.term));
      }
      glossaryBlock = `\nINDUSTRY GLOSSARY (use these terms precisely):
${filteredGlossary.map((g) => `- "${g.term}"${g.definition ? `: ${g.definition}` : ""}`).join("\n")}\n`;
    }

    if (adaptation) {
      platformBlock = `\nPlatform: ${platformLabel}. Maximum caption length: ~${adaptation.maxCaptionLength} characters — be concise, this is NOT a long-form LinkedIn article. Visual emphasis is ${adaptation.visualEmphasis} — the image/carousel carries most of the information, the caption should hook and complement it, not repeat it in full.\n`;
    }
  }

  const writerDomain = isNicheVertical
    ? `You are a professional social media copywriter specializing in B2B content for the "${industryProfile!.verticalName}" industry, writing for ${platformLabel}.`
    : "You are a professional LinkedIn content writer specializing in tech/programming topics.";

  const rubricWritingInstruction = getRubricWritingInstruction(contentPillarId);

  let languageInstruction = "";
  if (isTestoTenant) {
    let productValueProp = "In every post, you MUST explicitly demonstrate how Testo measurement equipment solves industry challenges.";
    if (contentPillarId.startsWith("pharma-")) {
      productValueProp =
        "In every post, you MUST explicitly demonstrate how Testo measurement equipment (Testo Saveris Pharma, Testo 190 T3/T4 CFR, Testo 174T, thermal imagers, data loggers) solves pharmaceutical compliance challenges (automating 21 CFR Part 11, preventing batch loss in cold chain, audit readiness).\nSTRICT PILLAR ISOLATION: Do NOT mention boilers, burner tuning, flue gases, NOx, CO, SO2, or boiler analyzers (Testo 300, Testo 350)!";
    } else if (isGasAnalyzerTopic) {
      productValueProp =
        "In every post, you MUST explicitly demonstrate how Testo Gas Analyzers (Testo 350, Testo 300, Testo 340, Testo 310 II, Testo 316) solve industrial emissions monitoring, boiler/burner tuning, Peltier gas sample preparation (+3°C), and gas safety in Kazakhstan.\nSTRICT PILLAR ISOLATION: Do NOT mention pharmaceuticals, biosensors, cleanroom GMP, or FDA 21 CFR Part 11!";
    } else {
      productValueProp =
        "In every post, you MUST explicitly demonstrate how Testo measurement equipment solves industry challenges. Do NOT mix boiler flue gas into pharmaceutical cleanrooms.";
    }
    languageInstruction = `\nCRITICAL LANGUAGE & TESTO BRAND REQUIREMENTS:
1. Language: The target audience for this portal (${tenantId}) is EXCLUSIVELY RUSSIAN-SPEAKING. You MUST write ALL fields ("text", "hook", "cta", and "ru_post") STRICTLY IN HIGH-QUALITY RUSSIAN. Do NOT write any English text.
2. Product Value Proposition: ${productValueProp}
3. STRICT TITLE & HOOK ACCURACY (NO HYBRID CHIMERAS):
- NEVER generate hybrid compound titles that pair an unrelated instrument with an unrelated standard (e.g. NEVER write "Testo 350: NFPA 70E...").
- The instrument in the hook, title, and body MUST strictly match the assigned pillar:
  * For gas leak detection: use Testo 316 (NOT Testo 350!).
  * For boiler tuning: use Testo 300 (NOT Testo 350!).
  * For industrial emissions: use Testo 350 or Testo 340.
  * For pharma cleanrooms: use Testo Saveris Pharma, Testo 190, or Testo 174T.`;
  } else if (tenantId === "cinema-media") {
    languageInstruction = `\nCRITICAL LANGUAGE & KINOPEEK BRAND REQUIREMENTS:
1. Language: The target audience for KinoPeek is Russian-speaking cinema, comic, MCU, and pop-culture fans. You MUST write ALL fields ("text", "hook", "cta", and "ru_post") STRICTLY IN HIGH-QUALITY RUSSIAN.
2. Niche Focus: You are writing pure entertainment and film media content (Marvel/MCU lore, easter eggs, box office records, director backstage, casting news, anime). NEVER mention industrial equipment, sensors, Testo, pharmaceutical compliance, or software code repositories!`;
  } else if (isRussianTenant) {
    languageInstruction = `\nLanguage: The target audience is Russian-speaking. You MUST write ALL fields ("text", "hook", "cta", and "ru_post") in natural, engaging Russian.`;
  } else {
    languageInstruction = `\nLanguage: Write "text" in English for LinkedIn, and provide "ru_post" in Russian.`;
  }

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
    const exampleHook =
      tenantId === "cinema-media"
        ? "🍿 Главные киноновости недели"
        : isTestoTenant
          ? "⚡ Требования GxP на фармпроизводстве"
          : "⚡ 5 инструментов для оптимизации Node.js";

    const exampleText =
      tenantId === "cinema-media"
        ? "🍿 Главные киноновости недели\\n\\nИнсайды со съемочной площадки..."
        : isTestoTenant
          ? "⚡ Требования GxP на фармпроизводстве\\n\\nКонтроль микроклимата..."
          : "⚡ 5 инструментов для оптимизации Node.js\\n\\nОптимизация производительности...";

    const exampleHashtags =
      tenantId === "cinema-media"
        ? '["#marvel", "#cinema", "#кино", "#фильмы"]'
        : isTestoTenant
          ? '["#фармацевтика", "#GxP", "#testo"]'
          : '["#nodejs", "#performance"]';

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
- "text": The complete text of the post (strictly in Russian for Testo and Cinema portals).
- "hook": The first line (Hook) of the post.
- "cta": The final Call to Action string.
- "ru_post": An object containing the high-quality Russian post adaptation for Telegram & Threads:
  - "hook": Russian header starting with a single emoji (e.g. "${exampleHook}")
  - "text": Full Russian post body, formatted into scanable paragraphs, ending with hashtags.
  - "hashtags": Array of relevant hashtags (e.g. ${exampleHashtags})

Output format:
{
  "text": "Full text of the post...",
  "hook": "Catchy first line...",
  "cta": "Engaging question at the end...",
  "ru_post": {
    "hook": "${exampleHook}",
    "text": "${exampleText}",
    "hashtags": ${exampleHashtags}
  }
}

Return ONLY valid raw JSON. Do NOT include markdown code blocks or conversational text.`;
  }

  let batchesBlock = "";
  if (Array.isArray(topic.batches) && topic.batches.length > 0) {
    batchesBlock = `\n[DYNAMIC ARTICLE RAG GROUNDING / FACT CHUNKS]:\n${topic.batches.map((b: string, i: number) => `[Fact Chunk ${i + 1}]: ${b}`).join("\n\n")}\n\nCRITICAL RAG GROUNDING & FIDELITY RULE:\nThis post is strictly grounded in the article RAG chunks above. You MUST extract the core narrative points, cast members, plot details, quotes, and statistics directly from these chunks. Do NOT invent unverified character names, fictional release dates, or hallucinated plotlines not in the source text.\n`;
  } else if (topic.fullArticleText) {
    batchesBlock = `\n[DYNAMIC ARTICLE RAG GROUNDING]:\n${topic.fullArticleText}\n\nCRITICAL RAG GROUNDING & FIDELITY RULE:\nWrite the post strictly grounded in the source article text above without inventing unverified facts.\n`;
  }

  const userPrompt = `Here are the inputs for the post:

---
Topic:
Title: "${topic.title}"
Summary: "${topic.summary}"
${topic.url ? `Source URL: "${topic.url}"` : ""}${batchesBlock}

Strategy:
Format: "${strategy.format || "analytical-deep-dive"}"
Target Audience: "${strategy.target_audience || (tenantId === "cinema-media" ? "Movie fans and cinema buffs" : "Industry professionals")}"
Core Idea: "${strategy.core_idea || topic.summary}"
---

${extraInstructions ? `Additional guidance from Editor: ${extraInstructions}` : ""}

Please write the post and return the JSON.`;

  return { systemPrompt, userPrompt };
}
