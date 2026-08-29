import { AiClient } from "@pipeline/shared/ai";
import { createLogger } from "@pipeline/shared/logger";
import { parseCleanJson, sanitizeLlmOutput } from "./json-parser.js";
import { WritingOutputInternalSchema, type WritingOutputInternal } from "../validators/writing.validator.js";

const logger = createLogger("agent-writing:llm-writer");

function isPrimarilyCyrillic(text: string): boolean {
  if (!text || text.length < 20) return false;
  const cyrillicMatches = text.match(/[а-яА-ЯёЁ]/g) || [];
  const latinMatches = text.match(/[a-zA-Z]/g) || [];
  const totalLetters = cyrillicMatches.length + latinMatches.length;
  if (totalLetters === 0) return true;
  return cyrillicMatches.length / totalLetters >= 0.4;
}

export async function generatePostContent(
  aiClient: AiClient,
  systemPrompt: string,
  userPrompt: string,
  isRegulated: boolean,
  runId: string,
  isRussianTenant: boolean = false
): Promise<WritingOutputInternal> {
  const temperature = isRegulated ? 0.3 : 0.7;

  logger.info(
    {
      runId,
      isRegulated,
      isRussianTenant,
      temperature,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
    },
    "Sending post generation prompt to LLM..."
  );

  const response = await aiClient.complete(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { temperature, preferredProvider: "gemini" }
  );

  logger.info(
    {
      runId,
      provider: response.provider,
      model: response.model,
      rawOutputLength: response.text.length,
      rawOutputSnippet: response.text.slice(0, 300),
    },
    "Writing LLM raw generation complete"
  );

  let parsedJson: any;
  try {
    parsedJson = parseCleanJson(response.text);
  } catch (err) {
    logger.error({ err, rawText: response.text }, "Failed to parse JSON from LLM response");
    throw new Error("LLM response was not valid JSON");
  }

  let sanitized = sanitizeLlmOutput(parsedJson);

  // 🛡️ Проверка русского языка: если для русскоязычного портала модель выдала английский текст,
  // запускаем быстрый адаптационный проход на русский язык с длинным форматом.
  if (isRussianTenant && !isPrimarilyCyrillic(sanitized.text)) {
    logger.warn(
      { runId, textSnippet: sanitized.text.slice(0, 150) },
      "English text detected for Russian portal — executing Russian adaptation pass"
    );

    const adaptSystemPrompt = `Ты — главный редактор русского медиа-канала.
Твоя задача — перевести и адаптировать предоставленный английский материал в ПОЛНОЦЕННЫЙ, ДЛИННЫЙ, УВЛЕКАТЕЛЬНЫЙ пост на русском языке (150-250 слов, 1000-1500 символов).

СТРУКТУРА ПОСТА:
- Заголовок (Hook) в первой строке без кавычек.
- Вводный лид (1-2 предложения).
- Блок ключевых деталей с буллетами (• Пункт 1... • Пункт 2...).
- Подробности, цитаты и факты.
- Интерактивный вовлекающий вопрос читателям (со смайликом 👇).
- Хэштеги в конце.

Верни ТОЛЬКО валидный JSON:
{
  "text": "Полный текст поста на русском языке...",
  "hook": "Заголовок поста...",
  "cta": "Вопрос к читателям...",
  "ru_post": {
    "hook": "Заголовок поста...",
    "text": "Полный текст поста на русском языке...",
    "hashtags": ["#хэштег1", "#хэштег2"]
  }
}`;

    try {
      const adapted = await aiClient.complete(
        [
          { role: "system", content: adaptSystemPrompt },
          { role: "user", content: `Материал для адаптации на русский язык:\n\n${sanitized.text}` },
        ],
        { temperature: 0.5, preferredProvider: "gemini" }
      );
      const adaptedParsed = parseCleanJson(adapted.text);
      sanitized = sanitizeLlmOutput(adaptedParsed);
      logger.info({ runId, adaptedLength: sanitized.text.length }, "Russian adaptation pass completed successfully");
    } catch (adaptErr: any) {
      logger.error({ runId, err: adaptErr.message }, "Russian adaptation pass failed, using original");
    }
  }

  logger.info(
    {
      runId,
      finalTextLength: sanitized.text.length,
      finalTextSnippet: sanitized.text.slice(0, 200),
      hook: sanitized.hook,
      cta: sanitized.cta,
      hashtags: sanitized.ru_post?.hashtags,
    },
    "Final sanitized post text ready"
  );

  return WritingOutputInternalSchema.parse(sanitized);
}
