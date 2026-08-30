import { createLogger } from "@pipeline/shared/logger";
import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc } from "@pipeline/shared/db";
import { PipelineStage, PipelineRunStatus, type AgentJob } from "@pipeline/shared";
import type { BotQueues } from "./test-runner.js";

const logger = createLogger("telegram-bot:testo-curator");

export interface CuratedTestoArticle {
  title: string;
  url: string;
  summary: string;
  fullArticleText: string;
  batches?: string[];
  imageUrl?: string;
  source: string;
  publishedAt?: string;
  pillarId: string;
  category: "gas" | "pharma";
}

export class TestoCuratorService {
  private userArticlesCache = new Map<number, CuratedTestoArticle[]>();

  batchArticleContent(fullText: string, maxBatchChars = 600): string[] {
    if (!fullText) return [];

    const paragraphs = fullText
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    if (paragraphs.length === 0) {
      return [fullText.substring(0, maxBatchChars)];
    }

    const batches: string[] = [];
    let currentBatch = "";

    for (const para of paragraphs) {
      if ((currentBatch + " " + para).length > maxBatchChars && currentBatch) {
        batches.push(currentBatch.trim());
        currentBatch = para;
      } else {
        currentBatch = currentBatch ? `${currentBatch}\n${para}` : para;
      }
    }

    if (currentBatch.trim()) {
      batches.push(currentBatch.trim());
    }

    return batches;
  }

  detectPillar(title: string, text: string): string {
    const combined = `${title} ${text}`.toLowerCase();

    if (
      combined.includes("gxp") ||
      combined.includes("21 cfr") ||
      combined.includes("pharm") ||
      combined.includes("фармацевт") ||
      combined.includes("валидац") ||
      combined.includes("saveris") ||
      combined.includes("чистые помещения")
    ) {
      return "pharma-compliance-explained";
    }

    if (
      combined.includes("cold chain") ||
      combined.includes("холодов") ||
      combined.includes("gdp") ||
      combined.includes("логгер") ||
      combined.includes("174t") ||
      combined.includes("термокартирован")
    ) {
      return "pharma-cold-chain-story";
    }

    if (
      combined.includes("утечк") ||
      combined.includes("316") ||
      combined.includes("метан") ||
      combined.includes("взрывозащит") ||
      combined.includes("ex")
    ) {
      return "gas-safety-leak-detection";
    }

    if (
      combined.includes("котел") ||
      combined.includes("котл") ||
      combined.includes("горелк") ||
      combined.includes("300") ||
      combined.includes("кпд") ||
      combined.includes("избыток воздуха")
    ) {
      return "gas-boiler-efficiency";
    }

    return "gas-industrial-emissions";
  }

  getCuratorMenuKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: "🏭 Газоанализаторы и Экология (ТЭЦ, Котлы, Печи)", callback_data: "testo_mode:gas" },
        ],
        [
          { text: "🧪 Фармацевтика & Чистые помещения (GxP, 21 CFR)", callback_data: "testo_mode:pharma" },
        ],
        [
          { text: "🔙 Главное меню", callback_data: "cmd:main_menu" },
        ],
      ],
    };
  }

  formatArticleListMessage(
    articles: CuratedTestoArticle[],
    mode: "gas" | "pharma"
  ): { text: string; replyMarkup: any } {
    const modeTitle =
      mode === "gas"
        ? "🏭 Промышленные газоанализаторы & Экоконтроль (Testo 350 / 300)"
        : "🧪 Фармацевтический контроль & GxP (Testo Saveris / 190)";

    let message = `🏭 *Testo Kazakhstan Radar: ${modeTitle}*\n\n`;
    message += `Выберите номер экспертной темы для запуска генерации карусели и технического поста:\n\n`;

    articles.slice(0, 5).forEach((article, idx) => {
      const numEmoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][idx] || `${idx + 1}.`;
      message += `${numEmoji} *${article.title}*\n`;
      message += `📌 ${article.summary}\n`;
      message += `📂 Рубрика: \`${article.pillarId}\` | 🏢 AZIA-TEST LLP\n\n`;
    });

    return {
      text: message,
      replyMarkup: this.getArticleSelectionKeyboard(articles, mode),
    };
  }

  getArticleSelectionKeyboard(articles: CuratedTestoArticle[], mode: "gas" | "pharma") {
    const pickButtons = articles.slice(0, 5).map((_, idx) => ({
      text: `${["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][idx]} Выбрать`,
      callback_data: `testo_pick:${idx}`,
    }));

    const rows: any[] = [];
    for (let i = 0; i < pickButtons.length; i += 3) {
      rows.push(pickButtons.slice(i, i + 3));
    }

    rows.push([
      { text: "🔄 Обновить подборку", callback_data: `testo_refresh:${mode}` },
      { text: "🔙 Категории Testo", callback_data: "cmd:daily_testo" },
    ]);

    return { inline_keyboard: rows };
  }

  saveUserArticles(userId: number, articles: CuratedTestoArticle[]) {
    this.userArticlesCache.set(userId, articles);
  }

  getArticleByIndex(userId: number, index: number): CuratedTestoArticle | undefined {
    const articles = this.userArticlesCache.get(userId);
    return articles ? articles[index] : undefined;
  }

  async fetchCuratedTopics(mode: "gas" | "pharma"): Promise<CuratedTestoArticle[]> {
    return this.getFallbackArticles(mode);
  }

  getFallbackArticles(mode: "gas" | "pharma"): CuratedTestoArticle[] {
    if (mode === "gas") {
      return [
        {
          title: "Сферы применения газоанализатора Testo 350: от котельных до металлургии и ТЭЦ",
          url: "https://testo.kz/catalog/gas/testo-350",
          summary: "Запатентованная подготовка пробы (+3°C Пельтье) и измерение NOx/CO/SO2 при экстремальных температурах до +1800°C.",
          fullArticleText: "Промышленный газоанализатор Testo 350 применяется для режимно-наладочных испытаний (РНИ) котлов, контроля выбросов на ТЭЦ и металлургических печах. Блок осушки на элементе Пельтье защищает датчики от влаги, предотвращая вымывание NO2 и SO2.",
          batches: [
            "Подготовка пробы с элементом Пельтье охлаждает дымовые газы ровно до +3°C, исключая потерю водорастворимого NO2 и SO2.",
            "Разбавление пробы в 40 раз расширяет диапазон измерения CO до 40 000 ppm при наладке мощных промышленных горелок.",
            "Официальный дистрибьютор Testo в Казахстане ТОО AZIA-TEST обеспечивает первичную государственную поверку в реестре ГСИ РК."
          ],
          source: "Testo Industrial Engineering",
          pillarId: "gas-industrial-emissions",
          category: "gas",
        },
        {
          title: "Наладка промышленных котлов с Testo 300: расчет коэффициента избытка воздуха (Alpha) и экономия газа",
          url: "https://testo.kz/catalog/gas/testo-300",
          summary: "Как смарт-анализатор Testo 300 помогает снизить удельный расход природного газа на 3-7% за счет точной настройки соотношения газ/воздух.",
          fullArticleText: "Testo 300 оснащен сенсорами с защитой от перегрузки CO до 30 000 ppm и сенсорным экраном. Анализатор в реальном времени рассчитывает КПД котла, потери тепла с уходящими газами (qA) и коэффициент лямбда (Alpha).",
          batches: [
            "Сенсоры Longlife со сроком службы до 6 лет снижают эксплуатационные затраты сервисных служб котельных.",
            "Прямой расчет коэффициента избытка воздуха (Alpha/Lambda) и потерь qA на русском интерфейсе.",
            "Быстрое формирование отчетов и отправка протоколов наладки по Wi-Fi прямо с объекта."
          ],
          source: "Testo Boiler Systems",
          pillarId: "gas-boiler-efficiency",
          category: "gas",
        },
        {
          title: "Взрывобезопасный детектор утечек газа Testo 316-EX (ATEX): локализация метана и пропана в закрытых узлах",
          url: "https://testo.kz/catalog/gas/testo-316-ex",
          summary: "Сертификация ATEX 2G / 2D для безопасного поиска микроутечек углеводородов в котельных, ГРУ и подземных газопроводах.",
          fullArticleText: "Прибор Testo 316-EX определяет концентрацию горючих газов в диапазоне от 1 ppm до 100% НКПР (LEL). Гибкий зонд позволяет обследовать труднодоступные фланцевые соединения и резьбы.",
          batches: [
            "Сертификат взрывобезопасности ATEX II 2G Ex ib IIC T1 Gb позволяет работать во взрывоопасных зонах класса 1 и 2.",
            "Оптическая и акустическая сигнализация со шкалой прогресса моментально указывает направление к месту утечки.",
            "Переключение между метаном, пропаном и водородом одной кнопкой."
          ],
          source: "Testo Safety Gas",
          pillarId: "gas-safety-leak-detection",
          category: "gas",
        },
      ];
    }

    return [
      {
        title: "Автоматизация 21 CFR Part 11 и GxP на фармскладах: непрерывный мониторинг Testo Saveris Pharma",
        url: "https://testo.kz/catalog/pharma/testo-saveris",
        summary: "Беспроводные датчики, централизованный Audit Trail, электронные подписи и мгновенное оповещение об отклонении температуры.",
        fullArticleText: "Система Testo Saveris Pharma разработана специально для фармацевтических производств и складов по стандартам GxP/FDA 21 CFR Part 11. Все события, изменения порогов и тревоги фиксируются в защищенном журнале Audit Trail.",
        batches: [
          "100% соответствие требованиям FDA 21 CFR Part 11: защита данных от ручного редактирования и встроенный неизменяемый Audit Trail.",
          "Беспроводные радиодатчики и Ethernet-модули обеспечивают сбор данных с сотен точек хранения медикаментов.",
          "Сертифицированная валидация ПО и квалификация IQ/OQ от сертифицированных инженеров ТОО AZIA-TEST."
        ],
        source: "Testo Pharma Compliance",
        pillarId: "pharma-compliance-explained",
        category: "pharma",
      },
      {
        title: "Квалификация автоклавов и термокамер: беспроводные CFR-логгеры Testo 190 T3/T4",
        url: "https://testo.kz/catalog/pharma/testo-190",
        summary: "Высокотемпературные логгеры давления и температуры (-50°C до +140°C) для валидации процессов стерилизации и лиофилизации.",
        fullArticleText: "Логгеры Testo 190 CFR из нержавеющей стали с классом защиты IP68 выдерживают циклы стерилизации паром под давлением. Программное обеспечение автоматически рассчитывает летальность процесса (F0-value).",
        batches: [
          "Диапазон измерений температуры от -50°C до +140°C и давления до 4 бар без кабелей и внешних зондов.",
          "Автоматический расчет значений стерилизующего эффекта F0 в соответствии с фармакопейными статьями.",
          "Программирование и считывание до 8 логгеров одновременно через удобный USB-интерфейс."
        ],
        source: "Testo Pharma Validation",
        pillarId: "pharma-compliance-explained",
        category: "pharma",
      },
    ];
  }

  async launchGroundedPipeline(
    article: CuratedTestoArticle,
    openclawUrl: string,
    queues: BotQueues
  ): Promise<string> {
    logger.info({ title: article.title, pillarId: article.pillarId }, "Triggering grounded pipeline for Testo Portal");

    const payload = {
      tenantId: "testo",
      targetPillarId: article.pillarId,
      topic: {
        title: article.title,
        summary: article.summary,
        url: article.url,
        fullArticleText: article.fullArticleText,
        batches: article.batches && article.batches.length > 0 ? article.batches : [article.summary],
        coverUrl: article.imageUrl,
        source: article.source,
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

      const runId = `testo_${Date.now()}`;
      const now = new Date();

      await runsCol.insertOne({
        runId,
        tenantId: "testo",
        contentPillarId: article.pillarId,
        status: PipelineRunStatus.RUNNING,
        currentStage: PipelineStage.WRITING,
        targetPillarId: article.pillarId,
        createdAt: now,
        updatedAt: now,
      } as any);

      await stageResultsCol.insertOne({
        runId,
        stage: PipelineStage.TREND,
        attempt: 1,
        result: {
          title: article.title,
          summary: article.summary,
          url: article.url,
          fullArticleText: article.fullArticleText,
          batches: article.batches,
          coverUrl: article.imageUrl,
          source: article.source,
        },
        createdAt: now,
      });

      await queues[PipelineStage.WRITING].add("write-job", {
        runId,
        stage: PipelineStage.WRITING,
        attempt: 1,
        payload: {
          batches: article.batches,
          targetPillarId: article.pillarId,
        },
      } as AgentJob);

      return runId;
    }
  }
}
