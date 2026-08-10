import "dotenv/config";
import { validateTerminology } from "../../../agent-evaluator/src/terminology.ts";

function runWritingEvaluatorUnitTest() {
  console.log("🚀 Starting standalone Agent-Writing & Evaluator unit test for ALL 3 Testo Pharma rubrics (0 LLM tokens)...\n");

  const terminologyRules = {
    mandatoryTerms: {
      "pharma-compliance-explained": ["21 cfr part 11", "gxp", "audit trail", "testo", "дистрибьютор"],
      "pharma-cold-chain-story": ["холодовая цепь", "gdp", "контроль", "testo", "дистрибьютор"],
      "pharma-audit-ready": ["аудит", "инспекция", "чек-лист", "testo", "дистрибьютор"],
    },
    forbiddenTerms: ["обычный градусник", "файл excel", "купите сейчас"],
    preferredReplacements: {
      "простая флешка": "валидированный логгер данных",
    },
  };

  const testCases = [
    {
      pillarId: "pharma-compliance-explained",
      title: "Рубрика 1: GxP на пальцах / 21 CFR Part 11",
      text: `
Регламент 21 CFR Part 11 требует строгого соблюдения принципа ERES (Electronic Records & Electronic Signatures) при мониторинге окружающей среды в фармацевтике.
В этом посте мы подробно разберем требования к Audit Trail и непрерывности записей для успешного прохождения инспекций FDA и EMA.
Ключевые инженерные принципы GxP:
1. Непрерывность записи: отсутствие пропусков в истории измерений температуры и влажности с логгерами Testo Saveris Pharma.
2. Audit Trail: неизменяемый системный журнал, в котором любое изменение настроек или повторная калибровка привязаны к роли пользователя.
3. Трехуровневая модель избыточности: данные сохраняются на логгере, базовой станции и сервере даже при потере связи.

Заказывайте оригинальное оборудование Testo у официального дистрибьютора для полной гарантии, внесения в Госреестр СИ и калибровки.
#pharma #gxp #21cfrpart11 #testo #фармацевтика
      `,
    },
    {
      pillarId: "pharma-cold-chain-story",
      title: "Рубрика 2: Холодовая цепь без слепых зон (GDP logistics)",
      text: `
Температурные эксцессы при транспортировке термолабильных медикаментов ведут к списанию всей партии.
Стандарт GDP exige жесткий непрерывный контроль температурного режима на каждом этапе логистической цепи.

Преимущества систем логгирования Testo 174T и Testo Saveris для холодовой цепи:
- 3-уровневое резервирование данных и автономная память до 16 000 измерений на каждом контрольном объекте.
- Мгновенные оповещения при отклонении температуры от диапазона +2...+8 °C с автоматической генерацией отчетности.

Обращайтесь к официальному дистрибьютору Testo за решениями непрерывного температурного мониторинга холодовой цепи.
#coldchain #pharma #logistics #testo #холодоваяцепь
      `,
    },
    {
      pillarId: "pharma-audit-ready",
      title: "Рубрика 3: Готовы к инспекции? / Audit Preparedness",
      text: `
Инспекция регулятора (FDA/EMA/Минпромторг) проверяет не только текущие показания, но и неизменяемость всей истории измерений.
Фарм-предприятия обязаны предоставить полный чек-лист подтверждений комплаенса и валидации ALCOA+.

Подготовка к аудиту GxP с измерительным комплексом Testo:
- Чек-лист соответствия ERES: валидированное ПО, разделение прав пользователей и неизменяемый системный лог.
- Тепловизионная съемка чистых помещений тепловизорами Testo 883 для выявления температурных аномалий.

Подготовьтесь к аудиту GxP с цифровыми системами Testo от официального дистрибьютора.
#audit #gxp #pharma #testo #инспекция
      `,
    },
  ];

  let totalFailures = 0;

  for (const tc of testCases) {
    console.log(`📌 Testing ${tc.title} (${tc.pillarId})...`);
    const evalResult = validateTerminology(tc.text, terminologyRules, tc.pillarId);

    console.log(`   Deductions: ${evalResult.deductions}`);
    evalResult.driftReport.forEach(item => {
      console.log(`   [${item.passed ? "PASSED" : "FAILED"}] ${item.rule}: ${item.details}`);
    });

    if (evalResult.deductions > 0) {
      totalFailures++;
      console.log(`❌ Failed rubric test for ${tc.pillarId}\n`);
    } else {
      console.log(`✅ Rubric ${tc.pillarId} PASSED with 100% compliance!\n`);
    }
  }

  if (totalFailures === 0) {
    console.log("🎉 ALL 3 Testo Pharma Rubrics Unit Tests PASSED with 100% compliance!");
  } else {
    console.error(`❌ Total rubric failures: ${totalFailures}`);
    process.exit(1);
  }
}

runWritingEvaluatorUnitTest();
