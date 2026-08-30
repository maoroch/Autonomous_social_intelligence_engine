import { AiClient } from "@pipeline/shared/ai";
import { getCollection, Collections } from "@pipeline/shared/db";
import { createLogger } from "@pipeline/shared/logger";
import { parseCleanJson } from "./json-parser.js";
import type { AdaptationRequest } from "../validators/writing.validator.js";

const logger = createLogger("agent-writing:adaptation-service");

export async function adaptPostForPlatform(
  aiClient: AiClient,
  params: AdaptationRequest
): Promise<{
  runId?: string;
  platform: string;
  length: string;
  hook: string;
  text: string;
  hashtags: string[];
}> {
  const { runId, targetPlatform, topicTitle, topicSummary, existingText, textLength } = params;

  let tenantId = params.tenantId;
  if (!tenantId && runId) {
    const runDoc = await getCollection(Collections.PIPELINE_RUNS).findOne({ runId });
    if (runDoc) tenantId = runDoc.tenantId;
  }
  const isTesto = tenantId === "testo";
  const platform = targetPlatform === "threads" ? "threads" : "telegram";
  const lengthMode = textLength === "short" ? "short" : "long";

  // 1. Fetch Golden Dataset examples
  let goldenExamplesText = "";
  try {
    const collectionName = isTesto
      ? Collections.GOLDEN_TESTO_PHARMA
      : platform === "threads"
      ? Collections.GOLDEN_RU_THREADS
      : Collections.GOLDEN_RU_TELEGRAM;

    const col = getCollection(collectionName);
    const docs = await col.find({}).limit(3).toArray();
    if (docs.length > 0) {
      goldenExamplesText =
        `\n\nЭТАЛОННЫЕ ПРИМЕРЫ (GOLDEN DATASET):\n` +
        docs
          .map((d: any, idx: number) => `--- ПРИМЕР ${idx + 1} ---\n${d.expected_output?.text || d.text}`)
          .join("\n\n");
    }
  } catch (err) {
    logger.warn({ err }, "Could not load golden dataset for adaptation");
  }

  // 2. Build System Prompt
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
  if (!fullText.startsWith(rawHook)) {
    const cleanBody = fullText.replace(/^[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*\s*[^\n]+\n*/u, "").trim();
    fullText = `${rawHook}\n\n${cleanBody.length > 0 ? cleanBody : fullText}`;
  }

  if (isTesto) {
    fullText = fullText.replace(/#(?:github|backend|softwareengineering|frontend|devops|typescript|python|code|repository|petprojects)\b/gi, "").replace(/\s{2,}/g, " ").trim();
  }

  const hashtagRegex = /#[\wа-яА-ЯёЁ_-]+/g;
  if (!hashtagRegex.test(fullText)) {
    const defaultHashtags =
      Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0
        ? parsed.hashtags
        : isTesto
        ? ["#testo", "#gxp", "#pharma", "#комплаенс"]
        : ["#programming", "#backend", "#softwareengineering", "#devtools"];
    fullText = `${fullText}\n\n${defaultHashtags.join(" ")}`;
  }

  return {
    runId,
    platform,
    length: lengthMode,
    hook: rawHook,
    text: fullText,
    hashtags: parsed.hashtags || [],
  };
}
