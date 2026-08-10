import type { TerminologyRules } from "@pipeline/shared/schemas";

export interface TerminologyEvaluationResult {
  deductions: number;
  driftReport: { rule: string; passed: boolean; details: string }[];
}

/**
 * Валидатор терминологии: проверяет обязательные термины, запрещенные анти-паттерны
 * и рекомендуемые замещения для фарм/тех комплаенса.
 */
export function validateTerminology(
  text: string,
  rules?: TerminologyRules,
  pillarId?: string,
): TerminologyEvaluationResult {
  const driftReport: { rule: string; passed: boolean; details: string }[] = [];
  let deductions = 0;

  if (!rules) {
    return { deductions: 0, driftReport };
  }

  const lowerText = text.toLowerCase();

  // 1. Mandatory Terms Guard
  if (rules.mandatoryTerms) {
    const requiredForPillar = (pillarId && rules.mandatoryTerms[pillarId]) || rules.mandatoryTerms["default"] || [];
    const missingTerms = requiredForPillar.filter(term => {
      const termLower = term.toLowerCase();
      if (lowerText.includes(termLower)) return false;
      // Handle Russian declensions for "холодовая цепь" -> "холодовой цепи", etc.
      const words = termLower.split(/\s+/);
      const stems = words.map(w => w.length > 4 ? w.substring(0, w.length - 2) : w);
      return !stems.every(stem => lowerText.includes(stem));
    });

    if (missingTerms.length > 0) {
      deductions += Math.min(40, missingTerms.length * 15);
      driftReport.push({
        rule: "mandatory_terminology_guard",
        passed: false,
        details: `Отклонение терминологии: в тексте отсутствуют обязательные отраслевые термины (${missingTerms.join(", ")})`,
      });
    } else if (requiredForPillar.length > 0) {
      driftReport.push({
        rule: "mandatory_terminology_guard",
        passed: true,
        details: "Соблюдено: все обязательные нормативные термины присутствуют в тексте",
      });
    }
  }

  // 2. Forbidden Terms & Anti-Pattern Bouncer
  if (rules.forbiddenTerms && rules.forbiddenTerms.length > 0) {
    const foundForbidden = rules.forbiddenTerms.filter(phrase => lowerText.includes(phrase.toLowerCase()));

    if (foundForbidden.length > 0) {
      deductions += Math.min(50, foundForbidden.length * 25);
      driftReport.push({
        rule: "forbidden_terminology_bouncer",
        passed: false,
        details: `Отклонение терминологии: обнаружены бытовые/недопустимые выражения (${foundForbidden.map(f => `"${f}"`).join(", ")})`,
      });
    } else {
      driftReport.push({
        rule: "forbidden_terminology_bouncer",
        passed: true,
        details: "Соблюдено: бытовые и некорректные анти-паттерны отсутствуют",
      });
    }
  }

  // 3. Preferred Replacements Check
  if (rules.preferredReplacements) {
    const replacedPhrases: string[] = [];
    for (const [informal, preferred] of Object.entries(rules.preferredReplacements)) {
      if (lowerText.includes(informal.toLowerCase()) && !lowerText.includes(preferred.toLowerCase())) {
        replacedPhrases.push(`"${informal}" -> использовать "${preferred}"`);
      }
    }

    if (replacedPhrases.length > 0) {
      deductions += Math.min(30, replacedPhrases.length * 10);
      driftReport.push({
        rule: "preferred_terminology_replacements",
        passed: false,
        details: `Рекомендация по терминологии: замечены упрощенные синонимы (${replacedPhrases.join("; ")})`,
      });
    }
  }

  // 4. Testo Official Distributor CTA Guard
  if (pillarId?.startsWith("pharma") || rules.mandatoryTerms?.["pharma-compliance-explained"]) {
    const hasDistributorCta = lowerText.includes("дистрибьютор") || lowerText.includes("дистрибьютора");
    if (!hasDistributorCta) {
      deductions += 15;
      driftReport.push({
        rule: "testo_distributor_cta_check",
        passed: false,
        details: "Отклонение: отсутствует призыв приобретать приборы Testo у официального дистрибьютора",
      });
    } else {
      driftReport.push({
        rule: "testo_distributor_cta_check",
        passed: true,
        details: "Соблюдено: призыв покупать оборудование у официального дистрибьютора Testo присутствует",
      });
    }
  }

  return { deductions, driftReport };
}
