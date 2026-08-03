/**
 * Детерминированные проверки против галлюцинаций LLM (без повторного обращения к модели).
 * Идея: промпт-инструкции ("не выдумывай факты") снижают вероятность галлюцинации, но не гарантируют
 * её отсутствие — поэтому после генерации код ПРОВЕРЯЕТ результат против исходных данных и обрезает
 * то, что не подтверждается, вместо того чтобы просто доверять модели на слово.
 * См. TZ_vertical_agnostic_b2b_saas.md, раздел 3 (agent-compliance) и agent-writing/index.ts (RAG TODO).
 */

/**
 * Проверяет, что каждый URL в списке источников, которые LLM указала для тренда,
 * реально присутствовал среди исходных (сырых) данных, отданных модели на вход.
 * URL, которого не было в источниках — считается галлюцинированным и отбрасывается.
 */
export function filterHallucinatedSources(claimedSources: string[], rawSourceUrls: string[]): string[] {
  const knownUrls = new Set(rawSourceUrls.map(normalizeUrl));
  return claimedSources.filter((url) => knownUrls.has(normalizeUrl(url)));
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, "").toLowerCase();
}

/** Извлекает числа (включая проценты, диапазоны с ±, десятичные) из текста для сверки фактов. */
export function extractNumericClaims(text: string): string[] {
  const matches = text.match(/[±]?\d+(?:[.,]\d+)?\s?(?:%|°c|°f|мм|см|кг|мл|л)?/gi) ?? [];
  // Отфильтровываем шум вроде номеров списков/годов, если они не несут единиц измерения и слишком короткие
  return matches.map((m) => m.trim()).filter((m) => m.length > 0);
}

export interface NumericGroundingResult {
  ok: boolean;
  ungroundedClaims: string[];
}

/**
 * Проверяет, что каждое число, встречающееся в сгенерированном тексте, также встречается
 * (буквально, как подстрока) в исходном контексте (topic.summary + strategy.core_idea и т.п.),
 * который был передан модели. Если число появилось "из ниоткуда" — это подозрение на галлюцинацию
 * технической характеристики (критично для regulatedIndustry, см. IndustryProfile.complianceConfig).
 *
 * Ограничение: это простая эвристика по подстроке, а не семантическая проверка — она может
 * пропустить перефразированные факты и может ложно сработать на случайных совпадениях коротких чисел.
 * Используется как дешёвый первый рубеж защиты, а не как замена полноценного RAG/fact-check агента.
 */
export function checkNumericGrounding(generatedText: string, sourceContext: string): NumericGroundingResult {
  const claimedNumbers = extractNumericClaims(generatedText);
  const sourceNormalized = sourceContext.toLowerCase();

  const ungroundedClaims = claimedNumbers.filter((claim) => {
    const digitsOnly = claim.replace(/[^\d.,]/g, "");
    if (digitsOnly.length === 0) return false;
    // Пропускаем маленькие числа (1-2 цифры) без единиц измерения — слишком много ложных срабатываний
    // (номера пунктов списка, порядковые числительные и т.д.)
    if (digitsOnly.length <= 2 && !/[%°]|мм|см|кг|мл|л/i.test(claim)) return false;
    return !sourceNormalized.includes(claim.toLowerCase()) && !sourceNormalized.includes(digitsOnly);
  });

  return { ok: ungroundedClaims.length === 0, ungroundedClaims };
}
