import { createLogger } from "@pipeline/shared/logger";
import { buildMainMenuKeyboard } from "../keyboards/inline.js";
import type { BotQueues, TestRunnerService } from "../services/test-runner.js";
import type { LogViewerService } from "../services/log-viewer.js";
import type { CinemaCuratorService } from "../services/cinema-curator.js";
import type { TechCuratorService } from "../services/tech-curator.js";
import type { TestoCuratorService } from "../services/testo-curator.js";

const logger = createLogger("telegram-bot:commands");

export class CommandHandler {
  constructor(
    private queues: BotQueues,
    private testRunner: TestRunnerService,
    private logViewer: LogViewerService,
    private cinemaCurator: CinemaCuratorService,
    private techCurator: TechCuratorService,
    private testoCurator: TestoCuratorService,
    private sendMessage: (chatId: number | string, text: string, replyMarkup?: any) => Promise<any>
  ) {}

  async handleCommand(msg: {
    message_id: number;
    from: { id: number };
    chat: { id: number };
    text?: string;
  }) {
    const text = (msg.text || "").trim();
    const chatId = msg.chat.id;

    if (text === "/start" || text === "/help") {
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
        `• \`/status\` — Статус последних прогонов\n` +
        `• \`/logs\` — Журнал последних прогонов и детальные логи\n` +
        `• \`/logs queues\` — Состояние очередей задач BullMQ\n` +
        `• \`/test_pipeline\` — Тестовый запуск генерации карточки`;

      await this.sendMessage(chatId, welcome, buildMainMenuKeyboard());
      return;
    }

    if (text === "/daily_cinema" || text === "/curate_cinema") {
      await this.sendMessage(
        chatId,
        `🎬 *KinoPeek News Radar — Выберите категорию тем:*\n\n` +
        `Какой тип тем вы хотите получить от краулера перед запуском пайплайна?`,
        this.cinemaCurator.getCuratorMenuKeyboard()
      );
      return;
    }

    if (text === "/daily_tech" || text === "/curate_tech") {
      await this.sendMessage(
        chatId,
        `💻 *Tech Radar — Выберите категорию тем:*\n\n` +
        `Что вы хотите сгенерировать сегодня для Tech Portal?`,
        this.techCurator.getCuratorMenuKeyboard()
      );
      return;
    }

    if (text === "/daily_testo" || text === "/curate_testo") {
      await this.sendMessage(
        chatId,
        `🏭 *Testo Kazakhstan Radar — Выберите отрасль:*\n\n` +
        `Какое направление оборудования Testo вы хотите раскрыть в публикации?`,
        this.testoCurator.getCuratorMenuKeyboard()
      );
      return;
    }

    if (text.startsWith("/post_tech")) {
      const topicTitle = text.replace("/post_tech", "").trim();
      if (!topicTitle) {
        await this.sendMessage(
          chatId,
          `⚠️ *Укажите тему IT-поста!*\nПример:\n\`/post_tech Архитектура очередей: BullMQ vs RabbitMQ в high-load Node.js\``
        );
        return;
      }

      const runId = await this.testRunner.triggerPipelineTest("software-development-default", "architecture-deep-dive", {
        title: topicTitle,
        summary: topicTitle,
      });

      await this.sendMessage(
        chatId,
        `💻 *Запущен прогон Tech Portal!*\nТема: "${topicTitle}"\nRun ID: \`${runId}\``
      );
      return;
    }

    if (text.startsWith("/post_testo")) {
      const topicTitle = text.replace("/post_testo", "").trim();
      if (!topicTitle) {
        await this.sendMessage(
          chatId,
          `⚠️ *Укажите тему Testo!*\nПример:\n\`/post_testo Сферы применения газоанализатора Testo 350: от котельных до металлургии\``
        );
        return;
      }

      const runId = await this.testRunner.triggerPipelineTest("testo", "gas-industrial-emissions", {
        title: topicTitle,
        summary: topicTitle,
      });

      await this.sendMessage(
        chatId,
        `🏭 *Запущен прогон Testo Kazakhstan!*\nТема: "${topicTitle}"\nRun ID: \`${runId}\``
      );
      return;
    }

    if (text.startsWith("/post_cinema") || text.startsWith("/post_topic")) {
      const topicTitle = text.replace("/post_cinema", "").replace("/post_topic", "").trim();
      if (!topicTitle) {
        await this.sendMessage(
          chatId,
          `⚠️ *Укажите тему поста!*\nПример:\n\`/post_cinema Секретные войны Marvel: кого вернут из старого каста\``
        );
        return;
      }

      const runId = await this.testRunner.triggerPipelineTest("cinema-media", "marvel-mcu-lore", {
        title: topicTitle,
        summary: topicTitle,
      });

      await this.sendMessage(
        chatId,
        `🎬 *Запущен прогон по вашей теме!*\nТема: "${topicTitle}"\nRun ID: \`${runId}\``
      );
      return;
    }

    if (text === "/trends") {
      const trendsKeyboard = {
        inline_keyboard: [
          [
            { text: "🕷 Человек-Паук 4: Съемки и каст", callback_data: "trend_pick:spider_man_4" },
          ],
          [
            { text: "⚡ Гарри Поттер: Кастинг трио HBO", callback_data: "trend_pick:harry_potter" },
          ],
          [
            { text: "🏜 Дюна 3: Мессия Вильнева", callback_data: "trend_pick:dune_3" },
          ],
          [
            { text: "🌸 Клинок демонов: Финал ufotable", callback_data: "trend_pick:demon_slayer" },
          ],
          [
            { text: "📊 Бокс-офис: $1 млрд в IMAX", callback_data: "trend_pick:box_office_1b" },
          ],
        ],
      };

      const trendsText =
        `🔥 *Топ горячих трендов кино сегодня:*\n\n` +
        `Нажмите на любой тренд ниже, чтобы сгенерировать по нему готовый пост и карусель, либо напишите свою тему: \`/post_topic <Тема>\``;

      await this.sendMessage(chatId, trendsText, trendsKeyboard);
      return;
    }

    if (text === "/status") {
      const summary = await this.logViewer.getRecentRunsSummary(5);
      await this.sendMessage(chatId, summary);
      return;
    }

    // Команды работы с логами
    if (text.startsWith("/logs")) {
      const subParam = text.replace("/logs", "").trim();

      if (!subParam) {
        const summary = await this.logViewer.getRecentRunsSummary(5);
        await this.sendMessage(chatId, summary);
        return;
      }

      if (subParam === "errors" || subParam === "error") {
        const errorsReport = await this.logViewer.getRecentErrors(5);
        await this.sendMessage(chatId, errorsReport);
        return;
      }

      if (subParam === "queues" || subParam === "queue") {
        const queueStats = await this.logViewer.getQueueStats(this.queues);
        await this.sendMessage(chatId, queueStats);
        return;
      }

      // Если передан конкретный runId
      const runLog = await this.logViewer.getRunLogs(subParam);
      await this.sendMessage(chatId, runLog);
      return;
    }

    if (text === "/test_pipeline") {
      const runId = await this.testRunner.triggerPipelineTest("cinema-media", "marvel-mcu-lore");
      await this.sendMessage(
        chatId,
        `🧪 *Тестовый запуск пайплайна KinoPeek выполнен!*\nRun ID: \`${runId}\`\n\nКарточка скоро поступит на модерацию в этот чат.`
      );
      return;
    }

    if (text === "/test_unit" || text === "/test") {
      await this.sendMessage(chatId, `⏳ *Запуск системной диагностики и Unit-тестов...*`);
      const report = await this.testRunner.runHealthAndUnitTests();
      await this.sendMessage(chatId, report);
      return;
    }

    // Неизвестная команда
    if (text.startsWith("/")) {
      await this.sendMessage(
        chatId,
        `❓ Неизвестная команда. Введите /help для просмотра списка доступных действий.`
      );
    }
  }
}
