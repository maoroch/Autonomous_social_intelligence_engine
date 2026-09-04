import { buildMainMenuKeyboard } from "../keyboards/inline.js";
import type { TelegramApiService } from "../services/telegram-api.service.js";
import type { LogViewerService } from "../services/log-viewer.js";
import type { TestRunnerService } from "../services/test-runner.js";
import type { BotQueues } from "../types/bot.types.js";

export class SystemController {
  constructor(
    private telegramApi: TelegramApiService,
    private logViewer: LogViewerService,
    private testRunner: TestRunnerService,
    private queues: BotQueues
  ) {}

  async showWelcome(chatId: number | string): Promise<void> {
    const welcome =
      `🤖 *Добро пожаловать в Multi-Portal AI Content Hub!* 🚀\n\n` +
      `Управляйте генерацией контента, интерактивным отбором тем и модерацией для всех 3 порталов прямо из Telegram.\n\n` +
      `📌 *Команды кураторов тем:*\n` +
      `• \`/daily_cinema\` — Радар тем кино и Marvel (Популярные vs Свежие)\n` +
      `• \`/daily_tech\` — Радар IT & Tech (Архитектура, Open-Source репозитории)\n` +
      `• \`/daily_testo\` — Радар Testo (Газоанализаторы ТЭЦ, Фармацевтика GxP)\n\n` +
      `✍️ *Создание постов по своей теме:*\n` +
      `• \`/post_cinema <тема>\` — Создать пост по теме кино\n` +
      `• \`/post_tech <тема>\` — Создать пост по IT-теме\n` +
      `• \`/post_testo <тема>\` — Создать пост по оборудованию Testo\n\n` +
      `⚙️ *Системные команды:*\n` +
      `• \`/trends\` — Горячие тренды кино\n` +
      `• \`/status\` — Статус последних прогонов\n` +
      `• \`/logs\` — Журнал последних прогонов и детальные логи\n` +
      `• \`/logs queues\` — Состояние очередей задач BullMQ\n` +
      `• \`/test_pipeline\` — Тестовый запуск генерации карточки`;

    await this.telegramApi.sendMessage(chatId, welcome, buildMainMenuKeyboard());
  }

  async showMainMenu(chatId: number | string): Promise<void> {
    await this.telegramApi.sendMessage(
      chatId,
      `🤖 *Главное меню Multi-Portal AI Hub:*`,
      buildMainMenuKeyboard()
    );
  }

  async showStatus(chatId: number | string): Promise<void> {
    const summary = await this.logViewer.getRecentRunsSummary(5);
    await this.telegramApi.sendMessage(chatId, summary);
  }

  async showLogs(chatId: number | string, subParam?: string): Promise<void> {
    const cleanParam = (subParam || "").trim();

    if (!cleanParam) {
      const summary = await this.logViewer.getRecentRunsSummary(5);
      await this.telegramApi.sendMessage(chatId, summary);
      return;
    }

    if (cleanParam === "errors" || cleanParam === "error") {
      const errorsReport = await this.logViewer.getRecentErrors(5);
      await this.telegramApi.sendMessage(chatId, errorsReport);
      return;
    }

    if (cleanParam === "queues" || cleanParam === "queue") {
      const queueStats = await this.logViewer.getQueueStats(this.queues);
      await this.telegramApi.sendMessage(chatId, queueStats);
      return;
    }

    const runLog = await this.logViewer.getRunLogs(cleanParam);
    await this.telegramApi.sendMessage(chatId, runLog);
  }

  async showQueueStats(chatId: number | string): Promise<void> {
    const queueStats = await this.logViewer.getQueueStats(this.queues);
    await this.telegramApi.sendMessage(chatId, queueStats);
  }

  async runTestPipeline(chatId: number | string): Promise<void> {
    const runId = await this.testRunner.triggerPipelineTest("cinema-media", "marvel-mcu-lore");
    await this.telegramApi.sendMessage(
      chatId,
      `🧪 *Тестовый запуск пайплайна KinoPeek выполнен!*\nRun ID: \`${runId}\`\n\nКарточка скоро поступит на модерацию в этот чат.`
    );
  }

  async runUnitTests(chatId: number | string): Promise<void> {
    await this.telegramApi.sendMessage(chatId, `⏳ *Запуск системной диагностики и Unit-тестов...*`);
    const report = await this.testRunner.runHealthAndUnitTests();
    await this.telegramApi.sendMessage(chatId, report);
  }

  async handleCustomPost(
    chatId: number | string,
    portal: "cinema" | "tech" | "testo",
    topicTitle: string
  ): Promise<void> {
    if (!topicTitle) {
      const examples: Record<string, string> = {
        cinema: "`/post_cinema Секретные войны Marvel: кого вернут из старого каста`",
        tech: "`/post_tech Архитектура очередей: BullMQ vs RabbitMQ в high-load Node.js`",
        testo: "`/post_testo Сферы применения газоанализатора Testo 350: от котельных до металлургии`",
      };
      await this.telegramApi.sendMessage(
        chatId,
        `⚠️ *Укажите тему поста!*\nПример:\n${examples[portal]}`
      );
      return;
    }

    const portalConfig: Record<string, { tenantId: string; pillarId: string; icon: string; name: string }> = {
      cinema: { tenantId: "cinema-media", pillarId: "marvel-mcu-lore", icon: "🎬", name: "KinoPeek Media" },
      tech: { tenantId: "software-development-default", pillarId: "architecture-deep-dive", icon: "💻", name: "Tech Portal" },
      testo: { tenantId: "testo", pillarId: "gas-industrial-emissions", icon: "🏭", name: "Testo Kazakhstan" },
    };

    const config = portalConfig[portal]!;
    const runId = await this.testRunner.triggerPipelineTest(config.tenantId, config.pillarId, {
      title: topicTitle,
      summary: topicTitle,
    });

    await this.telegramApi.sendMessage(
      chatId,
      `${config.icon} *Запущен прогон ${config.name}!*\nТема: "${topicTitle}"\nRun ID: \`${runId}\``
    );
  }
}
