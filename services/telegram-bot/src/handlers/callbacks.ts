import { createLogger } from "@pipeline/shared/logger";
import type { BotQueues, TestRunnerService } from "../services/test-runner.js";
import type { LogViewerService } from "../services/log-viewer.js";
import type { CinemaCuratorService } from "../services/cinema-curator.js";
import type { TechCuratorService } from "../services/tech-curator.js";
import type { TestoCuratorService } from "../services/testo-curator.js";
import type { TextEditorHandler } from "./text-editor.js";
import type { PhotoHandler } from "./photo-handler.js";
import { TelegramApiService } from "../services/telegram-api.service.js";
import { ApprovalController } from "../controllers/approval.controller.js";
import { CuratorController } from "../controllers/curator.controller.js";
import { TrendsController } from "../controllers/trends.controller.js";
import { SystemController } from "../controllers/system.controller.js";
import { CallbackRouter } from "../routes/callback.router.js";
import type { TelegramCallbackQuery } from "../types/telegram.types.js";

import { AccessControlService } from "../services/access-control.service.js";
import { TestoMediaService } from "../services/testo-media.service.js";
import { TestoCasesService } from "../services/testo-cases.service.js";
import { TestoController } from "../controllers/testo.controller.js";

const logger = createLogger("telegram-bot:callbacks");

export class CallbackHandler {
  private router: CallbackRouter;
  private telegramApi: TelegramApiService;
  private approvalController: ApprovalController;
  private curatorController: CuratorController;
  private trendsController: TrendsController;
  private systemController: SystemController;
  private accessControl: AccessControlService;

  constructor(
    private queues: BotQueues,
    private botToken: string,
    private textEditor: TextEditorHandler,
    private photoHandler: PhotoHandler,
    private testRunner: TestRunnerService,
    private logViewer: LogViewerService,
    private cinemaCurator: CinemaCuratorService,
    private techCurator: TechCuratorService,
    private testoCurator: TestoCuratorService,
    private openclawUrl: string,
    private sendMessage: (chatId: number | string, text: string, replyMarkup?: any) => Promise<any>,
    private editMessageCaption?: (chatId: number | string, messageId: number, caption: string, replyMarkup?: any) => Promise<void>,
    private editMessageReplyMarkup?: (chatId: number | string, messageId: number, replyMarkup?: any) => Promise<void>,
    accessControl?: AccessControlService
  ) {
    this.accessControl = accessControl || new AccessControlService();
    this.telegramApi = new TelegramApiService(botToken);

    // Если передан кастомный sendMessage/editMessage (например, в мок-тестах), подменяем методы API клиента
    if (sendMessage) {
      this.telegramApi.sendMessage = async (chatId, text, markup) => sendMessage(chatId, text, markup);
    }
    if (editMessageCaption) {
      this.telegramApi.editMessageCaption = async (chatId, msgId, caption, markup) => editMessageCaption(chatId, msgId, caption, markup);
    }
    if (editMessageReplyMarkup) {
      this.telegramApi.editMessageReplyMarkup = async (chatId, msgId, markup) => editMessageReplyMarkup(chatId, msgId, markup);
    }

    this.approvalController = new ApprovalController(
      this.telegramApi,
      this.queues,
      this.textEditor,
      this.photoHandler,
      this.logViewer,
      this.accessControl
    );

    this.curatorController = new CuratorController(
      this.telegramApi,
      this.cinemaCurator,
      this.techCurator,
      this.testoCurator,
      this.queues,
      this.openclawUrl
    );

    this.trendsController = new TrendsController(
      this.telegramApi,
      this.cinemaCurator,
      this.testoCurator,
      this.accessControl
    );

    this.systemController = new SystemController(
      this.telegramApi,
      this.logViewer,
      this.testRunner,
      this.queues,
      this.accessControl
    );

    const testoMediaService = new TestoMediaService();
    const testoCasesService = new TestoCasesService();
    const testoController = new TestoController(
      this.telegramApi,
      testoMediaService,
      testoCasesService,
      this.testoCurator,
      this.queues,
      this.openclawUrl
    );

    this.router = new CallbackRouter(
      this.telegramApi,
      this.approvalController,
      this.curatorController,
      this.trendsController,
      this.systemController,
      this.accessControl,
      testoController
    );
  }

  async handleCallback(cb: {
    id: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number }; caption?: string; text?: string };
    data?: string;
  }): Promise<void> {
    await this.router.route(cb as TelegramCallbackQuery);
  }
}
