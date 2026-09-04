import { createLogger } from "@pipeline/shared/logger";
import { parseCommand } from "../validation/command.schema.js";
import type { TelegramMessage } from "../types/telegram.types.js";
import type { TelegramApiService } from "../services/telegram-api.service.js";
import type { SystemController } from "../controllers/system.controller.js";
import type { CuratorController } from "../controllers/curator.controller.js";
import type { TrendsController } from "../controllers/trends.controller.js";

const logger = createLogger("telegram-bot:command-router");

export class CommandRouter {
  constructor(
    private telegramApi: TelegramApiService,
    private systemController: SystemController,
    private curatorController: CuratorController,
    private trendsController: TrendsController
  ) {}

  async route(msg: TelegramMessage): Promise<void> {
    const text = msg.text || "";
    const parsed = parseCommand(text);
    if (!parsed) return;

    const { command, args } = parsed;
    const chatId = msg.chat.id;

    logger.info({ command, args, chatId, userId: msg.from?.id }, "Routing bot command");

    switch (command) {
      case "/start":
      case "/help":
        await this.systemController.showWelcome(chatId);
        break;

      case "/trends":
        await this.trendsController.showTrendsMenu(chatId, msg.from?.id || 0);
        break;

      case "/daily_cinema":
      case "/curate_cinema":
        await this.curatorController.showCinemaMenu(chatId);
        break;

      case "/daily_tech":
      case "/curate_tech":
        await this.curatorController.showTechMenu(chatId);
        break;

      case "/daily_testo":
      case "/curate_testo":
        await this.curatorController.showTestoMenu(chatId);
        break;

      case "/post_cinema":
      case "/post_topic":
        await this.systemController.handleCustomPost(chatId, "cinema", args);
        break;

      case "/post_tech":
        await this.systemController.handleCustomPost(chatId, "tech", args);
        break;

      case "/post_testo":
        await this.systemController.handleCustomPost(chatId, "testo", args);
        break;

      case "/status":
        await this.systemController.showStatus(chatId);
        break;

      case "/logs":
        await this.systemController.showLogs(chatId, args);
        break;

      case "/test_pipeline":
        await this.systemController.runTestPipeline(chatId);
        break;

      case "/test_unit":
      case "/test":
        await this.systemController.runUnitTests(chatId);
        break;

      default:
        await this.telegramApi.sendMessage(
          chatId,
          `❓ Неизвестная команда: \`${command}\`. Введите /help для просмотра списка доступных действий.`
        );
        break;
    }
  }
}
