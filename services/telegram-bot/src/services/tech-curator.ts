import { createLogger } from "@pipeline/shared/logger";
import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc } from "@pipeline/shared/db";
import { PipelineStage, PipelineRunStatus, type AgentJob } from "@pipeline/shared";
import type { BotQueues } from "./test-runner.js";

const logger = createLogger("telegram-bot:tech-curator");

export interface CuratedTechArticle {
  title: string;
  url: string;
  summary: string;
  fullArticleText: string;
  batches?: string[];
  imageUrl?: string;
  source: string;
  publishedAt?: string;
  pillarId: string;
  category: "popular" | "fresh";
}

export class TechCuratorService {
  private userArticlesCache = new Map<number, CuratedTechArticle[]>();

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
      combined.includes("repo") ||
      combined.includes("github") ||
      combined.includes("open source") ||
      combined.includes("библиотек") ||
      combined.includes("инструмент") ||
      combined.includes("tools")
    ) {
      return "github-trending-repos";
    }

    if (
      combined.includes("architecture") ||
      combined.includes("архитектур") ||
      combined.includes("system design") ||
      combined.includes("микросервис") ||
      combined.includes("high-load") ||
      combined.includes("database") ||
      combined.includes("redis") ||
      combined.includes("postgres") ||
      combined.includes("keda") ||
      combined.includes("kubernetes")
    ) {
      return "architecture-deep-dive";
    }

    return "pet-projects-showcase";
  }

  getCuratorMenuKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: "🔥 Популярные тренды (Dev.to & HackerNews)", callback_data: "tech_mode:popular" },
        ],
        [
          { text: "⚡ Свежие репозитории (GitHub Trending)", callback_data: "tech_mode:fresh" },
        ],
        [
          { text: "🔙 Главное меню", callback_data: "cmd:main_menu" },
        ],
      ],
    };
  }

  formatArticleListMessage(
    articles: CuratedTechArticle[],
    mode: "popular" | "fresh"
  ): { text: string; replyMarkup: any } {
    const modeTitle =
      mode === "popular" ? "🔥 Популярные IT-тренды & Архитектура" : "⚡ Свежие Open-Source репозитории";

    let message = `💻 *Tech Radar: ${modeTitle}*\n\n`;
    message += `Выберите номер темы кнопкой ниже, чтобы запустить генерацию поста и карусели:\n\n`;

    articles.slice(0, 5).forEach((article, idx) => {
      const numEmoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][idx] || `${idx + 1}.`;
      message += `${numEmoji} *${article.title}*\n`;
      message += `📌 ${article.summary}\n`;
      message += `📂 Рубрика: \`${article.pillarId}\` | 🔗 [${article.source}](${article.url})\n\n`;
    });

    return {
      text: message,
      replyMarkup: this.getArticleSelectionKeyboard(articles, mode),
    };
  }

  getArticleSelectionKeyboard(articles: CuratedTechArticle[], mode: "popular" | "fresh") {
    const pickButtons = articles.slice(0, 5).map((_, idx) => ({
      text: `${["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][idx]} Выбрать`,
      callback_data: `tech_pick:${idx}`,
    }));

    const rows: any[] = [];
    for (let i = 0; i < pickButtons.length; i += 3) {
      rows.push(pickButtons.slice(i, i + 3));
    }

    rows.push([
      { text: "🔄 Обновить подборку", callback_data: `tech_refresh:${mode}` },
      { text: "🔙 Категории", callback_data: "cmd:daily_tech" },
    ]);

    return { inline_keyboard: rows };
  }

  saveUserArticles(userId: number, articles: CuratedTechArticle[]) {
    this.userArticlesCache.set(userId, articles);
  }

  getArticleByIndex(userId: number, index: number): CuratedTechArticle | undefined {
    const articles = this.userArticlesCache.get(userId);
    return articles ? articles[index] : undefined;
  }

  async fetchCuratedTopics(mode: "popular" | "fresh"): Promise<CuratedTechArticle[]> {
    try {
      const feedUrl =
        mode === "popular"
          ? "https://dev.to/feed/tag/architecture"
          : "https://dev.to/feed/tag/opensource";

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(feedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TechRadar/1.0)" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const xml = await res.text();
        const articles = this.parseRssXml(xml, mode);
        if (articles.length >= 3) {
          return articles;
        }
      }
    } catch (err: any) {
      logger.warn({ err: err.message, mode }, "Live Tech RSS fetch failed, using curated fallback");
    }

    return this.getFallbackArticles(mode);
  }

  private parseRssXml(xml: string, mode: "popular" | "fresh"): CuratedTechArticle[] {
    const items: CuratedTechArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const itemBlock = match[1] || "";
      const titleMatch = itemBlock.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || itemBlock.match(/<title>(.*?)<\/title>/i);
      const linkMatch = itemBlock.match(/<link>(.*?)<\/link>/i);
      const descMatch = itemBlock.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/i) || itemBlock.match(/<description>(.*?)<\/description>/i);

      if (titleMatch && titleMatch[1] && linkMatch && linkMatch[1]) {
        const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
        const url = linkMatch[1].trim();
        const rawDesc = descMatch && descMatch[1] ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";
        const summary = rawDesc.slice(0, 160) + (rawDesc.length > 160 ? "..." : "");
        const pillarId = this.detectPillar(title, rawDesc);
        const batches = this.batchArticleContent(rawDesc || title, 400);

        items.push({
          title,
          url,
          summary: summary || title,
          fullArticleText: rawDesc || title,
          batches,
          source: "Dev.to Tech",
          pillarId,
          category: mode,
        });
      }
    }

    return items;
  }

  getFallbackArticles(mode: "popular" | "fresh"): CuratedTechArticle[] {
    if (mode === "popular") {
      return [
        {
          title: "Архитектура очередей: BullMQ vs RabbitMQ в high-load Node.js микросервисах",
          url: "https://dev.to/architecture/bullmq-vs-rabbitmq",
          summary: "Сравнение задержек, пропускной способности (25k rps), персистентности и интеграции с KEDA autoscaling.",
          fullArticleText: "При проектировании асинхронных очередей в Node.js разработчики часто выбирают между Redis/BullMQ и RabbitMQ. BullMQ превосходит по низкой задержке (<2ms) и простоте TypeScript-интеграции, а RabbitMQ выигрывает в сложных топологиях маршрутизации.",
          batches: [
            "BullMQ на базе Redis обрабатывает до 25 000 job/sec на одном инстансе с субмиллисекундной задержкой.",
            "Бесшовная интеграция с Kubernetes KEDA позволяет масштабировать воркеры в 0 (Scale-to-Zero).",
            "RabbitMQ эффективнее при комплексном AMQP роутинге между разными языками программирования."
          ],
          source: "Architecture Insights",
          pillarId: "architecture-deep-dive",
          category: "popular",
        },
        {
          title: "Оптимизация индексов PostgreSQL: B-Tree, BRIN и GiST на таблицах от 100 млн строк",
          url: "https://dev.to/postgres/indexing-100m-rows",
          summary: "Как уменьшить размер индексов на 80% и ускорить аналитические запросы с помощью BRIN-индексов.",
          fullArticleText: "Стандартные B-Tree индексы на временных рядах могут занимать больше места, чем сами данные. BRIN-индексы хранят только минимум и максимум для страниц данных, экономя гигабайты RAM.",
          batches: [
            "BRIN-индексы занимают в десятки раз меньше места, чем B-Tree, при последовательной вставке данных.",
            "Частичные индексы (Partial Indexes) с условием WHERE ускоряют выборки активных статусов.",
            "EXPLAIN (ANALYZE, BUFFERS) помогает выявить узкие места в IO диска."
          ],
          source: "Database Engineering",
          pillarId: "architecture-deep-dive",
          category: "popular",
        },
        {
          title: "Event-Driven Autoscaling (KEDA) для микросервисов: как сэкономить 70% облачного бюджета",
          url: "https://dev.to/devops/keda-autoscaling-guide",
          summary: "Автоматическое масштабирование очередей задач в Kubernetes до 0 реплик в периоды простоя.",
          fullArticleText: "KEDA слушает длину очередей в Redis/RabbitMQ и поднимает поды только при наличии активных задач. В остальное время поды отключены, что снижает нагрузку на CPU/RAM.",
          batches: [
            "Scale-to-zero освобождает ресурсы ноды для других сервисов.",
            "Триггер Redis List / Stream мгновенно реагирует на появление задач в очереди.",
            "Cooldown период защищает от флаппинга подов при частых одиночных задачах."
          ],
          source: "DevOps & Cloud",
          pillarId: "architecture-deep-dive",
          category: "popular",
        },
      ];
    }

    return [
      {
        title: "Топ-3 open-source репозитория недели: FastHTML, sqlfluff и AirLLM",
        url: "https://github.com/trending",
        summary: "Обзор быстрорастущих инструментов для AI инференса, линтинга SQL и быстрой веб-разработки.",
        fullArticleText: "Подборка перспективных open-source проектов с открытым исходным кодом: FastHTML для создания веб-приложений без React, sqlfluff для автоформатирования SQL и AirLLM для запуска 70B моделей на 4GB VRAM.",
        batches: [
          "FastHTML позволяет собирать современные интерактивные веб-интерфейсы на чистом Python.",
          "sqlfluff обеспечивает строгий линтинг и унификацию стиля SQL в Data-командах.",
          "AirLLM оптимизирует загрузку слоев нейросетей, позволяя запускать тяжелые LLM на скромном железе."
        ],
        source: "GitHub Trending",
        pillarId: "github-trending-repos",
        category: "fresh",
      },
      {
        title: "Bun 1.2: Поддержка Node.js CJS/ESM совместимости, встроенный S3 клиент и TextDecoderStream",
        url: "https://bun.sh/blog/bun-v1.2",
        summary: "Разбор ключевых обновлений самого быстрого JavaScript runtime и бенчмарки с Node.js 22.",
        fullArticleText: "В релизе Bun 1.2 реализована полная совместимость с экосистемой Node.js пакетов, встроенный высокоскоростной S3 SDK и оптимизация сборщика мусора.",
        batches: [
          "Встроенный S3 клиент работает в 5 раз быстрее AWS SDK за счет нативной реализации на Zig.",
          "Устранена проблема импортов смешанных модулей ESM и CommonJS.",
          "Запуск TypeScript без предварительной транспиляции ускоряет локальный цикл разработки."
        ],
        source: "JavaScript & Tooling",
        pillarId: "github-trending-repos",
        category: "fresh",
      },
    ];
  }

  async launchGroundedPipeline(
    article: CuratedTechArticle,
    openclawUrl: string,
    queues: BotQueues
  ): Promise<string> {
    logger.info({ title: article.title, pillarId: article.pillarId }, "Triggering grounded pipeline for Tech Portal");

    const payload = {
      tenantId: "software-development-default",
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

      const runId = `tech_${Date.now()}`;
      const now = new Date();

      await runsCol.insertOne({
        runId,
        tenantId: "software-development-default",
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
