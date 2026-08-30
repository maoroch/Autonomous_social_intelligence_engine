import { createLogger } from "@pipeline/shared/logger";
import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc } from "@pipeline/shared/db";
import { PipelineStage, PipelineRunStatus, type AgentJob } from "@pipeline/shared";
import type { BotQueues } from "./test-runner.js";

import {
  TESTO_OFFICIAL_CATALOG,
  resolveTestoDeviceGrounding,
  formatTestoDeviceBatches,
  type TestoDeviceSpec,
} from "./testo-catalog.js";

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
        ? "🏭 Промышленные газоанализаторы & Экоконтроль (Testo 350 / 300 / 340 / 316)"
        : "🧪 Фармацевтический контроль & GxP (Testo Saveris / 190 / 174T / 883)";

    let message = `🏭 *Testo Dynamic Catalog & Radar: ${modeTitle}*\n\n`;
    message += `Выберите номер оборудования для генерации точного поста с верифицированными метрологическими характеристиками:\n\n`;

    articles.slice(0, 5).forEach((article, idx) => {
      const numEmoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][idx] || `${idx + 1}.`;
      message += `${numEmoji} *${article.title}*\n`;
      message += `📌 ${article.summary}\n`;
      message += `🏢 AZIA-TEST LLP | 🔗 [Официальная спецификация](${article.url})\n\n`;
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
    const specs = Object.values(TESTO_OFFICIAL_CATALOG);
    const filtered =
      mode === "gas"
        ? specs.filter((s) => s.category === "gas")
        : specs.filter((s) => s.category === "pharma" || s.category === "thermal");

    return filtered.map((spec: TestoDeviceSpec) => {
      const batches = formatTestoDeviceBatches(spec);
      return {
        title: spec.title,
        url: spec.url,
        summary: spec.summary,
        fullArticleText: `${spec.title}\n\n${batches.join("\n\n")}`,
        batches,
        source: spec.source,
        category: mode,
      };
    });
  }

  async launchGroundedPipeline(
    article: CuratedTestoArticle,
    openclawUrl: string,
    queues: BotQueues
  ): Promise<string> {
    logger.info({ title: article.title }, "Triggering grounded pipeline for Testo Portal");

    const payload = {
      tenantId: "testo",
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
        },
      } as AgentJob);

      return runId;
    }
  }
}
