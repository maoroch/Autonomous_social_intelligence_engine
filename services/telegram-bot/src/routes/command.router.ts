import { createLogger } from "@pipeline/shared/logger";
import { parseCommand } from "../validation/command.schema.js";
import type { TelegramMessage } from "../types/telegram.types.js";
import type { TelegramApiService } from "../services/telegram-api.service.js";
import type { SystemController } from "../controllers/system.controller.js";
import type { CuratorController } from "../controllers/curator.controller.js";
import type { TrendsController } from "../controllers/trends.controller.js";
import type { AccessControlService } from "../services/access-control.service.js";

const logger = createLogger("telegram-bot:command-router");

export class CommandRouter {
  constructor(
    private telegramApi: TelegramApiService,
    private systemController: SystemController,
    private curatorController: CuratorController,
    private trendsController: TrendsController,
    private accessControl: AccessControlService
  ) {}

  async route(msg: TelegramMessage): Promise<void> {
    const text = msg.text || "";
    const parsed = parseCommand(text);
    if (!parsed) return;

    const { command, args } = parsed;
    const chatId = msg.chat.id;
    const userId = msg.from?.id || 0;

    logger.info({ command, args, chatId, userId }, "Routing bot command");

    // Проверка прав доступа через RBAC
    const accessCheck = await this.accessControl.canExecuteCommand(userId, command);
    if (!accessCheck.allowed) {
      logger.warn({ userId, command, reason: accessCheck.reason }, "Command execution blocked by RBAC");
      await this.telegramApi.sendMessage(
        chatId,
        accessCheck.reason || "⛔ У вашего аккаунта нет прав на выполнение данной команды."
      );
      return;
    }

    switch (command) {
      case "/start":
      case "/help":
        await this.systemController.showWelcome(chatId, userId);
        break;

      case "/my_role":
      case "/profile":
        await this.systemController.showMyRole(chatId, userId, msg.from?.username);
        break;

      case "/grant_role":
        await this.systemController.handleGrantRole(chatId, userId, args);
        break;

      case "/roles":
        await this.systemController.handleListRoles(chatId, userId);
        break;

      case "/manage_testo":
      case "/testo_admins":
        await this.systemController.showTestoAccessPanel(chatId, userId);
        break;

      case "/add_testo":
        await this.systemController.handleAddTestoAdminById(chatId, userId, args);
        break;

      case "/remove_testo":
        await this.systemController.handleRevokeTestoAdmin(chatId, userId, args);
        break;

      case "/trends":
        await this.trendsController.showTrendsMenu(chatId, userId);
        break;

      case "/testo_trends":
        await this.trendsController.showTestoTrends(chatId, userId);
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

