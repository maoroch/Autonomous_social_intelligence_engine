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
    prompt += `
MANDATORY BRAND RULES (TESTO):
- Tone: Professional, B2B, metrological precision, engineering-grade facts.
- Include precise numbers, accuracy standards (O₂, CO, IP65, Longlife) and concrete industrial value.
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
