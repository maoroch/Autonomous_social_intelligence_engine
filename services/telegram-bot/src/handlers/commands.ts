import { createLogger } from "@pipeline/shared/logger";
import type { BotQueues, TestRunnerService } from "../services/test-runner.js";
import type { LogViewerService } from "../services/log-viewer.js";
import type { CinemaCuratorService } from "../services/cinema-curator.js";
import type { TechCuratorService } from "../services/tech-curator.js";
import type { TestoCuratorService } from "../services/testo-curator.js";
import { TelegramApiService } from "../services/telegram-api.service.js";
import { SystemController } from "../controllers/system.controller.js";
import { CuratorController } from "../controllers/curator.controller.js";
import { TrendsController } from "../controllers/trends.controller.js";
import { CommandRouter } from "../routes/command.router.js";
import type { TelegramMessage } from "../types/telegram.types.js";

import { AccessControlService } from "../services/access-control.service.js";

const logger = createLogger("telegram-bot:commands");

export class CommandHandler {
  private router: CommandRouter;
  private telegramApi: TelegramApiService;
  private systemController: SystemController;
  private curatorController: CuratorController;
  private trendsController: TrendsController;
  private accessControl: AccessControlService;

  constructor(
    private queues: BotQueues,
    private testRunner: TestRunnerService,
    private logViewer: LogViewerService,
    private cinemaCurator: CinemaCuratorService,
    private techCurator: TechCuratorService,
    private testoCurator: TestoCuratorService,
    private sendMessage: (chatId: number | string, text: string, replyMarkup?: any) => Promise<any>,
    accessControl?: AccessControlService
  ) {
    this.accessControl = accessControl || new AccessControlService();
    this.telegramApi = new TelegramApiService("");
    if (sendMessage) {
      this.telegramApi.sendMessage = async (chatId, text, markup) => sendMessage(chatId, text, markup);
    }

    this.systemController = new SystemController(
      this.telegramApi,
      this.logViewer,
      this.testRunner,
      this.queues,
      this.accessControl
    );

    this.curatorController = new CuratorController(
      this.telegramApi,
      this.cinemaCurator,
      this.techCurator,
      this.testoCurator,
      this.queues,
      ""
    );

    this.trendsController = new TrendsController(
      this.telegramApi,
      this.cinemaCurator
    );

    this.router = new CommandRouter(
      this.telegramApi,
      this.systemController,
      this.curatorController,
      this.trendsController,
      this.accessControl
    );
  }

  async handleCommand(msg: {
    message_id: number;
    from: { id: number };
    chat: { id: number };
    text?: string;
  }): Promise<void> {
    await this.router.route(msg as TelegramMessage);
  }
}
