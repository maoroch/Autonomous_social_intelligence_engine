/**
 * Checks if a topic belongs to a domain strictly outside Testo's manufacturing competence.
 * Testo produces precision measurement instruments, NOT personal protective equipment (PPE/СИЗ).
 */
export function isTestoForbiddenDomain(title: string, summary: string): boolean {
  const content = `${title} ${summary}`.toLowerCase();
  const hasForbiddenKeyword =
    /nfpa\s*70e|arc[- ]flash|дугов(ой|ого)|пробо[яе]|спецодежд|диэлектрическ|респиратор|сиз|protective\s+apparel|personal\s+protective\s+equipment|osha\s*(ppe|1910)/i.test(
      content
    );
  const hasTestoInstrument =
    /testo|измерительн|газоанализ|течеискател|тепловизор|манометр|термометр/i.test(content);

  return hasForbiddenKeyword && !hasTestoInstrument;
}
