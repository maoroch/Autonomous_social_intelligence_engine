import { createLogger } from "@pipeline/shared/logger";
import type { TelegramApiService } from "../services/telegram-api.service.js";
import type { CinemaCuratorService } from "../services/cinema-curator.js";

const logger = createLogger("telegram-bot:trends-controller");

export class TrendsController {
  constructor(
    private telegramApi: TelegramApiService,
    private cinemaCurator: CinemaCuratorService
  ) {}

  /**
   * Загрузка живых трендов кино из реальных медиа СМИ через RSS-краулер
   * Возвращает подробные статьи со ссылками на источники, описанием и кнопками запуска
   */
  async showTrendsMenu(chatId: number | string, userId: number = 0): Promise<void> {
    logger.info({ chatId, userId }, "Fetching real cinema media trends via RSS crawler");
    const mode = "popular";
    const articles = await this.cinemaCurator.fetchCuratedTopics(mode);

    if (userId) {
      this.cinemaCurator.saveUserArticles(userId, articles);
    }

    const { text, replyMarkup } = this.cinemaCurator.formatArticleListMessage(articles, mode);
    await this.telegramApi.sendMessage(chatId, text, replyMarkup);
  }
}
