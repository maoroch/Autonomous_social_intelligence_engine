import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchPillarSemantically } from "../pillar-matcher.js";
import type { ContentPillar } from "@pipeline/shared/schemas";

describe("Semantic Content Pillar Matching", () => {
  const pillars: ContentPillar[] = [
    { id: "gas-safety-leak-detection", label: "Поиск утечек газа", description: "Течеискатели", weight: 0.6, preferredFormat: "carousel" },
    { id: "gas-boiler-efficiency", label: "Наладка котельных", description: "КПД котлов", weight: 0.8, preferredFormat: "carousel" },
    { id: "gas-industrial-emissions", label: "Промышленные выбросы", description: "NOx и CO", weight: 0.7, preferredFormat: "carousel" },
    { id: "pharma-cold-chain-story", label: "Холодовая цепь", description: "GDP логистика", weight: 0.8, preferredFormat: "carousel" },
    { id: "pharma-audit-ready", label: "Готовность к аудиту", description: "21 CFR Part 11", weight: 0.9, preferredFormat: "carousel" },
  ];

  it("should match gas leak topics to gas-safety-leak-detection", () => {
    const topic = {
      title: "Локализация утечек метана на фланцах газопроводов",
      summary: "Как течеискатель газа помогает предотвратить аварийные ситуации",
    };
    const matched = matchPillarSemantically(pillars, topic);
    assert.equal(matched?.id, "gas-safety-leak-detection");
  });

  it("should match boiler efficiency topics to gas-boiler-efficiency", () => {
    const topic = {
      title: "Настройка горелки котла ДКВР для повышения КПД",
      summary: "Коэффициент избытка воздуха лямбда и снижение расхода топлива",
    };
    const matched = matchPillarSemantically(pillars, topic);
    assert.equal(matched?.id, "gas-boiler-efficiency");
  });

  it("should match flue gas emissions topics to gas-industrial-emissions", () => {
    const topic = {
      title: "Мониторинг промышленных выбросов NOx и SO2 на ТЭЦ",
      summary: "Контроль ПДВ с блоком осушки Пельтье",
    };
    const matched = matchPillarSemantically(pillars, topic);
    assert.equal(matched?.id, "gas-industrial-emissions");
  });

  it("should match cold chain topics to pharma-cold-chain-story", () => {
    const topic = {
      title: "Холодовая цепь и температурный режим при перевозке вакцин",
      summary: "GDP логистика и непрерывный мониторинг температуры",
    };
    const matched = matchPillarSemantically(pillars, topic);
    assert.equal(matched?.id, "pharma-cold-chain-story");
  });

  it("should match cleanroom / 21 CFR topics to pharma-audit-ready", () => {
    const topic = {
      title: "Валидация систем мониторинга чистых зон под 21 CFR Part 11",
      summary: "FDA аудит и электронный аудит-трейл",
    };
    const matched = matchPillarSemantically(pillars, topic);
    assert.equal(matched?.id, "pharma-audit-ready");
  });
});
