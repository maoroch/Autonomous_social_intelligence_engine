import { AiClient } from "@pipeline/shared/ai";
import { createLogger } from "@pipeline/shared/logger";
import { SlideDeckSchema, type SlideDeck } from "../validators/slide-deck.validator.js";
import { buildSlideGenerationPrompt } from "./prompt-builder.js";
import type { StyleConfig } from "../types/index.js";
import type { IndustryProfile } from "@pipeline/shared/schemas";

const logger = createLogger("agent-design:llm-generator");

function extractJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

export async function generateSlideDeckWithLLM(
  aiClient: AiClient,
  params: {
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
  }
): Promise<SlideDeck> {
  const prompt = buildSlideGenerationPrompt(params);

  logger.info({ tenantId: params.tenantId }, "Sending slide deck generation prompt to LLM...");

  const isProd = process.env.NODE_ENV === "production";
  const model = isProd ? "llama-3.3-70b-versatile" : "llama-3.3-70b-versatile";

  const response = await aiClient.complete(
    [
      {
        role: "system",
        content: "You are a professional B2B presentation and carousel slide designer. Respond strictly in valid JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    {
      model,
      temperature: 0.6,
    }
  );

  const content = response.text || "{}";

  try {
    const rawJson = extractJson(content);
    const validated = SlideDeckSchema.parse(rawJson);

    validated.slides = validated.slides.map((s, idx) => ({
      ...s,
      slide_number: idx + 1,
      isCover: idx === 0,
    }));

    return validated;
  } catch (err) {
    logger.error({ err, rawContent: content }, "Failed to parse or validate LLM slide deck JSON with Zod");
    throw new Error(`Invalid SlideDeck returned by LLM: ${(err as Error).message}`);
  }
}
