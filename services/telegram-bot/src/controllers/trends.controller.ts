import { createLogger } from "@pipeline/shared/logger";
import type { TelegramApiService } from "../services/telegram-api.service.js";
import type { CinemaCuratorService } from "../services/cinema-curator.js";
import type { TestoCuratorService } from "../services/testo-curator.js";
import type { AccessControlService } from "../services/access-control.service.js";
import { UserRole } from "../types/actions.types.js";

const logger = createLogger("telegram-bot:trends-controller");

export class TrendsController {
  constructor(
    private telegramApi: TelegramApiService,
    private cinemaCurator: CinemaCuratorService,
    private testoCurator?: TestoCuratorService,
    private accessControl?: AccessControlService
  ) {}

  /**
   * Загрузка живых трендов:
   * - Для Testo Admin автоматически загружает зарубежные инженерные СМИ и кейсы оборудования Testo
   * - Для Cinema Admin / Superadmin по умолчанию открывает тренды киноиндустрии
   */
  async showTrendsMenu(chatId: number | string, userId: number = 0): Promise<void> {
    if (this.accessControl && this.testoCurator && userId) {
      const role = await this.accessControl.getUserRole(userId);
      if (role === UserRole.TESTO_ADMIN) {
        logger.info({ chatId, userId }, "User is Testo Admin, routing /trends to Testo Foreign Media Trends");
        await this.showTestoTrends(chatId, userId);
        return;
      }
    }

    logger.info({ chatId, userId }, "Fetching real cinema media trends via RSS crawler");
    const mode = "popular";
    const articles = await this.cinemaCurator.fetchCuratedTopics(mode);

    if (userId) {
      this.cinemaCurator.saveUserArticles(userId, articles);
    }

    const { text, replyMarkup } = this.cinemaCurator.formatArticleListMessage(articles, mode);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }

  /**
   * Загрузка трендов зарубежных СМИ и кейсов применения оборудования Testo
   */
  async showTestoTrends(chatId: number | string, userId: number = 0): Promise<void> {
    if (!this.testoCurator) {
      logger.warn("TestoCuratorService is not provided to TrendsController");
      return;
    }

    logger.info({ chatId, userId }, "Fetching Testo Foreign Media Trends & Instrument Cases");
    const articles = await this.testoCurator.fetchCuratedTopics("trends");

    if (userId) {
      this.testoCurator.saveUserArticles(userId, articles);
    }

    const { text, replyMarkup } = this.testoCurator.formatArticleListMessage(articles, "trends");
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }
}

