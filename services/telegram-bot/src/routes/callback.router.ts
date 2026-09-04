import { createLogger } from "@pipeline/shared/logger";
import { parseCallbackData } from "../validation/callback.schema.js";
import { CallbackAction } from "../types/actions.types.js";
import type { TelegramCallbackQuery } from "../types/telegram.types.js";
import type { TelegramApiService } from "../services/telegram-api.service.js";
import type { ApprovalController } from "../controllers/approval.controller.js";
import type { CuratorController } from "../controllers/curator.controller.js";
import type { TrendsController } from "../controllers/trends.controller.js";
import type { SystemController } from "../controllers/system.controller.js";
import type { TestoController } from "../controllers/testo.controller.js";
import type { AccessControlService } from "../services/access-control.service.js";

const logger = createLogger("telegram-bot:callback-router");

export class CallbackRouter {
  constructor(
    private telegramApi: TelegramApiService,
    private approvalController: ApprovalController,
    private curatorController: CuratorController,
    private trendsController: TrendsController,
    private systemController: SystemController,
    private accessControl: AccessControlService,
    private testoController?: TestoController
  ) {}

  async route(cb: TelegramCallbackQuery): Promise<void> {
    if (!cb.data) {
      return;
    }

    const parseResult = parseCallbackData(cb.data);
    if (!parseResult.success) {
      logger.warn({ err: parseResult.error, rawData: cb.data }, "Invalid callback data received");
      await this.telegramApi.answerCallbackQuery(cb.id, `⚠️ Неизвестное действие: ${cb.data}`, true);
      return;
    }

    const { action, param } = parseResult.data;
    const chatId = cb.message?.chat.id;
    const userId = cb.from.id;

    logger.info({ action, param, userId, chatId }, "Routing callback query");

    // Проверка прав доступа через RBAC
    const accessCheck = await this.accessControl.canExecuteAction(userId, action, param);
    if (!accessCheck.allowed) {
      logger.warn({ userId, action, param, reason: accessCheck.reason }, "Callback blocked by RBAC");
      await this.telegramApi.answerCallbackQuery(
        cb.id,
        accessCheck.reason || "⛔ Действие запрещено вашей ролью.",
        true
      );
      return;
    }

    try {
      switch (action) {
        // === APPROVAL ACTIONS ===
        case CallbackAction.APPROVE_RUN:
          await this.approvalController.handleApproveRun(cb, param);
          break;
        case CallbackAction.REJECT_RUN:
          await this.approvalController.handleRejectRun(cb, param);
          break;
        case CallbackAction.VIEW_CAROUSEL:
          await this.approvalController.handleViewCarousel(cb, param);
          break;
        case CallbackAction.VIEW_FULL_TEXT:
          await this.approvalController.handleViewFullText(cb, param);
          break;
        case CallbackAction.UPLOAD_COVER:
          await this.approvalController.handleUploadCover(cb, param);
          break;
        case CallbackAction.EDIT_TEXT:
          await this.approvalController.handleEditText(cb, param);
          break;
        case CallbackAction.REGENERATE_WRITING:
          await this.approvalController.handleRegenerateWriting(cb, param);
          break;
        case CallbackAction.REGENERATE_DESIGN:
          await this.approvalController.handleRegenerateDesign(cb, param);
          break;
        case CallbackAction.VIEW_LOGS:
          await this.approvalController.handleViewLogs(cb, param);
          break;

        // === TRENDS & CINEMA ACTIONS ===
        case CallbackAction.TREND_PICK:
        case CallbackAction.CINEMA_PICK:
          if (!chatId) return;
          await this.curatorController.handleCinemaPick(chatId, userId, param, cb.id);
          break;

        // === CINEMA CURATOR ===
        case CallbackAction.CINEMA_MODE:
          if (!chatId) return;
          await this.curatorController.handleCinemaMode(chatId, userId, param, cb.id);
          break;

        case CallbackAction.CINEMA_REFRESH:
          if (!chatId) return;
          await this.curatorController.handleCinemaRefresh(chatId, userId, param, cb.id);
          break;

        // === TECH CURATOR ===
        case CallbackAction.TECH_MODE:
          if (!chatId) return;
          await this.curatorController.handleTechMode(chatId, userId, param, cb.id);
          break;
        case CallbackAction.TECH_PICK:
          if (!chatId) return;
          await this.curatorController.handleTechPick(chatId, userId, param, cb.id);
          break;
        case CallbackAction.TECH_REFRESH:
          if (!chatId) return;
          await this.curatorController.handleTechRefresh(chatId, userId, param, cb.id);
          break;

        // === TESTO CURATOR ===
        case CallbackAction.TESTO_MODE:
          if (!chatId) return;
          await this.curatorController.handleTestoMode(chatId, userId, param, cb.id);
          break;
        case CallbackAction.TESTO_PICK:
          if (!chatId) return;
          await this.curatorController.handleTestoPick(chatId, userId, param, cb.id);
          break;
        case CallbackAction.TESTO_REFRESH:
          if (!chatId) return;
          await this.curatorController.handleTestoRefresh(chatId, userId, param, cb.id);
          break;

        // === TESTO MEDIA & CASES ISOLATED ACTIONS ===
        case CallbackAction.TESTO_MEDIA_PICK:
          if (!chatId) return;
          if (this.testoController) {
            await this.testoController.handleMediaPick(chatId, userId, param, cb.id);
          }
          break;
        case CallbackAction.TESTO_MEDIA_REFRESH:
          if (!chatId) return;
          if (this.testoController) {
            await this.testoController.handleMediaRefresh(chatId, userId, cb.id);
          }
          break;
        case CallbackAction.TESTO_CASES_PICK:
          if (!chatId) return;
          if (this.testoController) {
            await this.testoController.handleCasesPick(chatId, userId, param, cb.id);
          }
          break;
        case CallbackAction.TESTO_CASES_REFRESH:
          if (!chatId) return;
          if (this.testoController) {
            await this.testoController.handleCasesRefresh(chatId, userId, cb.id);
          }
          break;

        // === TESTO ACCESS MANAGEMENT ===
        case CallbackAction.REVOKE_TESTO:
          if (!chatId) return;
          await this.systemController.handleRevokeTestoAdmin(chatId, userId, param, cb.id);
          break;

        // === MENU COMMANDS ===
        case CallbackAction.CMD:
          await this.handleMenuCommand(cb, param);
          break;

        default:
          logger.warn({ action, param }, "Unhandled callback action in router");
          await this.telegramApi.answerCallbackQuery(cb.id, "Команда не поддерживается", true);
          break;
      }
    } catch (err) {
      logger.error({ err, action, param }, "Error executing callback route");
      await this.telegramApi.answerCallbackQuery(cb.id, "Ошибка при обработке действия", true);
    }
  }

  private async handleMenuCommand(cb: TelegramCallbackQuery, command: string): Promise<void> {
    await this.telegramApi.answerCallbackQuery(cb.id);
    const chatId = cb.message?.chat.id;
    if (!chatId) return;

    switch (command) {
      case "manage_testo":
        await this.systemController.showTestoAccessPanel(chatId, cb.from.id);
        break;
      case "add_testo_prompt":
        await this.systemController.promptAddTestoAdmin(chatId, cb.from.id);
        break;
      case "testo_media":
        if (this.testoController) {
          await this.testoController.showMediaMenu(chatId, cb.from.id);
        } else {
          await this.trendsController.showTestoTrends(chatId, cb.from.id);
        }
        break;
      case "testo_cases":
        if (this.testoController) {
          await this.testoController.showCasesMenu(chatId, cb.from.id);
        } else {
          await this.trendsController.showTestoTrends(chatId, cb.from.id);
        }
        break;
      case "trends":
        await this.trendsController.showTrendsMenu(chatId, cb.from.id);
        break;
      case "daily_cinema":
        await this.curatorController.showCinemaMenu(chatId);
        break;
      case "daily_tech":
        await this.curatorController.showTechMenu(chatId);
        break;
      case "daily_testo":
        if (this.testoController) {
          await this.testoController.showTestoMenu(chatId);
        } else {
          await this.curatorController.showTestoMenu(chatId);
        }
        break;
      case "main_menu":
        await this.systemController.showMainMenu(chatId, cb.from.id);
        break;
      case "my_role":
        await this.systemController.showMyRole(chatId, cb.from.id, cb.from.username);
        break;
      case "status":
        await this.systemController.showStatus(chatId);
        break;
      case "logs":
        await this.systemController.showLogs(chatId);
        break;
      case "queues":
        await this.systemController.showQueueStats(chatId);
        break;
      default:
        logger.warn({ command }, "Unknown menu command parameter");
        await this.telegramApi.sendMessage(chatId, `⚠️ Неизвестная команда меню: \`${command}\``);
        break;
    }
  }
}
