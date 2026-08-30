import express from "express";
import { GridFSBucket, ObjectId } from "mongodb";
import { connectMongo, getCollection, Collections, type PipelineRunDoc, type StageResultDoc, getDb } from "@pipeline/shared/db";
import { createLogger } from "@pipeline/shared/logger";
import {
  createQueue,
  createWorker,
  PipelineStage,
  PipelineRunStatus,
  QueueName,
  type PipelineEvent,
  PipelineEventSchema,
} from "@pipeline/shared";
import { CommandHandler } from "./handlers/commands.js";
import { CallbackHandler } from "./handlers/callbacks.js";
import { TextEditorHandler } from "./handlers/text-editor.js";
import { PhotoHandler } from "./handlers/photo-handler.js";
import { buildApprovalKeyboard } from "./keyboards/inline.js";
import { TestRunnerService, type BotQueues } from "./services/test-runner.js";
import { LogViewerService } from "./services/log-viewer.js";
import { CinemaCuratorService } from "./services/cinema-curator.js";
import { TechCuratorService } from "./services/tech-curator.js";
import { TestoCuratorService } from "./services/testo-curator.js";

const logger = createLogger("telegram-bot");

const PORT = Number(process.env.PORT || 4009);
const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "linkedin_pipeline";
const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const OPENCLAW_URL = process.env.OPENCLAW_PUBLIC_BASE_URL || "http://openclaw:4000";

export class TelegramBotApp {
  private isPolling = false;
  private lastUpdateId = 0;
  private commandHandler!: CommandHandler;
  private callbackHandler!: CallbackHandler;
  private textEditor!: TextEditorHandler;
  private photoHandler!: PhotoHandler;
  private testRunner!: TestRunnerService;
  private logViewer!: LogViewerService;
  private cinemaCurator!: CinemaCuratorService;
  private techCurator!: TechCuratorService;
  private testoCurator!: TestoCuratorService;
  private queues!: BotQueues;
  private activeApprovalNotifs = new Set<string>();

  async start() {
    if (!BOT_TOKEN) {
      logger.warn("TELEGRAM_BOT_TOKEN is not configured. Telegram Bot Service is disabled.");
      return;
    }

    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    logger.info("Connected to MongoDB for Telegram Bot");

    // Инициализация очередей BullMQ для взаимодействия с пайплайном
    this.queues = {
      [PipelineStage.TREND]: createQueue(QueueName.TREND, REDIS_URL),
      [PipelineStage.POSITIONING]: createQueue(QueueName.POSITIONING, REDIS_URL),
      [PipelineStage.STRATEGY]: createQueue(QueueName.STRATEGY, REDIS_URL),
      [PipelineStage.WRITING]: createQueue(QueueName.WRITING, REDIS_URL),
      [PipelineStage.DESIGN]: createQueue(QueueName.DESIGN, REDIS_URL),
      [PipelineStage.SEO]: createQueue(QueueName.SEO, REDIS_URL),
      [PipelineStage.PUBLISHING]: createQueue(QueueName.PUBLISHING, REDIS_URL),
    };

    this.logViewer = new LogViewerService();
    this.cinemaCurator = new CinemaCuratorService();
    this.techCurator = new TechCuratorService();
    this.testoCurator = new TestoCuratorService();
    this.textEditor = new TextEditorHandler();
    this.photoHandler = new PhotoHandler(this.queues, BOT_TOKEN, this.sendMessage.bind(this));
    this.testRunner = new TestRunnerService(this.queues, OPENCLAW_URL);

    this.commandHandler = new CommandHandler(
      this.queues,
      this.testRunner,
      this.logViewer,
      this.cinemaCurator,
      this.techCurator,
      this.testoCurator,
      this.sendMessage.bind(this)
    );

    this.callbackHandler = new CallbackHandler(
      this.queues,
      BOT_TOKEN,
      this.textEditor,
      this.photoHandler,
      this.testRunner,
      this.logViewer,
      this.cinemaCurator,
      this.techCurator,
      this.testoCurator,
      OPENCLAW_URL,
      this.sendMessage.bind(this),
      this.editMessageCaption.bind(this),
      this.editMessageReplyMarkup.bind(this)
    );

    // Подписка на очередь уведомлений для согласования контента
    createWorker<PipelineEvent>(
      "queue-telegram-approval-notifier",
      async (job) => {
        const parsed = PipelineEventSchema.safeParse(job.data);
        if (!parsed.success) return;
        const event = parsed.data;
        await this.handleApprovalNotification(event.runId);
      },
      REDIS_URL,
      1 // Обрабатываем последовательно, предотвращая параллельные гонки
    );

    // Запуск цикла Long-polling
    this.startPolling();
    logger.info("Starting Telegram Bot Long-Polling loop...");
  }

  /**
   * Отправка карточки на модерацию в Telegram с защитой от дублирования
   */
  async handleApprovalNotification(runId: string) {
    if (!ADMIN_CHAT_ID || !BOT_TOKEN) return;

    // 1. In-memory debounce защита (если несколько событий пришли параллельно)
    if (this.activeApprovalNotifs.has(runId)) {
      logger.info({ runId }, "Approval notification already being processed — skipping duplicate");
      return;
    }
    this.activeApprovalNotifs.add(runId);
    setTimeout(() => this.activeApprovalNotifs.delete(runId), 20000);

    try {
      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      const runDoc = await runsCol.findOne({ runId });
      if (!runDoc) return;

      // 2. Проверяем статус: карточка высылается ТОЛЬКО если статус awaiting_approval и ранее не отправлялась
      if (runDoc.status !== PipelineRunStatus.AWAITING_APPROVAL && (runDoc as any).telegramCardSent) {
        logger.info({ runId, status: runDoc.status }, "Card already sent or run not awaiting approval — skipping duplicate");
        return;
      }

      const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
      const writingDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.WRITING });
      const designDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.DESIGN });

      const postText = (writingDoc?.result as any)?.text || "Нет текста";
      const topicTitle = runDoc.topic?.title || "Без темы";

      const designResult = (designDoc?.result as any) || {};
      const coverImageId =
        designResult.coverImageId ||
        designResult.preview_cover_1_id ||
        (Array.isArray(designResult.imageIds) && designResult.imageIds[0]) ||
        designResult.imageId;

      const portalConfig =
        runDoc.tenantId === "testo"
          ? { label: "Testo Kazakhstan", emoji: "🏭" }
          : runDoc.tenantId === "software-development-default"
            ? { label: "Tech Hub (IT)", emoji: "💻" }
            : { label: "KinoPeek Media", emoji: "🎬" };

      // Формируем чистый превью-текст без обрезания фраз на полуслове
      let previewText = postText;
      if (postText.length > 700) {
        const cut = postText.substring(0, 700);
        const lastSentenceEnd = Math.max(cut.lastIndexOf(".\n"), cut.lastIndexOf(". "), cut.lastIndexOf("\n\n"));
        if (lastSentenceEnd > 350) {
          previewText = `${cut.substring(0, lastSentenceEnd + 1)}\n\n_...(полный текст поста доступен по кнопке ниже)_`;
        } else {
          previewText = `${cut}...\n\n_...(полный текст поста доступен по кнопке ниже)_`;
        }
      }

      const messageText =
        `${portalConfig.emoji} *[${portalConfig.label}] Новый пост ожидает проверки!*\n\n` +
        `📌 *Тема:* ${topicTitle}\n` +
        `🆔 *Run ID:* \`${runId}\`\n` +
        `📂 *Рубрика:* ${(runDoc as any).contentPillarId || (runDoc as any).targetPillarId || "default"}\n\n` +
        `📝 *Текст поста:*\n${previewText}\n\n` +
        `👇 *Выберите действие:*`;

      const inlineKeyboard = buildApprovalKeyboard(runId);
      let sentMessageId: number | undefined;

      if (coverImageId) {
        try {
          const db = getDb();
          const bucket = new GridFSBucket(db, { bucketName: "carousel_images" });
          const downloadStream = bucket.openDownloadStream(new ObjectId(coverImageId));
          const chunks: Buffer[] = [];
          await new Promise<void>((resolve, reject) => {
            downloadStream.on("data", (c: Buffer) => chunks.push(c));
            downloadStream.on("end", () => resolve());
            downloadStream.on("error", reject);
          });
          const imageBuffer = Buffer.concat(chunks);

          const formData = new FormData();
          formData.append("chat_id", ADMIN_CHAT_ID);
          formData.append("photo", new Blob([imageBuffer]), "cover.png");
          formData.append("caption", messageText);
          formData.append("parse_mode", "Markdown");
          formData.append("reply_markup", JSON.stringify(inlineKeyboard));

          const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
            method: "POST",
            body: formData as any,
          });

          if (res.ok) {
            const data = (await res.json()) as any;
            sentMessageId = data.result?.message_id;
          } else {
            const errText = await res.text();
            logger.warn({ errText }, "sendPhoto with GridFS buffer failed, falling back to sendMessage");
            sentMessageId = await this.sendMessage(ADMIN_CHAT_ID, messageText, inlineKeyboard);
          }
        } catch (streamErr: any) {
          logger.error({ streamErr }, "Failed to stream cover image from GridFS");
          sentMessageId = await this.sendMessage(ADMIN_CHAT_ID, messageText, inlineKeyboard);
        }
      } else {
        sentMessageId = await this.sendMessage(ADMIN_CHAT_ID, messageText, inlineKeyboard);
      }

      // Отмечаем в БД, что карточка успешно отправлена (атомарная защита от повторов)
      await runsCol.updateOne(
        { runId },
        {
          $set: {
            telegramCardSent: true,
            telegramCardSentAt: new Date(),
            telegramMessageId: sentMessageId,
          },
        }
      );

      logger.info({ runId, sentMessageId }, "Sent Telegram approval notification successfully");
    } catch (err) {
      logger.error({ err, runId }, "Failed to send Telegram approval notification");
    }
  }

  /**
   * Отправка сообщений в Telegram (возвращает message_id)
   */
  async sendMessage(chatId: number | string, text: string, replyMarkup?: any): Promise<number | undefined> {
    if (!BOT_TOKEN) return undefined;
    try {
      let res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        }),
      });

      if (!res.ok) {
        // Fallback: пробуем отправить без parse_mode, если в тексте были неэкранированные символы Markdown
        res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            reply_markup: replyMarkup,
          }),
        });
      }

      if (res.ok) {
        const data = (await res.json()) as any;
        return data.result?.message_id;
      }
    } catch (err) {
      logger.error({ err, chatId }, "Failed to send message via Telegram API");
    }
    return undefined;
  }

  /**
   * Редактирование inline-клавиатуры сообщения
   */
  async editMessageReplyMarkup(chatId: number | string, messageId: number, replyMarkup: any) {
    if (!BOT_TOKEN) return;
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: replyMarkup,
        }),
      });
    } catch (err) {
      logger.error({ err, chatId, messageId }, "Failed to editMessageReplyMarkup");
    }
  }

  /**
   * Редактирование подписи к фотографии
   */
  async editMessageCaption(chatId: number | string, messageId: number, caption: string, replyMarkup?: any) {
    if (!BOT_TOKEN) return;
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          caption,
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        }),
      });
    } catch (err) {
      logger.error({ err, chatId, messageId }, "Failed to editMessageCaption");
    }
  }

  /**
   * Long-polling цикл с надежным тайм-аутом и переподключением
   */
  private async startPolling() {
    this.isPolling = true;
    while (this.isPolling) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);
      try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=20`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.ok && Array.isArray(data.result)) {
            for (const update of data.result) {
              this.lastUpdateId = update.update_id;
              await this.handleUpdate(update);
            }
          }
        } else {
          logger.warn({ status: res.status }, "Telegram getUpdates non-200 response");
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name !== "AbortError") {
          logger.warn({ errMessage: err.message }, "Telegram polling retry");
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private async handleUpdate(update: any) {
    if (update.callback_query) {
      await this.callbackHandler.handleCallback(update.callback_query);
      return;
    }

    if (update.message?.photo) {
      const handled = await this.photoHandler.handlePhotoMessage(update.message);
      if (handled) return;
    }

    if (update.message && update.message.text) {
      const msg = update.message;
      const text = msg.text.trim();
      const userId = msg.from.id;

      // Проверка стейта редактирования текста
      const pending = this.textEditor.getPendingEdit(userId);
      if (pending && !text.startsWith("/")) {
        this.textEditor.clearPendingEdit(userId);
        const success = await this.textEditor.applyDirectTextEdit(pending.runId, text);
        if (success) {
          await this.sendMessage(
            msg.chat.id,
            `✅ *Текст поста успешно обновлен!*\n\n${text.substring(0, 300)}...`
          );
        } else {
          await this.sendMessage(msg.chat.id, `❌ Ошибка при сохранении текста в базу данных.`);
        }
        return;
      }

      await this.commandHandler.handleCommand(msg);
    }
  }
}

// Запуск приложения
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "telegram-bot", timestamp: new Date().toISOString() });
});

const botApp = new TelegramBotApp();
botApp.start().then(() => {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, "Telegram Bot Service HTTP server listening");
  });
});
