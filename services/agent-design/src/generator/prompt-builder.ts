import type { IndustryProfile } from "@pipeline/shared/schemas";
import type { StyleConfig } from "../types/index.js";

export function buildSlideGenerationPrompt(params: {
  topicTitle: string;
  topicSummary: string;
  writingHook?: string;
  writingBody?: string;
  writingCta?: string;
  strategyAngle?: string;
  strategyCoreIdea?: string;
  strategyPillarId?: string;
  tenantId?: string;
  industryProfile?: IndustryProfile;
  styleConfigs: StyleConfig[];
  fewShotExamples?: string;
}): string {
  const {
    topicTitle,
    topicSummary,
    writingHook,
    writingBody,
    writingCta,
    strategyAngle,
    strategyCoreIdea,
    strategyPillarId,
    tenantId,
    styleConfigs,
    fewShotExamples,
  } = params;

  const templateList = styleConfigs.map((s) => `"${s.key}"`).join(", ");

  let prompt = `You are an elite Senior Design & Content Architect specializing in high-engagement LinkedIn and Instagram carousel slide decks.

TASK:
Transform the provided article/post into an interactive 5-slide visual carousel deck.

CONTENT TO ADAPT:
- Title: "${topicTitle}"
- Summary: "${topicSummary}"
- Core Angle: "${strategyAngle || ""}"
- Key Message: "${strategyCoreIdea || ""}"
- Post Text:
${writingHook || ""}
${writingBody || ""}
${writingCta || ""}

DESIGN SPECIFICATIONS:
1. Generate EXACTLY 5 to 7 slides.
2. Slide 1 (Cover):
   - title: Powerful punchy headline (max 7-10 words)
   - bullets: [Short 1-2 sentence core overview / description hook]
   - badge: Category badge (e.g., "B2B CASE" or "INDUSTRY REVIEW")
3. Slides 2-4 (Cards):
   - title: Clear slide subtitle
   - bullets: Array of 2-4 high-value bullet points or technical specs
   - badge: Context badge
4. Slide 5 (Outro / CTA):
   - title: Conclusion or next step
   - bullets: [Actionable summary or checklist]
   - call_to_action: "Листать дальше" or "Сохранить в закладки"

5. Available Template Style Keys: ${templateList}.
`;

  if (tenantId === "testo") {
    const isPharma =
      strategyPillarId?.startsWith("pharma-") ||
      /pharma|fda|gxp|gmp|cleanroom|биос[еэ]нсор|препарат|медицин|saveris|abbott|lingo/i.test(
        `${topicTitle} ${topicSummary} ${writingBody || ""}`
      );
    const isGas =
      strategyPillarId?.startsWith("gas-") ||
      /boiler|flue|combustion|котельн|газоанализ|горелк|выброс|пелтье/i.test(
        `${topicTitle} ${topicSummary} ${writingBody || ""}`
      );

    let pillarRules = "";
    if (isPharma) {
      pillarRules = `STRICT PILLAR ISOLATION (PHARMA & CLEANROOMS):
- Focus EXCLUSIVELY on pharmaceutical production, cleanroom environment, cold chain (GDP), and regulatory compliance (FDA 21 CFR Part 11, GxP, GMP, ISO 13485).
- AUTHORIZED EQUIPMENT: Testo Saveris Pharma, Testo 190 (T3/T4 CFR), Testo 174T, Testo 883.
- FORBIDDEN: NEVER mention boilers, combustion, burner tuning, flue gases, emissions, NOx, CO, SO2, lambda, or boiler analyzers (Testo 300, Testo 310, Testo 340, Testo 350)! Testo 300 is a flue gas analyzer and has NOTHING to do with pharma!
- Slide Badges for Pharma: "СТАНДАРТЫ GXP", "ПРОБЛЕМА", "ОЦЕНКА РИСКОВ", "РЕШЕНИЕ", "СТАНДАРТ 21 CFR", "ЧЕК-ЛИСТ АУДИТА".`;
    } else if (isGas) {
      pillarRules = `STRICT PILLAR ISOLATION (FLUE GAS & BOILER TUNING):
- Focus EXCLUSIVELY on industrial flue gas analysis, boiler regime tuning, energy efficiency, lambda, heat losses qA, and emissions (NOx, CO, O2, SO2).
- AUTHORIZED EQUIPMENT: Testo 300, Testo 310 II, Testo 316, Testo 340, Testo 350, Peltier gas cooler.
- FORBIDDEN: NEVER mention pharmaceuticals, biosensors, FDA 21 CFR Part 11, GxP, GMP, or Testo Saveris!
- Slide Badges for Gas: "ГАЗОАНАЛИЗ", "ПОТЕРИ ТЕПЛА", "РЕЖИМНАЯ НАЛАДКА", "ПРИБОР TESTO", "ВЫБРОСЫ NOX/CO", "РЕЗУЛЬТАТ".`;
    } else {
      pillarRules = `STRICT PILLAR ISOLATION:
- Keep cleanrooms/pharma and boiler combustion completely separate. Never mix boiler flue gas into pharma cleanrooms!`;
    }

    prompt += `
MANDATORY BRAND & LANGUAGE RULES (TESTO):
- 100% STRICT RUSSIAN LANGUAGE: All titles, bullets, hooks, CTAs, and BADGES MUST be in natural, professional Russian.
- RUSSIAN BADGES ONLY: Do NOT use English badges like "INDUSTRY REVIEW" or "PROBLEM".
${pillarRules}
- Tone: Professional, B2B, metrological precision, engineering-grade facts.
`;
  }

  if (fewShotExamples) {
    prompt += `\nFEW-SHOT EXAMPLES:\n${fewShotExamples}\n`;
  }

  prompt += `
OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching this schema:
{
  "template_name": "${styleConfigs[0]?.key || "default"}",
  "hook": "Cover hook line",
  "cta": "Final call to action",
  "slides": [
    {
      "slide_number": 1,
      "title": "...",
      "bullets": ["..."],
      "badge": "...",
      "illustration_name": "testo_300"
    }
  ]
}
`;

  return prompt;
}
