import { getCollection, Collections, type PipelineRunDoc } from "@pipeline/shared/db";
import { createLogger } from "@pipeline/shared/logger";
import { buildMainMenuKeyboard } from "../keyboards/inline.js";
import type { BotQueues, TestRunnerService } from "../services/test-runner.js";

const logger = createLogger("telegram-bot:commands");

export class CommandHandler {
  constructor(
    private queues: BotQueues,
    private testRunner: TestRunnerService,
    private sendMessage: (chatId: number | string, text: string, replyMarkup?: any) => Promise<void>
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
        `🎬 *Добро пожаловать в KinoPeek Control Hub!* 🍿\n\n` +
        `Управляйте генерацией контента, модерацией карточек и тестами прямо из Telegram.\n\n` +
        `📌 *Основные команды:*\n` +
        `• \`/daily_cinema\` — Авто-поиск трендов и генерация дайджеста\n` +
        `• \`/post_topic <тема>\` — Создать пост по вашей теме\n` +
        `• \`/trends\` — Горячие тренды кино сегодня\n` +
        `• \`/status\` — Статус последних прогонов\n` +
        `• \`/test_pipeline\` — Тестовый запуск генерации карточки\n` +
        `• \`/test_unit\` — Запуск системных unit-тестов`;

      await this.sendMessage(chatId, welcome, buildMainMenuKeyboard());
      return;
    }

    if (text === "/daily_cinema") {
      const runId = await this.testRunner.triggerPipelineTest("cinema-media", "daily-quick-recap");
      await this.sendMessage(
        chatId,
        `🚀 *Запущен новый дайджест KinoPeek!*\nID прогона: \`${runId}\``
      );
      return;
    }

    if (text.startsWith("/post_topic")) {
      const topicTitle = text.replace("/post_topic", "").trim();
      if (!topicTitle) {
        await this.sendMessage(
          chatId,
          `⚠️ *Укажите тему поста!*\nПример:\n\`/post_topic Секретные войны Marvel: кого вернут из старого каста\``
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
      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      const recentRuns = await runsCol
        .find({ tenantId: "cinema-media" })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray();

      const statusText = recentRuns
        .map(
          (r) =>
            `- \`${r.runId.substring(0, 8)}\` [${r.status}] ${r.topic?.title || "Без темы"}`
        )
        .join("\n");

      await this.sendMessage(
        chatId,
        `📋 *Последние прогоны KinoPeek:*\n\n${statusText || "Нет прогонов."}`
      );
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
