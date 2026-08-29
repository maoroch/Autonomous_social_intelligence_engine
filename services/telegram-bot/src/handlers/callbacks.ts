import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc, getDb } from "@pipeline/shared/db";
import { PipelineStage, PipelineRunStatus } from "@pipeline/shared";
import { createLogger } from "@pipeline/shared/logger";
import { GridFSBucket, ObjectId } from "mongodb";
import AdmZip from "adm-zip";
import type { BotQueues, TestRunnerService } from "../services/test-runner.js";
import type { LogViewerService } from "../services/log-viewer.js";
import type { TextEditorHandler } from "./text-editor.js";
import type { PhotoHandler } from "./photo-handler.js";
import { buildApprovalKeyboard } from "../keyboards/inline.js";

const logger = createLogger("telegram-bot:callbacks");

export class CallbackHandler {
  private activeDebounce = new Set<string>();

  constructor(
    private queues: BotQueues,
    private botToken: string,
    private textEditor: TextEditorHandler,
    private photoHandler: PhotoHandler,
    private testRunner: TestRunnerService,
    private logViewer: LogViewerService,
    private sendMessage: (chatId: number | string, text: string, replyMarkup?: any) => Promise<any>,
    private editMessageCaption?: (chatId: number | string, messageId: number, caption: string, replyMarkup?: any) => Promise<void>,
    private editMessageReplyMarkup?: (chatId: number | string, messageId: number, replyMarkup?: any) => Promise<void>
  ) {}

  /**
   * Ответ на callback query (убирает лоадер на кнопке или показывает всплывающий Toast)
   */
  private async answerCallback(cbId: string, text?: string, showAlert = false) {
    try {
      await fetch(`https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: cbId,
          text,
          show_alert: showAlert,
        }),
      });
    } catch (e) {
      // Игнорируем сетевые ошибки answerCallbackQuery
    }
  }

  async handleCallback(cb: {
    id: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number }; caption?: string; text?: string };
    data?: string;
  }) {
    if (!cb.data) return;

    // 1. Защита от дабл-клика и дублирования обработки (debounce на 4 секунды)
    const debounceKey = `${cb.from.id}:${cb.data}`;
    if (this.activeDebounce.has(debounceKey)) {
      await this.answerCallback(cb.id, "Запрос уже обрабатывается...", false);
      return;
    }
    this.activeDebounce.add(debounceKey);
    setTimeout(() => this.activeDebounce.delete(debounceKey), 4000);

    const [action, param] = cb.data.split(":");
    const chatId = cb.message?.chat.id;
    const messageId = cb.message?.message_id;
    const runId = param || "";

    logger.info({ action, runId, userId: cb.from.id }, "Handling telegram callback query");

    try {
      if (action === "approve_run") {
        await this.answerCallback(cb.id, "🚀 Публикуем в канал...");

        const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
        const currentRun = await runsCol.findOne({ runId });

        if (currentRun?.status === PipelineRunStatus.APPROVED) {
          await this.answerCallback(cb.id, "Пост уже был опубликован ранее!", true);
          return;
        }

        await runsCol.updateOne(
          { runId },
          { $set: { status: PipelineRunStatus.APPROVED, updatedAt: new Date() } }
        );

        const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
        const writingDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.WRITING });
        const designDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.DESIGN });
        const postText = (writingDoc?.result as any)?.text || "Пост опубликован";
        const imageId =
          (designDoc?.result as any)?.imageId || (designDoc?.result as any)?.zip_cover_1_id;

        // Отправляем задачу в очередь публикации
        await this.queues[PipelineStage.PUBLISHING].add("publish-job", {
          runId,
          stage: PipelineStage.PUBLISHING,
          payload: { text: postText, imageId, tenantId: currentRun?.tenantId || "cinema-media" },
        } as any);

        // Обновляем исходную карточку на месте (убираем кнопки, чтобы нельзя было нажать повторно)
        if (chatId && messageId) {
          if (this.editMessageCaption && cb.message?.caption) {
            const updatedCaption = `${cb.message.caption}\n\n✅ *[УТВЕРЖДЕНО]* Отправлено на публикацию в канал! 🚀`;
            await this.editMessageCaption(chatId, messageId, updatedCaption, { inline_keyboard: [] });
          } else if (this.editMessageReplyMarkup) {
            await this.editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] });
          }
        }
      } else if (action === "reject_run") {
        await this.answerCallback(cb.id, "❌ Прогон отклонен");

        const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
        await runsCol.updateOne(
          { runId },
          { $set: { status: PipelineRunStatus.REJECTED, updatedAt: new Date() } }
        );

        // Обновляем исходную карточку на месте (убираем кнопки)
        if (chatId && messageId) {
          if (this.editMessageCaption && cb.message?.caption) {
            const updatedCaption = `${cb.message.caption}\n\n❌ *[ОТКЛОНЕНО]* Прогон отменен администратором.`;
            await this.editMessageCaption(chatId, messageId, updatedCaption, { inline_keyboard: [] });
          } else if (this.editMessageReplyMarkup) {
            await this.editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] });
          }
        }
      } else if (action === "view_carousel") {
        if (!chatId) return;

        // Отвечаем тостом без создания мусорных сообщений
        await this.answerCallback(cb.id, "⏳ Загружаю слайды карусели...");

        try {
          const db = getDb();
          const bucket = new GridFSBucket(db, { bucketName: "carousel_images" });
          const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
          const designDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.DESIGN });
          const zipIdStr = (designDoc?.result as any)?.imageId || (designDoc?.result as any)?.zip_cover_1_id;

          if (!zipIdStr) {
            await this.sendMessage(chatId, `⚠️ Архив слайдов для прогона \`${runId.substring(0, 8)}\` не найден.`);
            return;
          }

          const chunks: Buffer[] = [];
          const downloadStream = bucket.openDownloadStream(new ObjectId(zipIdStr));

          await new Promise<void>((resolve, reject) => {
            downloadStream.on("data", (chunk) => chunks.push(chunk));
            downloadStream.on("end", () => resolve());
            downloadStream.on("error", (err) => reject(err));
          });

          const zipBuffer = Buffer.concat(chunks);
          const zip = new AdmZip(zipBuffer);
          const entries = zip
            .getEntries()
            .filter((e) => e.entryName.endsWith(".png"))
            .sort((a, b) => a.entryName.localeCompare(b.entryName));

          if (entries.length === 0) {
            await this.sendMessage(chatId, `⚠️ В архиве нет изображений слайдов.`);
            return;
          }

          // Формируем multipart FormData с альбомом слайдов
          const formData = new FormData();
          formData.append("chat_id", String(chatId));

          const mediaArray = entries.map((entry, idx) => {
            const attachName = `slide_${idx}.png`;
            const fileData = entry.getData();
            const file = new File([fileData], attachName, { type: "image/png" });
            formData.append(attachName, file);

            return {
              type: "photo",
              media: `attach://${attachName}`,
              caption: idx === 0 ? `🎬 *Карусель:* \`${runId}\` (${entries.length} слайдов)` : undefined,
              parse_mode: idx === 0 ? "Markdown" : undefined,
            };
          });

          formData.append("media", JSON.stringify(mediaArray));

          const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMediaGroup`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Failed to sendMediaGroup: ${res.status} ${errBody}`);
          }
        } catch (err: any) {
          logger.error({ err, runId }, "Failed to send carousel media group");
          await this.sendMessage(chatId, `❌ Не удалось загрузить слайды: ${err.message}`);
        }
      } else if (action === "view_logs") {
        await this.answerCallback(cb.id, "📜 Открываю журнал логов...");
        if (chatId) {
          const logsText = await this.logViewer.getRunLogs(runId);
          await this.sendMessage(chatId, logsText);
        }
      } else if (action === "upload_cover") {
        await this.answerCallback(cb.id);
        this.photoHandler.setPendingPhoto(cb.from.id, { runId, slideIndex: 0 });
        if (chatId) {
          await this.sendMessage(
            chatId,
            `📸 *Отправьте фотографию или скриншот кадра следующим сообщением в чат:*\n\nБот автоматически подставит её в обложку карусели и перерендерит карточку.`
          );
        }
      } else if (action === "edit_text") {
        await this.answerCallback(cb.id);
        this.textEditor.setPendingEdit(cb.from.id, runId);
        if (chatId) {
          await this.sendMessage(
            chatId,
            `✏️ *Отправьте новый текст поста следующим сообщением в чат:*`
          );
        }
      } else if (action === "regenerate_writing") {
        await this.answerCallback(cb.id, "🔄 Запущена регенерация текста...");
        await this.queues[PipelineStage.WRITING].add("writing-job", {
          runId,
          stage: PipelineStage.WRITING,
          payload: { targetPillarId: "marvel-mcu-lore" },
        } as any);
        if (chatId) {
          await this.sendMessage(
            chatId,
            `🔄 *Запущена регенерация текста поста для прогона \`${runId.substring(0, 8)}\`...*`
          );
        }
      } else if (action === "regenerate_design") {
        await this.answerCallback(cb.id, "🎨 Запущена перегенерация слайдов...");
        await this.queues[PipelineStage.DESIGN].add("design-job", {
          runId,
          stage: PipelineStage.DESIGN,
          payload: { template_name: "cinema-media" },
        } as any);
        if (chatId) {
          await this.sendMessage(
            chatId,
            `🎨 *Запущена перегенерация слайдов KinoPeek для \`${runId.substring(0, 8)}\`...*`
          );
        }
      } else if (action === "trend_pick") {
        await this.answerCallback(cb.id, "🎬 Запуск генерации...");
        const trendMap: Record<string, { title: string; summary: string; pillar: string }> = {
          spider_man_4: {
            title: "Человек-Паук 4: дата съемок, возвращение Черной Кошки и новый костюм",
            summary: "Инсайды о съемках новой части Человека-Паука с Томом Холландом и уличной арке в Нью-Йорке",
            pillar: "marvel-mcu-lore",
          },
          harry_potter: {
            title: "Гарри Поттер от HBO: утвержден актерский состав золотого трио",
            summary: "Разбор официального кастинга нового сериала и деталей первого сезона",
            pillar: "cinema-history-curiosities",
          },
          dune_3: {
            title: "Дюна 3 Мессия: как Дени Вильнев покажет падение Пола Атрейдеса",
            summary: "Анализ сценария третьей части Дюны и подготовка масштабных съемок",
            pillar: "directors-screenplay-breakdowns",
          },
          demon_slayer: {
            title: "Клинок, рассекающий демонов: Финальная битва в Бесконечном замке",
            summary: "Разбор анимации ufotable, спецэффекты и дата выхода трилогии в кинотеатрах",
            pillar: "anime-culture-adaptations",
          },
          box_office_1b: {
            title: "Бокс-офис 2026: 5 фильмов, которые пробьют отметку в 1 миллиард долларов",
            summary: "Аналитика кинопроката, предварительные сборы IMAX и кассовые рекорды года",
            pillar: "box-office-analytics",
          },
        };

        const picked = (param && trendMap[param]) ? trendMap[param]! : {
          title: "Человек-Паук 4: возвращение Черной Кошки",
          summary: "Инсайды о съемках",
          pillar: "marvel-mcu-lore",
        };

        const newRunId = await this.testRunner.triggerPipelineTest("cinema-media", picked.pillar, {
          title: picked.title,
          summary: picked.summary,
        });

        if (chatId) {
          await this.sendMessage(
            chatId,
            `🎬 *Запущен генератор контента по тренду!*\n📌 *Тема:* ${picked.title}\n🆔 *Run ID:* \`${newRunId}\``
          );
        }
      } else if (action === "cmd") {
        await this.answerCallback(cb.id);
        const command = param;
        if (command === "daily_cinema" && chatId) {
          const runId = await this.testRunner.triggerPipelineTest("cinema-media", "daily-quick-recap");
          await this.sendMessage(chatId, `🚀 *Запущен новый дайджест KinoPeek!*\nID: \`${runId}\``);
        } else if (command === "trends" && chatId) {
          const trendsText =
            `🔥 *Топ трендов кино сегодня:*\n\n` +
            `1. 🔴 *[MCU]* Анонс даты съемок Мстителей: Секретные войны\n` +
            `2. 📊 *[BoxOffice]* Рекорды кассовых сборов уикенда в IMAX\n` +
            `3. ⚡ *[Casting]* Утвержден актерский состав сериала по Гарри Поттеру\n` +
            `4. 🌸 *[Anime]* Финальная трилогия «Клинок, рассекающий демонов»\n\n` +
            `💡 Чтобы создать пост по тренду: \`/post_topic <Тема>\``;
          await this.sendMessage(chatId, trendsText);
        } else if (command === "test_pipeline" && chatId) {
          const testRunId = await this.testRunner.triggerPipelineTest();
          await this.sendMessage(
            chatId,
            `🧪 *Тестовый прогон KinoPeek запущен!*\nRun ID: \`${testRunId}\``
          );
        } else if (command === "status" && chatId) {
          const summary = await this.logViewer.getRecentRunsSummary(5);
          await this.sendMessage(chatId, summary);
        } else if (command === "logs" && chatId) {
          const recentLogs = await this.logViewer.getRecentRunsSummary(5);
          await this.sendMessage(chatId, recentLogs);
        } else if (command === "queues" && chatId) {
          const queueStats = await this.logViewer.getQueueStats(this.queues);
          await this.sendMessage(chatId, queueStats);
        }
      }
    } catch (err) {
      logger.error({ err, cbData: cb.data }, "Failed to handle callback query");
      await this.answerCallback(cb.id, "Ошибка при обработке действия", true);
    }
  }
}
