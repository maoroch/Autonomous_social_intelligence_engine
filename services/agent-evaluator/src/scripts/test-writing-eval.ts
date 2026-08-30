import "dotenv/config";
import { validateTerminology } from "../terminology.js";

function runWritingEvaluatorUnitTest() {
  console.log("🚀 Starting standalone Agent-Writing & Evaluator unit test for BOTH Portals & ALL 6 Rubrics (0 LLM tokens)...\n");

  // Rules for Testo Portal
  const testoTerminologyRules = {
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

  // Rules for Tech Portal
  const techTerminologyRules = {
    mandatoryTerms: {
      "pet-projects-showcase": ["github", "pet-project", "репозиторий", "архитектура", "stack"],
      "github-trending-repos": ["github", "open-source", "stars", "репозиторий", "developer"],
      "tech-trends-insights": ["architecture", "engineering", "system design", "scalability", "performance"],
    },
    forbiddenTerms: ["китайский софт", "слив курсов", "взлом бесплатно", "кряк програм", "говнокод"],
    preferredReplacements: {
      "скрипт на коленке": "production-ready сервис",
    },
  };

  const testoDecks = [
    {
      rubricId: "pharma-compliance-explained",
      name: "Testo Rubric 1: GxP на пальцах / 21 CFR Part 11",
      rules: testoTerminologyRules,
      text: `Стандарт 21 CFR Part 11 требует полного контроля целостности электронных записей ERES. 
Любое изменение калибровки оборудования в чистых помещениях должно фиксироваться в неизменяемом системном журнале Audit Trail.
Автоматизация процедур GxP и GMP исключает риск отзыва партий лекарственных препаратов.
Заказывайте оригинальное оборудование Testo у официального дистрибьютора для полной гарантии, Госреестра СИ и калибровки.`,
    },
    {
      rubricId: "pharma-cold-chain-story",
      name: "Testo Rubric 2: Холодовая цепь без слепых зон (GDP logistics)",
      rules: testoTerminologyRules,
      text: `Температурные эксцессы при транспортировке термолабильных медикаментов ведут к списанию всей партии.
Стандарт GDP требует жесткий непрерывный контроль температурного режима на всем протяжении холодовой цепи.
Логгеры Testo 174T обеспечивают трёхуровневое резервирование данных и автоматическое формирование квалификационных отчетов.
Обращайтесь к официальному дистрибьютору Testo за решениями непрерывного температурного мониторинга холодовой цепи.`,
    },
    {
      rubricId: "pharma-audit-ready",
      name: "Testo Rubric 3: Готовы к инспекции? / Audit Preparedness",
      rules: testoTerminologyRules,
      text: `Инспекция регуляторных органов FDA, EMA и Минпромторга проверяет соответствие принципам ALCOA+.
Тепловизионный аудит чистых помещений тепловизорами Testo 883 гарантирует оперативное выявление температурных аномалий.
Чек-лист готовности к аудиту включает валидацию ERES, разделение ролей пользователей и сертификаты калибровки.
Подготовьтесь к аудиту GxP с цифровыми системами Testo от официального дистрибьютора.`,
    },
  ];

  const techDecks = [
    {
      rubricId: "pet-projects-showcase",
      name: "Tech Rubric 1: Подборка pet-проектов для GitHub",
      rules: techTerminologyRules,
      text: `Хочешь пополнить своё портфолио разработчика мощными проектами?
В этой подборке разберём отличный pet-project с современной микросервисной технической architecture.
Исходный код репозитория выложен на GitHub с настроенными CI/CD и чистым технологическим stack.
Звезди репозиторий на GitHub и добавляй архитектуру в свое портфолио!`,
    },
    {
      rubricId: "github-trending-repos",
      name: "Tech Rubric 2: Подборка GitHub репозиториев",
      rules: techTerminologyRules,
      text: `Представляем самые трендовые open-source разработки этой недели на GitHub!
Этот полезный репозиторий уже набрал более 10 000 stars и помогает каждому developer оптимизировать повседневные задачи.
Проект содержит подробную документацию, гайды по интеграции и открыт для контрибьюторов.
Подписывайся на обновления, сохраняй полезные репозитории и развивай open-source!`,
    },
    {
      rubricId: "tech-trends-insights",
      name: "Tech Rubric 3: Тренды и архитектура в Software Engineering",
      rules: techTerminologyRules,
      text: `Проектирование распределенных сервисов требует глубокого понимания инженерных принципов Software Engineering.
Разберем паттерны System Design для обеспечения высокой scalability и максимальной performance под нагрузкой.
Качественная architecture гарантирует отказоустойчивость сервиса и минимальные задержки при обработке данных.
Проектируй отказоустойчивые системы и внедряй лучшие практики System Design!`,
    },
  ];

  let totalFailures = 0;

  console.log("---------------------------------------------------------");
  console.log("🏢 PORTAL 1: Testo Industrial Measurement Portal");
  console.log("---------------------------------------------------------");

  for (const deck of testoDecks) {
    console.log(`📌 Testing ${deck.name}...`);
    const evalRes = validateTerminology(deck.text, deck.rules);

    console.log(`   Deductions: ${evalRes.deductions}`);
    evalRes.driftReport.forEach(r => {
      console.log(`   [${r.passed ? "PASSED" : "FAILED"}] ${r.rule}: ${r.details}`);
    });

    if (evalRes.deductions > 0 || evalRes.driftReport.some(r => !r.passed)) {
      console.error(`❌ Failed test for ${deck.name}`);
      totalFailures++;
    } else {
      console.log(`✅ ${deck.name} PASSED with 100% compliance!\n`);
    }
  }

  console.log("---------------------------------------------------------");
  console.log("💻 PORTAL 2: Software Development Tech Portal");
  console.log("---------------------------------------------------------");

  for (const deck of techDecks) {
    console.log(`📌 Testing ${deck.name}...`);
    const evalRes = validateTerminology(deck.text, deck.rules);

    console.log(`   Deductions: ${evalRes.deductions}`);
    evalRes.driftReport.forEach(r => {
      console.log(`   [${r.passed ? "PASSED" : "FAILED"}] ${r.rule}: ${r.details}`);
    });

    if (evalRes.deductions > 0 || evalRes.driftReport.some(r => !r.passed)) {
      console.error(`❌ Failed test for ${deck.name}`);
      totalFailures++;
    } else {
      console.log(`✅ ${deck.name} PASSED with 100% compliance!\n`);
    }
  }

  console.log("=========================================================");
  if (totalFailures > 0) {
    console.error(`💥 TEST SUITE COMPLETED WITH ${totalFailures} FAILURES.`);
    process.exit(1);
  } else {
    console.log("🎉 ALL TESTS PASSED! 100% Golden Dataset Alignment & 0 Terminology Drift.");
    process.exit(0);
  }
}

runWritingEvaluatorUnitTest();
