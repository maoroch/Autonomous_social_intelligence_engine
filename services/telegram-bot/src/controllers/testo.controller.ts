import { createLogger } from "@pipeline/shared/logger";
import type { TelegramApiService } from "../services/telegram-api.service.js";
import type { TestoMediaService } from "../services/testo-media.service.js";
import type { TestoCasesService } from "../services/testo-cases.service.js";
import type { TestoCuratorService } from "../services/testo-curator.js";
import type { BotQueues } from "../types/bot.types.js";

const logger = createLogger("telegram-bot:testo-controller");

export class TestoController {
  constructor(
    private telegramApi: TelegramApiService,
    private testoMediaService: TestoMediaService,
    private testoCasesService: TestoCasesService,
    private testoCuratorService: TestoCuratorService,
    private queues: BotQueues,
    private openclawUrl: string
  ) {}

  /**
   * Главное меню портала Testo Казахстан с раздельными разделами
   */
  async showTestoMenu(chatId: number | string): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "📰 Testo в мировых СМИ (/testo_media)", callback_data: "cmd:testo_media" },
        ],
        [
          { text: "📑 Международные кейсы внедрения (/testo_cases)", callback_data: "cmd:testo_cases" },
        ],
        [
          { text: "🏭 Газоанализаторы и ТЭЦ (Testo 350/300)", callback_data: "testo_mode:gas" },
        ],
        [
          { text: "🧪 Фармацевтика и GxP (Testo 190/Saveris)", callback_data: "testo_mode:pharma" },
        ],
        [
          { text: "🔙 Главное меню", callback_data: "cmd:main_menu" },
        ],
      ],
    };

    await this.telegramApi.sendMessage(
      chatId,
      `🏭 *Testo Казахстан — Портал промышленного контроля*\n\n` +
      `Выберите источник для формирования публикации:\n` +
      `• *Testo в мировых СМИ* — живые статьи и обзоры в зарубежной прессе\n` +
      `• *Кейсы внедрения* — подтвержденные Application Reports с заводов и ТЭЦ\n` +
      `• *Каталог оборудования* — прямое заземление на технические паспорта AZIA-TEST`,
      keyboard
    );
  }

  // ==================== 1. TESTO В МИРОВЫХ СМИ ====================

  async showMediaMenu(chatId: number | string, userId: number = 0): Promise<void> {
    logger.info({ chatId, userId }, "Displaying Testo foreign media mentions");
    const articles = await this.testoMediaService.fetchArticles();
    if (userId) {
      this.testoMediaService.saveUserArticles(userId, articles);
    }
    const { text, replyMarkup } = this.testoMediaService.formatArticleListMessage(articles);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }

  async handleMediaPick(
    chatId: number | string,
    userId: number,
    indexStr: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🚀 Запуск пайплайна Testo СМИ...");
    }
    const idx = Number(indexStr);
    let article = !isNaN(idx) ? this.testoMediaService.getArticleByIndex(userId, idx) : undefined;

    if (!article) {
      const fallbackList = await this.testoMediaService.fetchArticles();
      this.testoMediaService.saveUserArticles(userId, fallbackList);
      article = fallbackList[idx] || fallbackList[0];
    }

    if (!article) {
      await this.telegramApi.sendMessage(chatId, "❌ Не удалось загрузить статью СМИ. Попробуйте /testo_media.");
      return;
    }

    const runId = await this.testoMediaService.launchGroundedPipeline(
      article,
      this.openclawUrl,
      this.queues
    );

    await this.telegramApi.sendMessage(
      chatId,
      `🚀 *Запущен пайплайн Testo Media*: \`${runId}\`\n\n📰 *Статья:* ${article.title}\n📖 *Издание:* ${article.source}`
    );
  }

  async handleMediaRefresh(
    chatId: number | string,
    userId: number,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🔄 Обновляю ленту СМИ Testo...");
    }
    const articles = await this.testoMediaService.fetchArticles();
    if (userId) {
      this.testoMediaService.saveUserArticles(userId, articles);
    }
    const { text, replyMarkup } = this.testoMediaService.formatArticleListMessage(articles);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }

  // ==================== 2. МЕЖДУНАРОДНЫЕ КЕЙСЫ ВНЕДРЕНИЯ ====================

  async showCasesMenu(chatId: number | string, userId: number = 0): Promise<void> {
    logger.info({ chatId, userId }, "Displaying Testo international case studies");
    const cases = await this.testoCasesService.fetchCases();
    if (userId) {
      this.testoCasesService.saveUserCases(userId, cases);
    }
    const { text, replyMarkup } = this.testoCasesService.formatCasesListMessage(cases);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }

  async handleCasesPick(
    chatId: number | string,
    userId: number,
    indexStr: string,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🚀 Запуск пайплайна Testo Case...");
    }
    const idx = Number(indexStr);
    let caseStudy = !isNaN(idx) ? this.testoCasesService.getCaseByIndex(userId, idx) : undefined;

    if (!caseStudy) {
      const fallbackList = await this.testoCasesService.fetchCases();
      this.testoCasesService.saveUserCases(userId, fallbackList);
      caseStudy = fallbackList[idx] || fallbackList[0];
    }

    if (!caseStudy) {
      await this.telegramApi.sendMessage(chatId, "❌ Не удалось загрузить кейс. Попробуйте /testo_cases.");
      return;
    }

    const runId = await this.testoCasesService.launchGroundedPipeline(
      caseStudy,
      this.openclawUrl,
      this.queues
    );

    await this.telegramApi.sendMessage(
      chatId,
      `🚀 *Запущен пайплайн Testo Case*: \`${runId}\`\n\n📑 *Кейс:* ${caseStudy.title}\n🛠 *Оборудование:* ${caseStudy.instrumentModel}`
    );
  }

  async handleCasesRefresh(
    chatId: number | string,
    userId: number,
    callbackQueryId?: string
  ): Promise<void> {
    if (callbackQueryId) {
      await this.telegramApi.answerCallbackQuery(callbackQueryId, "🔄 Обновляю кейсы Testo...");
    }
    const cases = await this.testoCasesService.fetchCases();
    if (userId) {
      this.testoCasesService.saveUserCases(userId, cases);
    }
    const { text, replyMarkup } = this.testoCasesService.formatCasesListMessage(cases);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }
}
