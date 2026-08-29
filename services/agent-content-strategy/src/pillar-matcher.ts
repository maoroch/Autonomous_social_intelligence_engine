import type { ContentPillar } from "@pipeline/shared/schemas";

/**
  * Selects a content pillar by weight and seasonal triggers.
  */
export function pickContentPillar(pillars: ContentPillar[]): ContentPillar | undefined {
  if (pillars.length === 0) return undefined;

  const weighted = pillars.map((p) => ({ pillar: p, effectiveWeight: p.seasonalTrigger ? p.weight * 2 : p.weight }));
  const totalWeight = weighted.reduce((sum, w) => sum + w.effectiveWeight, 0);
  if (totalWeight <= 0) return pillars[0];

  let roll = Math.random() * totalWeight;
  for (const w of weighted) {
    roll -= w.effectiveWeight;
    if (roll <= 0) return w.pillar;
  }
  return pillars[pillars.length - 1];
}

/**
 * Semantically matches a topic to the most relevant content pillar,
 * preventing forced collision between unrelated topics and pillars.
 */
export function matchPillarSemantically(
  pillars: ContentPillar[],
  topic: { title: string; summary: string }
): ContentPillar | undefined {
  if (pillars.length === 0) return undefined;
  const content = `${topic.title} ${topic.summary}`.toLowerCase();

  // 1. Gas safety & leak detection
  if (/утечк|метан|течеискатель|газопровод|leak|methane/i.test(content)) {
    const leakPillar = pillars.find((p) => p.id === "gas-safety-leak-detection");
    if (leakPillar) return leakPillar;
  }

  // 2. Gas boiler efficiency & burner tuning
  if (/котельн|горелк|кпд|настройка горения|лямбда|boiler|combustion/i.test(content)) {
    const boilerPillar = pillars.find((p) => p.id === "gas-boiler-efficiency");
    if (boilerPillar) return boilerPillar;
  }

  // 3. Gas industrial emissions
  if (/выброс|пдв|тэц|сенсор|нокс|nox|so2|peltier|пелтье|flue\s*gas/i.test(content)) {
    const emissionPillar = pillars.find((p) => p.id === "gas-industrial-emissions");
    if (emissionPillar) return emissionPillar;
  }

  // 4. Pharma cold chain & GDP
  if (/холодов|gdp|хранени|логистик|cold\s*chain|температурный режим/i.test(content)) {
    const coldChainPillar = pillars.find((p) => p.id === "pharma-cold-chain-story");
    if (coldChainPillar) return coldChainPillar;
  }

  // 5. Pharma audit & 21 CFR Part 11
  if (/аудит|инспекци|21\s*cfr|gxp|gmp|fda|валидаци|alcoa|чист[ые|ых]\s+зон|биосенсор/i.test(content)) {
    const auditPillar = pillars.find((p) => p.id === "pharma-audit-ready" || p.id === "pharma-compliance-explained");
    if (auditPillar) return auditPillar;
  }

  return pickContentPillar(pillars);
}
