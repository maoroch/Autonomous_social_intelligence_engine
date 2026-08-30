import { PRESET_CTAS_EN, PRESET_CTAS_RU } from "../config/constants.js";

export function injectPresetCta(
  text: string,
  existingCta: string,
  tenantId: string
): { text: string; cta: string } {
  const isEnglishText = !/[а-яА-ЯёЁ]/.test(text);
  const ctaMap = isEnglishText ? PRESET_CTAS_EN : PRESET_CTAS_RU;
  const presetCta = ctaMap[tenantId]?.["default"] || Object.values(ctaMap[tenantId] || {})[0];

  let finalCta = existingCta;
  let finalText = text;

  if (presetCta) {
    finalCta = presetCta;
    if (!finalText.includes(presetCta)) {
      finalText = `${finalText.trim()}\n\n${presetCta}`;
    }
  }

  return { text: finalText, cta: finalCta };
}
