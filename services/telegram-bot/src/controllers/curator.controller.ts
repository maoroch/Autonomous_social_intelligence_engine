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
    const article = this.cinemaCurator.getArticleByIndex(userId, Number(indexStr));
    if (!article) {
      await this.telegramApi.sendMessage(
        chatId,
        "❌ Тема не найдена в кэше сессии. Пожалуйста, обновите подборку."
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
    const article = this.techCurator.getArticleByIndex(userId, Number(indexStr));
    if (!article) {
      await this.telegramApi.sendMessage(
        chatId,
        "❌ Тема не найдена в кэше. Пожалуйста, обновите подборку."
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
    const article = this.testoCurator.getArticleByIndex(userId, Number(indexStr));
    if (!article) {
      await this.telegramApi.sendMessage(
        chatId,
        "❌ Оборудование не найдено в кэше. Пожалуйста, обновите подборку."
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
