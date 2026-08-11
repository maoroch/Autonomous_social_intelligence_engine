import "dotenv/config";
import { validateTerminology } from "../terminology.js";

function runWritingEvaluatorUnitTest() {
  console.log("🚀 Starting standalone Agent-Writing & Evaluator unit test for ALL 3 Testo Pharma rubrics (0 LLM tokens)...\n");

  const terminologyRules = {
    mandatoryTerms: {
      "pharma-compliance-explained": ["21 cfr part 11", "gxp", "audit trail", "testo", "дистрибьютор"],
      "pharma-cold-chain-story": ["холодовая цепь", "gdp", "контроль", "testo", "дистрибьютор"],
      "pharma-audit-ready": ["fda", "инспекция", "alcoa", "testo", "дистрибьютор"],
    },
    forbiddenTerms: ["обычный градусник", "файл excel", "дешевый аналог", "китайский самописец"],
    preferredReplacements: {
      "градусник": "высокоточный термометр Testo",
      "флешка": "валидированный логгер данных Testo 174T",
    },
  };

  const sampleDecks = [
    {
      rubricId: "pharma-compliance-explained",
      name: "Рубрика 1: GxP на пальцах / 21 CFR Part 11 (pharma-compliance-explained)",
      text: `Стандарт 21 CFR Part 11 требует полного контроля целостности электронных записей ERES. 
Любое изменение калибровки оборудования в чистых помещениях должно фиксироваться в неизменяемом системном журнале Audit Trail.
Автоматизация процедур GxP и GMP исключает риск отзыва партий лекарственных препаратов.
Заказывайте оригинальное оборудование Testo у официального дистрибьютора для полной гарантии, Госреестра СИ и калибровки.`,
    },
    {
      rubricId: "pharma-cold-chain-story",
      name: "Рубрика 2: Холодовая цепь без слепых зон (GDP logistics) (pharma-cold-chain-story)",
      text: `Температурные эксцессы при транспортировке термолабильных медикаментов ведут к списанию всей партии.
Стандарт GDP требует жесткий непрерывный контроль температурного режима на всем протяжении холодовой цепи.
Логгеры Testo 174T обеспечивают трёхуровневое резервирование данных и автоматическое формирование квалификационных отчетов.
Обращайтесь к официальному дистрибьютору Testo за решениями непрерывного температурного мониторинга холодовой цепи.`,
    },
    {
      rubricId: "pharma-audit-ready",
      name: "Рубрика 3: Готовы к инспекции? / Audit Preparedness (pharma-audit-ready)",
      text: `Инспекция регуляторных органов FDA, EMA и Минпромторга проверяет соответствие принципам ALCOA+.
Тепловизионный аудит чистых помещений тепловизорами Testo 883 гарантирует оперативное выявление температурных аномалий.
Чек-лист готовности к аудиту включает валидацию ERES, разделение ролей пользователей и сертификаты калибровки.
Подготовьтесь к аудиту GxP с цифровыми системами Testo от официального дистрибьютора.`,
    },
  ];

  let totalFailures = 0;

  for (const deck of sampleDecks) {
    console.log(`📌 Testing ${deck.name}...`);
    const evalRes = validateTerminology(deck.text, terminologyRules, deck.rubricId);

    console.log(`   Deductions: ${evalRes.deductions}`);
    evalRes.driftReport.forEach(r => {
      console.log(`   [${r.passed ? "PASSED" : "FAILED"}] ${r.rule}: ${r.details}`);
    });

    if (evalRes.deductions > 0 || evalRes.driftReport.some(r => !r.passed)) {
      console.error(`❌ Failed rubric test for ${deck.rubricId}`);
      totalFailures++;
    } else {
      console.log(`✅ Rubric ${deck.rubricId} PASSED with 100% compliance!\n`);
    }
  }

  if (totalFailures > 0) {
    console.error(`❌ Total rubric failures: ${totalFailures}`);
    process.exit(1);
  }

  console.log("🎉 ALL 3 Testo Pharma Rubrics Unit Tests PASSED with 100% compliance!");
}

runWritingEvaluatorUnitTest();
