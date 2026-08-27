import { createLogger } from "@pipeline/shared/logger";
import { getCollection, Collections, type PipelineRunDoc } from "@pipeline/shared/db";
import { PipelineRunStatus, PipelineStage } from "@pipeline/shared";
import type { AgentQueues } from "../pipeline/runner.js";
import { startPipelineRun } from "../pipeline/runner.js";

const logger = createLogger("telegram-bot-service");

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name?: string; username?: string };
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
}

/**
 * Сервис Telegram-бота для интерактивного управления прогонами cinema-media (Human-in-the-Loop).
 * Поддерживает отправку превью карусели с Inline-кнопками и обработку команд /daily_cinema, /trends, /post_topic, /status.
 */
export class TelegramBotService {
  private botToken: string;
  private adminChatId: string;
  private queues: AgentQueues;
  private isPolling = false;
  private offset = 0;
  private userPendingState = new Map<number, { action: string; runId: string }>();

  constructor(queues: AgentQueues) {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
    this.adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID ?? process.env.TELEGRAM_CHANNEL_ID ?? "";
    this.queues = queues;
  }

  public startPolling() {
    if (!this.botToken) {
      logger.warn("TELEGRAM_BOT_TOKEN is not set. Telegram Bot Polling will not start.");
      return;
    }
    if (this.isPolling) return;
    this.isPolling = true;
    logger.info("Starting Telegram Bot Polling...");
    this.pollUpdates();
  }

  private async pollUpdates() {
    while (this.isPolling) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.offset}&timeout=20`);
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
          if (data.ok && Array.isArray(data.result)) {
            for (const update of data.result) {
              this.offset = update.update_id + 1;
              await this.handleUpdate(update);
            }
          }
        }
      } catch (err) {
        logger.error({ err }, "Error polling Telegram updates");
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  public async notifyAwaitingApproval(runId: string, run: PipelineRunDoc, stageResults: Record<string, any>, openclawPublicBaseUrl: string) {
    if (!this.botToken || !this.adminChatId) {
      logger.warn({ runId }, "Telegram Bot credentials missing — skipping Telegram approval notification");
      return;
    }

    const designResult = stageResults.design;
    const writingResult = stageResults.writing;
    const postText = writingResult?.text || run.topic?.summary || "Текст поста";
    const hook = writingResult?.hook || run.topic?.title || "Готов новый пост!";

    try {
      // 1. Send Media Album (carousel slides if zip/preview available)
      const zipId = designResult?.imageId || designResult?.zip_cover_1_id;
      if (zipId && openclawPublicBaseUrl) {
        const previewUrl = `${openclawPublicBaseUrl.replace(/\/$/, "")}/images/${designResult.preview_cover_1_id || zipId}`;
        const formData = new FormData();
        formData.append("chat_id", this.adminChatId);
        formData.append(
          "media",
          JSON.stringify([
            {
              type: "photo",
              media: previewUrl,
              caption: `🎨 *Превью обложки карусели (${run.tenantId})*\nРубрика: \`${run.contentPillarId || "default"}\``,
              parse_mode: "Markdown",
            },
          ]),
        );
        await fetch(`https://api.telegram.org/bot${this.botToken}/sendMediaGroup`, { method: "POST", body: formData });
      }

      // 2. Send Formatted Post Copy + Interactive Inline Keyboard
      const messageText = `🍿 *[КИНО-МЕДИА] Пост готов к согласованию!*\n\n` +
        `📌 *Тема:* ${run.topic?.title}\n` +
        `🏷 *Рубрика:* \`${run.contentPillarId || "general"}\`\n\n` +
        `📝 *Текст поста:*\n${postText.substring(0, 1500)}`;

      const inlineKeyboard = {
        inline_keyboard: [
          [
            { text: "✅ Опубликовать сейчас", callback_data: `approve_run:${runId}` },
          ],
          [
            { text: "🔄 Переписать текст", callback_data: `regenerate_writing:${runId}` },
            { text: "🎨 Сменить стиль", callback_data: `regenerate_design:${runId}` },
          ],
          [
            { text: "✏️ Редактировать текст", callback_data: `edit_text:${runId}` },
            { text: "❌ Отклонить", callback_data: `reject_run:${runId}` },
          ],
        ],
      };

      await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.adminChatId,
          text: messageText,
          parse_mode: "Markdown",
          reply_markup: inlineKeyboard,
        }),
      });

      logger.info({ runId }, "Sent Telegram approval notification with inline keyboard");
    } catch (err) {
      logger.error({ err, runId }, "Failed to send Telegram notification");
    }
  }

  private async handleUpdate(update: TelegramUpdate) {
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    if (update.message && update.message.text) {
      await this.handleMessage(update.message);
    }
  }

  private async handleMessage(msg: { message_id: number; from: { id: number }; chat: { id: number }; text?: string }) {
    const text = (msg.text || "").trim();
    const userId = msg.from.id;

    // Check if user is in a pending text-edit state
    if (this.userPendingState.has(userId)) {
      if (text.startsWith("/")) {
        this.userPendingState.delete(userId);
      } else {
        const state = this.userPendingState.get(userId)!;
        this.userPendingState.delete(userId);
        if (state.action === "edit_text") {
          await this.applyDirectTextEdit(state.runId, text, msg.chat.id);
          return;
        }
      }
    }

    if (text === "/daily_cinema") {
      const runId = await startPipelineRun(this.queues, logger, { title: "Ежедневный дайджест кино и Marvel", summary: "Автоматический авто-поиск трендов кино" }, undefined, "cinema-media", "daily-quick-recap");
      await this.sendMessage(msg.chat.id, `🚀 *Запущен новый внеочередной прогон кино-медиа!*\nID: \`${runId}\``);
    } else if (text === "/status") {
      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      const recentRuns = await runsCol.find({ tenantId: "cinema-media" }).sort({ createdAt: -1 }).limit(5).toArray();
      const statusText = recentRuns.map((r) => `- \`${r.runId.substring(0, 8)}\` [${r.status}] ${r.topic?.title || "Без темы"}`).join("\n");
      await this.sendMessage(msg.chat.id, `📋 *Последние прогоны Кино-медиа:*\n\n${statusText || "Нет прогонов."}`);
    } else if (text.startsWith("/post_topic")) {
      const topicTitle = text.replace("/post_topic", "").trim();
      if (!topicTitle) {
        await this.sendMessage(msg.chat.id, "⚠️ Укажите тему поста! Пример:\n`/post_topic Секретные войны Marvel: кого вернут из старого каста`");
        return;
      }
      const runId = await startPipelineRun(this.queues, logger, { title: topicTitle, summary: topicTitle }, undefined, "cinema-media", "marvel-mcu-lore");
      await this.sendMessage(msg.chat.id, `🎬 *Запущен прогон по вашей теме!*\nТема: "${topicTitle}"\nRun ID: \`${runId}\``);
    } else if (text === "/trends") {
      await this.sendMessage(msg.chat.id, `🔥 *Топ-5 трендов кино сегодня:*\n1. [MCU] Анонс даты съемок Мстителей: Секретные войны\n2. [BoxOffice] Рекорды кассовых сборов уикенда\n3. [Variety] Новый кастинг в сериал по Гарри Поттеру\n\nДля запуска используйте: \`/post_topic <Тема>\``);
    } else if (text.startsWith("/")) {
      await this.sendMessage(msg.chat.id, `🤖 *Команды Cinema Hub Bot:*\n/daily_cinema — Запуск авто-поиска трендов\n/trends — Топ трендов кино\n/post_topic <тема> — Создать пост по теме\n/status — Статус последних прогонов`);
    }
  }

  private async handleCallbackQuery(cb: { id: string; from: { id: number }; message?: { message_id: number; chat: { id: number } }; data?: string }) {
    if (!cb.data) return;
    const [action, runId] = cb.data.split(":");
    const chatId = cb.message?.chat.id;

    if (!runId) return;

    if (action === "approve_run") {
      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      await runsCol.updateOne({ runId }, { $set: { status: PipelineRunStatus.APPROVED, updatedAt: new Date() } });

      const stageResultsCol = getCollection(Collections.STAGE_RESULTS);
      const writingDoc = await stageResultsCol.findOne({ runId, stage: "writing" });
      const designDoc = await stageResultsCol.findOne({ runId, stage: "design" });
      const postText = (writingDoc?.result as any)?.text || "Пост опубликован";
      const imageId = (designDoc?.result as any)?.imageId || (designDoc?.result as any)?.zip_cover_1_id;

      await this.queues[PipelineStage.WRITING].add("publish-job", {
        runId,
        stage: PipelineStage.PUBLISHING,
        payload: { text: postText, imageId },
      } as any);

      if (chatId) {
        await this.sendMessage(chatId, `🚀 *Пост ${runId.substring(0, 8)} успешно переведен в публикацию!*`);
      }
    } else if (action === "reject_run") {
      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      await runsCol.updateOne({ runId }, { $set: { status: PipelineRunStatus.REJECTED, updatedAt: new Date() } });
      if (chatId) {
        await this.sendMessage(chatId, `❌ *Прогон ${runId.substring(0, 8)} отклонен.*`);
      }
    } else if (action === "edit_text") {
      this.userPendingState.set(cb.from.id, { action: "edit_text", runId });
      if (chatId) {
        await this.sendMessage(chatId, `✏️ *Отправьте новый текст поста следующим сообщением в ответ на этот бот:*`);
      }
    } else if (action === "regenerate_writing") {
      await this.queues[PipelineStage.WRITING].add("writing-job", {
        runId,
        stage: PipelineStage.WRITING,
        payload: { targetPillarId: "marvel-mcu-lore" },
      } as any);
      if (chatId) {
        await this.sendMessage(chatId, `🔄 *Запущена регенерация текста поста для прогона ${runId.substring(0, 8)}...*`);
      }
    } else if (action === "regenerate_design") {
      await this.queues[PipelineStage.DESIGN].add("design-job", {
        runId,
        stage: PipelineStage.DESIGN,
        payload: { template_name: "cinema-dark-neon" },
      } as any);
      if (chatId) {
        await this.sendMessage(chatId, `🎨 *Запущена перегенерация визуального стиля для прогона ${runId.substring(0, 8)}...*`);
      }
    }

    // Answer callback query to clear Telegram loading spinner
    await fetch(`https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cb.id, text: "Обработано" }),
    });
  }

  private async applyDirectTextEdit(runId: string, newText: string, chatId: number) {
    const stageResultsCol = getCollection(Collections.STAGE_RESULTS);
    const existingWriting = await stageResultsCol.findOne({ runId, stage: "writing" });
    const currentResult = (existingWriting?.result as Record<string, any>) || {};

    await stageResultsCol.updateOne(
      { runId, stage: "writing" },
      { $set: { result: { ...currentResult, text: newText }, updatedAt: new Date() } },
      { upsert: true },
    );

    await this.sendMessage(chatId, `✅ *Текст поста успешно обновлен в БД!*\nНовый текст:\n${newText.substring(0, 300)}...`);
  }

  private async sendMessage(chatId: number | string, text: string) {
    await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  }
}
