import { createLogger } from "@pipeline/shared/logger";
import type { TelegramApiService } from "../services/telegram-api.service.js";
import type { CinemaCuratorService } from "../services/cinema-curator.js";
import type { TechCuratorService } from "../services/tech-curator.js";
import type { TestoCuratorService } from "../services/testo-curator.js";
import type { BotQueues } from "../types/bot.types.js";

const logger = createLogger("telegram-bot:curator-controller");

export class CuratorController {
  constructor(
    private telegramApi: TelegramApiService,
    private cinemaCurator: CinemaCuratorService,
    private techCurator: TechCuratorService,
    private testoCurator: TestoCuratorService,
    private queues: BotQueues,
    private openclawUrl: string
  ) {}

  // ==================== CINEMA CURATOR ====================

  async showCinemaMenu(chatId: number | string): Promise<void> {
    await this.telegramApi.sendMessage(
      chatId,
      `🎬 *KinoPeek News Radar — Выберите категорию тем:*\n\n` +
      `Какой тип тем вы хотите получить от краулера перед запуском пайплайна?`,
      this.cinemaCurator.getCuratorMenuKeyboard()
    );
  }

  async handleCinemaMode(
    chatId: number | string,
    userId: number,
    modeParam: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🔎 Ищу кино-новости...");
    }
    const mode = modeParam === "popular" ? "popular" : "fresh";
    const articles = await this.cinemaCurator.fetchCuratedTopics(mode);
    this.cinemaCurator.saveUserArticles(userId, articles);
    const { text, replyMarkup } = this.cinemaCurator.formatArticleListMessage(articles, mode);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }

  async handleCinemaPick(
    chatId: number | string,
    userId: number,
    indexStr: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🚀 Запуск пайплайна...");
    }
    const idx = Number(indexStr);
    let article = !isNaN(idx) ? this.cinemaCurator.getArticleByIndex(userId, idx) : undefined;

    // Автоматическое восстановление при перезапуске бота или устаревшем кэше
    if (!article) {
      logger.info({ userId, indexStr }, "Cinema topic not in session cache, auto-refreshing topics");
      const fallbackList = await this.cinemaCurator.fetchCuratedTopics("popular");
      this.cinemaCurator.saveUserArticles(userId, fallbackList);
      if (!isNaN(idx) && fallbackList[idx]) {
        article = fallbackList[idx];
      } else {
        const normalized = indexStr.toLowerCase().replace(/_/g, " ");
        article = fallbackList.find((a) => a.title.toLowerCase().includes(normalized)) || fallbackList[0];
      }
    }

    if (!article) {
      await this.telegramApi.sendMessage(
        chatId,
        "❌ Не удалось загрузить тему. Пожалуйста, нажмите /trends для обновления подборки."
      );
      return;
    }
    const runId = await this.cinemaCurator.launchGroundedPipeline(
      article,
      this.openclawUrl,
      this.queues
    );
    await this.telegramApi.sendMessage(
      chatId,
      `🚀 *Запущен кино-пайплайн (KinoPeek)*: \`${runId}\`\n\n🎬 *Тема:* ${article.title}\n📖 *Источник:* ${article.source}`
    );
  }

  async handleCinemaRefresh(
    chatId: number | string,
    userId: number,
    modeParam: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🔄 Обновляю подборку KinoPeek...");
    }
    const mode = modeParam === "popular" ? "popular" : "fresh";
    const articles = await this.cinemaCurator.fetchCuratedTopics(mode);
    this.cinemaCurator.saveUserArticles(userId, articles);
    const { text, replyMarkup } = this.cinemaCurator.formatArticleListMessage(articles, mode);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }

  // ==================== TECH CURATOR ====================

  async showTechMenu(chatId: number | string): Promise<void> {
    await this.telegramApi.sendMessage(
      chatId,
      `💻 *Tech Radar — Выберите категорию тем:*\n\n` +
      `Что вы хотите сгенерировать сегодня для Tech Portal?`,
      this.techCurator.getCuratorMenuKeyboard()
    );
  }

  async handleTechMode(
    chatId: number | string,
    userId: number,
    modeParam: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🔎 Собираю IT-тренды...");
    }
    const mode = modeParam === "popular" ? "popular" : "fresh";
    const articles = await this.techCurator.fetchCuratedTopics(mode);
    this.techCurator.saveUserArticles(userId, articles);
    const { text, replyMarkup } = this.techCurator.formatArticleListMessage(articles, mode);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }

  async handleTechPick(
    chatId: number | string,
    userId: number,
    indexStr: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🚀 Запуск пайплайна...");
    }
    const idx = Number(indexStr);
    let article = !isNaN(idx) ? this.techCurator.getArticleByIndex(userId, idx) : undefined;

    if (!article) {
      logger.info({ userId, indexStr }, "Tech topic not in session cache, auto-refreshing topics");
      const fallbackList = await this.techCurator.fetchCuratedTopics("popular");
      this.techCurator.saveUserArticles(userId, fallbackList);
      if (!isNaN(idx) && fallbackList[idx]) {
        article = fallbackList[idx];
      } else {
        const normalized = indexStr.toLowerCase().replace(/_/g, " ");
        article = fallbackList.find((a) => a.title.toLowerCase().includes(normalized)) || fallbackList[0];
      }
    }

    if (!article) {
      await this.telegramApi.sendMessage(
        chatId,
        "❌ Не удалось загрузить тему. Пожалуйста, нажмите /daily_tech для обновления."
      );
      return;
    }
    const runId = await this.techCurator.launchGroundedPipeline(
      article,
      this.openclawUrl,
      this.queues
    );
    await this.telegramApi.sendMessage(
      chatId,
      `🚀 *Запущен пайплайн*: \`${runId}\`\n\n💻 *Тема:* ${article.title}`
    );
  }

  async handleTechRefresh(
    chatId: number | string,
    userId: number,
    modeParam: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🔄 Обновляю подборку Tech Radar...");
    }
    const mode = modeParam === "popular" ? "popular" : "fresh";
    const articles = await this.techCurator.fetchCuratedTopics(mode);
    this.techCurator.saveUserArticles(userId, articles);
    const { text, replyMarkup } = this.techCurator.formatArticleListMessage(articles, mode);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }

  // ==================== TESTO CURATOR ====================

  async showTestoMenu(chatId: number | string): Promise<void> {
    await this.telegramApi.sendMessage(
      chatId,
      `🏭 *Testo Kazakhstan Radar — Выберите отрасль:*\n\n` +
      `Какое направление оборудования Testo вы хотите раскрыть в публикации?`,
      this.testoCurator.getCuratorMenuKeyboard()
    );
  }

  async handleTestoMode(
    chatId: number | string,
    userId: number,
    modeParam: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🏭 Загружаю каталог Testo...");
    }
    const mode = modeParam === "gas" ? "gas" : "pharma";
    const articles = await this.testoCurator.fetchCuratedTopics(mode);
    this.testoCurator.saveUserArticles(userId, articles);
    const { text, replyMarkup } = this.testoCurator.formatArticleListMessage(articles, mode);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }

  async handleTestoPick(
    chatId: number | string,
    userId: number,
    indexStr: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🚀 Запуск пайплайна Testo...");
    }
    const idx = Number(indexStr);
    let article = !isNaN(idx) ? this.testoCurator.getArticleByIndex(userId, idx) : undefined;

    if (!article) {
      logger.info({ userId, indexStr }, "Testo topic not in session cache, auto-refreshing topics");
      const fallbackList = await this.testoCurator.fetchCuratedTopics("pharma");
      this.testoCurator.saveUserArticles(userId, fallbackList);
      if (!isNaN(idx) && fallbackList[idx]) {
        article = fallbackList[idx];
      } else {
        const normalized = indexStr.toLowerCase().replace(/_/g, " ");
        article = fallbackList.find((a) => a.title.toLowerCase().includes(normalized)) || fallbackList[0];
      }
    }

    if (!article) {
      await this.telegramApi.sendMessage(
        chatId,
        "❌ Не удалось загрузить тему. Пожалуйста, нажмите /daily_testo для обновления."
      );
      return;
    }
    const runId = await this.testoCurator.launchGroundedPipeline(
      article,
      this.openclawUrl,
      this.queues
    );
    await this.telegramApi.sendMessage(
      chatId,
      `🚀 *Запущен пайплайн Testo*: \`${runId}\`\n\n🏭 *Тема:* ${article.title}`
    );
  }

  async handleTestoRefresh(
    chatId: number | string,
    userId: number,
    modeParam: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🔄 Обновляю каталог Testo...");
    }
    const mode = modeParam === "gas" ? "gas" : "pharma";
    const articles = await this.testoCurator.fetchCuratedTopics(mode);
    this.testoCurator.saveUserArticles(userId, articles);
    const { text, replyMarkup } = this.testoCurator.formatArticleListMessage(articles, mode);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }
}
