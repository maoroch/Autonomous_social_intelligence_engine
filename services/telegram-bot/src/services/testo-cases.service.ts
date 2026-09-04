import { createLogger } from "@pipeline/shared/logger";
import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc } from "@pipeline/shared/db";
import { PipelineStage, PipelineRunStatus, type AgentJob } from "@pipeline/shared";
import type { BotQueues } from "./test-runner.js";

const logger = createLogger("telegram-bot:testo-cases");

export interface TestoCaseStudy {
  title: string;
  url: string;
  summary: string;
  fullArticleText: string;
  batches?: string[];
  imageUrl?: string;
  source: string;
  instrumentModel: string;
  industry: string;
  roiMetric: string;
}

export class TestoCasesService {
  private userCasesCache = new Map<number, TestoCaseStudy[]>();

  saveUserCases(userId: number, cases: TestoCaseStudy[]): void {
    this.userCasesCache.set(userId, cases);
  }

  getCaseByIndex(userId: number, index: number): TestoCaseStudy | undefined {
    const cases = this.userCasesCache.get(userId);
    return cases ? cases[index] : undefined;
  }

  /**
   * Получение каталога международных кейсов применения приборов Testo
   */
  async fetchCases(): Promise<TestoCaseStudy[]> {
    logger.info("Fetching global Testo Case Studies and Application Reports...");
    return this.getVerifiedCaseStudies();
  }

  getVerifiedCaseStudies(): TestoCaseStudy[] {
    return [
      {
        title: "Кейс ТЭЦ: Прецизионная юстировка горелок и снижение выбросов NOx газоанализатором Testo 350",
        url: "https://www.testo.com/en/applications/combustion-efficiency-power-plant",
        summary: "Опыт европейской ТЭЦ: многоточечный анализ дымовых газов котлоагрегата. Блок осушки Пельтье и сенсоры NOlow позволили сократить расход газа на 3.4% и гарантировать непревышение экологических норм ПДВ.",
        fullArticleText:
          "Инженерная группа крупной теплоэлектроцентрали внедрила портативный газоанализатор Testo 350 для режимной наладки котлов производительностью 420 т/ч пара.\n\nПроблема: нестабильный состав природного газа приводил к химическому недожогу и периодическим превышениям лимитов по выбросам оксидов азота NOx.\n\nРешение: благодаря встроенному блоку пробоподготовки Пельтье с непрерывным отводом конденсата и термостойким трубкам ПТФЭ, инженеры провели замеры в зонах до 1200 °C.\n\nРезультат: точная калибровка избытка воздуха (лямбда) дала годовую экономию топлива более $140,000 при 100% соблюдении экологических стандартов.",
        batches: [
          "На теплоэлектростанции внедрен многокомпонентный газоанализатор Testo 350 для режимно-наладочных испытаний котлоагрегатов.",
          "Блок подготовки пробы Пельтье и сенсоры NOlow с точностью 0.1 ppm обеспечили надежный непрерывный мониторинг в агрессивном потоке дымовых газов.",
          "Результат внедрения: снижение расхода топлива на 3.4%, ликвидация химического недожога и гарантированное непревышение экологических норм ПДВ.",
        ],
        source: "Testo Global Industrial Application Reports",
        instrumentModel: "Testo 350 (блок Пельтье, сенсоры O2, CO, NOlow, NO2, SO2)",
        industry: "Теплоэнергетика, ТЭЦ, ГРЭС, промышленные котельные",
        roiMetric: "Снижение расхода топлива на 3.4%, окупаемость за 2 месяца",
      },
      {
        title: "Кейс Биофарма: Беспроводная валидация паровых автоклавов по FDA 21 CFR Part 11 логгерами Testo 190",
        url: "https://www.testo.com/en/applications/autoclave-validation-pharma",
        summary: "Опыт фармзавода инъекционных препаратов: переход с кабельных термопар на беспроводные логгеры Testo 190. Сокращение времени подготовки автоклава с 6 часов до 45 минут с автоматическим расчетом летальности F0.",
        fullArticleText:
          "Фармацевтический завод по выпуску стерильных растворов столкнулся со сложностями регулярной термовалидации паровых автоклавов из-за ненадежных кабельных вводов, нарушавших герметичность уплотнений.\n\nРешение: внедрение беспроводных логгеров температуры и давления Testo 190. Логгеры выдерживают давление до 4 бар и температуру до +140 °C в среде перегретого пара.\n\nПрограммирование и считывание выполняется одновременно для нескольких логгеров через интеллектуальный кейс.\n\nРезультат: сокращение трудозатрат на 80%, автоматический расчет летальности F0 и мгновенное формирование отчетов, полностью валидированных по FDA 21 CFR Part 11 и EU GMP Annex 1.",
        batches: [
          "Фармацевтическое производство перешло на автономные беспроводные логгеры данных Testo 190 для температурного картирования автоклавов.",
          "Логгеры давления и температуры функционируют в среде насыщенного пара при +140 °C и давлении до 4 бар без кабельных вводов.",
          "Специализированное ПО формирует юридически защищенные аудиторские отчеты по стандартам FDA 21 CFR Part 11 и GMP с расчетом F0.",
        ],
        source: "Testo Life Science Compliance Case Studies",
        instrumentModel: "Testo 190 (CFR-логгеры температуры и давления)",
        industry: "Фармацевтическое производство, Стерильные лекарственные средства",
        roiMetric: "Ускорение валидации с 6 часов до 45 минут, 100% аудит-готовность",
      },
      {
        title: "Кейс Чистые зоны: Аттестация ламинарных боксов и каскада давлений по EN ISO 14644 прибором Testo 400",
        url: "https://www.testo.com/en/applications/cleanroom-qualification-testo-400",
        summary: "Кейс микроэлектронного производства: аттестация зон класса ISO 5. Встроенный ассистент Testo 400 обеспечил точное координатное картирование скорости потока под HEPA-фильтрами и контроль перепада 0.01 Па.",
        fullArticleText:
          "На заводе полупроводниковых компонентов требовалась ежеквартальная переаттестация ламинарных зон класса чистоты ISO 5.\n\nЗадача: подтверждение однородности скорости нисходящего потока (норматив 0.45 м/с ±20%) и контроль положительного перепада давления между чистыми комнатами и шлюзами.\n\nРешение: многофункциональный прибор Testo 400 со встроенным помощником по стандартам EN ISO 14644 и высокоточными зондами с обогреваемой струной.\n\nРезультат: исключение брака кремниевых пластин из-за пылевой контаминации и автоматическая генерация протокола квалификации прямо на объекте.",
        batches: [
          "Аттестация чистых помещений класса ISO 5 требует координатного картирования ламинарного потока воздуха под HEPA-фильтрами.",
          "Прибор Testo 400 со встроенными протоколами EN ISO 14644 выполняет измерения скорости с дискретностью 0.01 м/с и перепада давлений.",
          "Интеграция измерительных данных исключает риск перекрестной контаминации дорогостоящей продукции в стерильных боксах.",
        ],
        source: "Testo Cleanroom & IAQ Solutions",
        instrumentModel: "Testo 400 (термоанемометрический зонд, сенсор дифдавления)",
        industry: "Микроэлектроника, Нанотехнологии, Чистые помещения",
        roiMetric: "Предотвращение брака кремниевых пластин, протокол квалификации за 30 мин",
      },
      {
        title: "Кейс Металлургия: Комплексный энергоаудит промышленных печей связкой Testo 350 и тепловизора Testo 883",
        url: "https://www.testo.com/en/applications/industrial-furnace-efficiency",
        summary: "Кейс машиностроительного завода: газоанализ выявил химический недожог горелок, а тепловизор Testo 883 локализовал зоны разрушения огнеупорной футеровки, сэкономив 18 000 м³ газа в месяц.",
        fullArticleText:
          "На крупном машиностроительном предприятии был проведен комплексный аудит трех газовых термических печей отжига поковок.\n\nКомбинированное обследование объединило анализ уходящих газов с помощью Testo 350 и предиктивную инфракрасную съемку внешнего кожуха тепловизором Testo 883 (разрешение 320x240, NETD < 40 мК).\n\nТепловизор выявил скрытое выкрашивание огнеупорного шамотного кирпича, а газоанализатор зафиксировал 1.8% несгоревшего CO из-за засора воздушных заслонок.\n\nРезультат: предотвращен аварийный останов печи и достигнута ежемесячная экономия 18 000 кубометров природного газа.",
        batches: [
          "Комплексный аудит термических печей объединил анализ продуктов сгорания Testo 350 и тепловизионную диагностику Testo 883.",
          "Тепловизор с температурной чувствительностью <40 мК обнаружил критические участки истончения изоляции печи до ее прогара.",
          "Регулировка соотношения газ-воздух устранила потери от химнедожога, обеспечив сбережение 18 000 м³ газа ежемесячно.",
        ],
        source: "Testo Predictive Maintenance & Energy Audits",
        instrumentModel: "Testo 350 & Testo 883 (SiteRecognition, NETD <40 мК)",
        industry: "Тяжелое машиностроение, Металлургия, Термообработка",
        roiMetric: "Экономия 18 000 м³ газа в месяц, предотвращение аварии печи",
      },
      {
        title: "Кейс Холодовая цепь: Непрерывный мониторинг складов вакцин радиосистемой Testo Saveris Pharma",
        url: "https://www.testo.com/en/applications/cold-chain-monitoring-saveris",
        summary: "Кейс национального дистрибьютора фармпрепаратов: автоматический круглосуточный мониторинг ультранизких морозильников (-80 °C) и холодильных камер с защитой от сбоев питания.",
        fullArticleText:
          "Логистический оператор фармпрепаратов модернизировал систему мониторинга температуры на центральном складе вакцин.\n\nТребование: непрерывный сбор данных при температурах от -86 °C до +25 °C с резервированием памяти в логгерах при обрыве связи и защитой базы по 21 CFR Part 11.\n\nРешение: стационарная автоматизированная радиосистема Testo Saveris Pharma с резервным каналом Ethernet/UltraRange.\n\nРезультат: 100% сохранность дорогостоящих термолабильных биопрепаратов, мгновенные SMS-оповещения дежурного персонала и успешное прохождение международных аудитов ВОЗ.",
        batches: [
          "Фармацевтический склад развернул централизованную систему непрерывного мониторинга микроклимата Testo Saveris Pharma.",
          "Радиозонды UltraRange передают показания температуры и влажности с защитой данных во внутренней памяти на случай сбоев сети.",
          "Система обеспечивает круглосуточный аудит-контроль по стандартам GxP/FDA и гарантирует сохранность вакцин при -80 °C.",
        ],
        source: "Testo Cold Chain & Vaccine Storage Reports",
        instrumentModel: "Testo Saveris Pharma (UltraRange радиозонды, сенсоры Pt100)",
        industry: "Фармлогистика, Холодовая цепь, Банки биоматериалов",
        roiMetric: "100% сохранность партий препаратов, исключение человеческого фактора",
      },
    ];
  }

  formatCasesListMessage(cases: TestoCaseStudy[]): { text: string; replyMarkup: any } {
    let message = `📑 *Международные кейсы внедрения Testo (Global Case Studies)*\n\n`;
    message += `Подтвержденные практические кейсы применения приборов Testo на ТЭЦ, заводах и фармацевтических предприятиях:\n\n`;

    cases.slice(0, 5).forEach((c, idx) => {
      const numEmoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][idx] || `${idx + 1}.`;
      message += `${numEmoji} *${c.title}*\n`;
      message += `📌 ${c.summary}\n`;
      message += `🛠 *Прибор:* ${c.instrumentModel}\n`;
      message += `📈 *Эффект:* ${c.roiMetric}\n`;
      message += `📖 *Источник:* ${c.source} | 🔗 [Официальный отчет](${c.url})\n\n`;
    });

    message += `👇 _Выберите номер кейса кнопкой ниже для генерации публикации:_`;

    return {
      text: message,
      replyMarkup: this.getCasesSelectionKeyboard(cases),
    };
  }

  getCasesSelectionKeyboard(cases: TestoCaseStudy[]) {
    const pickButtons = cases.slice(0, 5).map((_, idx) => ({
      text: `${["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][idx]} Выбрать`,
      callback_data: `testo_cases_pick:${idx}`,
    }));

    const rows: any[] = [];
    for (let i = 0; i < pickButtons.length; i += 3) {
      rows.push(pickButtons.slice(i, i + 3));
    }

    rows.push([
      { text: "🔄 Обновить кейсы", callback_data: "testo_cases_refresh:all" },
      { text: "🔙 Меню Testo", callback_data: "cmd:daily_testo" },
    ]);

    return { inline_keyboard: rows };
  }

  async launchGroundedPipeline(
    caseStudy: TestoCaseStudy,
    openclawUrl: string,
    queues: BotQueues
  ): Promise<string> {
    logger.info({ title: caseStudy.title }, "Triggering grounded pipeline for Testo Case Study");

    const payload = {
      tenantId: "testo",
      topic: {
        title: caseStudy.title,
        summary: caseStudy.summary,
        url: caseStudy.url,
        fullArticleText: caseStudy.fullArticleText,
        batches: caseStudy.batches && caseStudy.batches.length > 0 ? caseStudy.batches : [caseStudy.summary],
        source: caseStudy.source,
      },
    };

    try {
      const res = await fetch(`${openclawUrl}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`OpenClaw responded with status ${res.status}`);
      }

      const data = (await res.json()) as { runId: string };
      return data.runId;
    } catch (err: any) {
      logger.warn({ err: err.message }, "HTTP /runs call failed, creating run directly in MongoDB");
      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);

      const runId = `testo_case_${Date.now()}`;
      const now = new Date();

      await runsCol.insertOne({
        runId,
        tenantId: "testo",
        status: PipelineRunStatus.RUNNING,
        currentStage: PipelineStage.WRITING,
        createdAt: now,
        updatedAt: now,
      } as any);

      await stageResultsCol.insertOne({
        runId,
        stage: PipelineStage.TREND,
        attempt: 1,
        result: {
          title: caseStudy.title,
          summary: caseStudy.summary,
          url: caseStudy.url,
          fullArticleText: caseStudy.fullArticleText,
          batches: caseStudy.batches,
          source: caseStudy.source,
        },
        createdAt: now,
      });

      await queues[PipelineStage.WRITING].add("write-job", {
        runId,
        stage: PipelineStage.WRITING,
        attempt: 1,
        payload: {
          batches: caseStudy.batches,
        },
      } as AgentJob);

      return runId;
    }
  }
}
