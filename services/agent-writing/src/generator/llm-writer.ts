import { AiClient } from "@pipeline/shared/ai";
import { createLogger } from "@pipeline/shared/logger";
import { parseCleanJson, sanitizeLlmOutput } from "./json-parser.js";
import { WritingOutputInternalSchema, type WritingOutputInternal } from "../validators/writing.validator.js";

const logger = createLogger("agent-writing:llm-writer");

export async function generatePostContent(
  aiClient: AiClient,
  systemPrompt: string,
  userPrompt: string,
  isRegulated: boolean,
  runId: string
): Promise<WritingOutputInternal> {
  const temperature = isRegulated ? 0.3 : 0.7;

  logger.info({ runId, isRegulated, temperature }, "Sending post generation prompt to LLM...");

  const response = await aiClient.complete(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { temperature, preferredProvider: "gemini" }
  );

  logger.info(
    { runId, provider: response.provider, model: response.model },
    "Writing LLM generation complete"
  );

  let parsedJson: any;
  try {
    parsedJson = parseCleanJson(response.text);
  } catch (err) {
    logger.error({ err, rawText: response.text }, "Failed to parse JSON from LLM response");
    throw new Error("LLM response was not valid JSON");
  }

  const sanitized = sanitizeLlmOutput(parsedJson);
  return WritingOutputInternalSchema.parse(sanitized);
}
