import AdmZip from "adm-zip";
import { GridFSBucket, ObjectId } from "mongodb";
import { getDb, getCollection, Collections, type PipelineRunDoc, type StageResultDoc } from "@pipeline/shared/db";
import { PipelineStage, PipelineRunStatus, type AgentJob } from "@pipeline/shared";
import { createLogger } from "@pipeline/shared/logger";
import type { TelegramApiService } from "../services/telegram-api.service.js";
import type { TextEditorHandler } from "../handlers/text-editor.js";
import type { PhotoHandler } from "../handlers/photo-handler.js";
import type { LogViewerService } from "../services/log-viewer.js";
import type { AccessControlService } from "../services/access-control.service.js";
import type { BotQueues } from "../types/bot.types.js";
import type { TelegramCallbackQuery } from "../types/telegram.types.js";

const logger = createLogger("telegram-bot:approval-controller");

export class ApprovalController {
  constructor(
    private telegramApi: TelegramApiService,
    private queues: BotQueues,
    private textEditor: TextEditorHandler,
    private photoHandler: PhotoHandler,
    private logViewer: LogViewerService,
    private accessControl?: AccessControlService
  ) {}

  private async checkTenantAccess(userId: number, runId: string, callbackId?: string): Promise<boolean> {
    if (!this.accessControl) return true;
    const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
    const run = await runsCol.findOne({ runId });
    if (run?.tenantId) {
      const allowed = await this.accessControl.canAccessTenant(userId, run.tenantId);
      if (!allowed) {
        if (callbackId) {
          await this.telegramApi.answerCallbackQuery(
            callbackId,
            `⛔ Доступ ограничен: ваш профиль не имеет прав на модерацию портала "${run.tenantId}".`,
            true
          );
        }
        return false;
      }
    }
    return true;
  }

  async handleApproveRun(cb: TelegramCallbackQuery, runId: string): Promise<void> {
    if (!await this.checkTenantAccess(cb.from.id, runId, cb.id)) return;
    await this.telegramApi.answerCallbackQuery(cb.id, "🚀 Пост утвержден! Отправляю на публикацию...");

    const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
    const currentRun = await runsCol.findOne({ runId });

    await runsCol.updateOne(
      { runId },
      { $set: { status: PipelineRunStatus.APPROVED, currentStage: PipelineStage.PUBLISHING, updatedAt: new Date() } }
    );

    const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
    const writingDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.WRITING });
    const designDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.DESIGN });

    const publishingQueue = this.queues[PipelineStage.PUBLISHING];
    if (publishingQueue) {
      await publishingQueue.add("publish-job", {
        runId: runId || "",
        stage: PipelineStage.PUBLISHING,
        attempt: 1,
        payload: {
          text: (writingDoc?.result as any)?.text,
          images: (designDoc?.result as any)?.imageIds || (designDoc?.result as any)?.carouselImages,
          tenantId: currentRun?.tenantId,
        },
      } as AgentJob);
    }

    const chatId = cb.message?.chat.id;
    const messageId = cb.message?.message_id;
    if (chatId && messageId) {
      await this.telegramApi.editMessageCaption(
        chatId,
        messageId,
        (cb.message?.caption || "") + "\n\n✅ *ОТПРАВЛЕНО В КАНАЛ*",
        { inline_keyboard: [] }
      );
    }
  }

  async handleRejectRun(cb: TelegramCallbackQuery, runId: string): Promise<void> {
    if (!await this.checkTenantAccess(cb.from.id, runId, cb.id)) return;
    await this.telegramApi.answerCallbackQuery(cb.id, "❌ Прогон отклонен");

    const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
    await runsCol.updateOne(
      { runId },
      { $set: { status: PipelineRunStatus.FAILED, updatedAt: new Date(), error: "Rejected by user via Telegram" } }
    );

    const chatId = cb.message?.chat.id;
    const messageId = cb.message?.message_id;
    if (chatId && messageId) {
      await this.telegramApi.editMessageCaption(
        chatId,
        messageId,
        (cb.message?.caption || "") + "\n\n❌ *ОТКЛОНЕНО*",
        { inline_keyboard: [] }
      );
    }
  }

  async handleViewCarousel(cb: TelegramCallbackQuery, runId: string): Promise<void> {
    const chatId = cb.message?.chat.id;
    if (!chatId || !runId) return;

    await this.telegramApi.answerCallbackQuery(cb.id, "⏳ Загружаю слайды карусели...");

    try {
      const db = getDb();
      const bucket = new GridFSBucket(db, { bucketName: "carousel_images" });
      const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
      const designDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.DESIGN });
      const designResult = (designDoc?.result as any) || {};

      let imageIds: string[] = [];
      if (Array.isArray(designResult.imageIds) && designResult.imageIds.length > 0) {
        imageIds = designResult.imageIds;
      } else if (Array.isArray(designResult.carouselImages) && designResult.carouselImages.length > 0) {
        imageIds = designResult.carouselImages;
      } else if (designResult.rendered_styles) {
        const firstStyle = Object.values(designResult.rendered_styles)[0] as any;
        if (firstStyle && Array.isArray(firstStyle.imageIds)) {
          imageIds = firstStyle.imageIds;
        }
      }

      const slideBuffers: { name: string; buffer: Buffer }[] = [];

      if (imageIds.length > 0) {
        for (let i = 0; i < imageIds.length; i++) {
          try {
            const chunks: Buffer[] = [];
            const downloadStream = bucket.openDownloadStream(new ObjectId(imageIds[i]));
            await new Promise<void>((resolve, reject) => {
              downloadStream.on("data", (chunk) => chunks.push(chunk));
              downloadStream.on("end", () => resolve());
              downloadStream.on("error", reject);
            });
            slideBuffers.push({
              name: `slide_${i + 1}.png`,
              buffer: Buffer.concat(chunks),
            });
          } catch (dlErr) {
            logger.error({ dlErr, fileIdStr: imageIds[i] }, "Failed to stream slide from GridFS");
          }
        }
      }

      // Fallback на ZIP архив, если отдельные imageIds не найдены
      if (slideBuffers.length === 0) {
        const zipIdStr = designResult.zipId || designResult.imageId || designResult.zip_cover_1_id;
        if (zipIdStr) {
          try {
            const chunks: Buffer[] = [];
            const downloadStream = bucket.openDownloadStream(new ObjectId(zipIdStr));
            await new Promise<void>((resolve, reject) => {
              downloadStream.on("data", (chunk) => chunks.push(chunk));
              downloadStream.on("end", () => resolve());
              downloadStream.on("error", reject);
            });
            const zipBuffer = Buffer.concat(chunks);
            const zip = new AdmZip(zipBuffer);
            const entries = zip
              .getEntries()
              .filter((e) => !e.isDirectory && (e.entryName.endsWith(".png") || e.entryName.endsWith(".jpg")))
              .sort((a, b) => a.entryName.localeCompare(b.entryName));

            for (const entry of entries) {
              slideBuffers.push({
                name: entry.entryName,
                buffer: entry.getData(),
              });
            }
          } catch (zipErr) {
            logger.error({ zipErr, zipIdStr }, "Failed to extract slides from ZIP in GridFS");
          }
        }
      }

      if (slideBuffers.length === 0) {
        await this.telegramApi.sendMessage(chatId, "⚠️ Не удалось найти слайды карусели для этого прогона.");
        return;
      }

      const media = slideBuffers.slice(0, 10).map((slide, idx) => ({
        type: "photo" as const,
        media: `attach://${slide.name}`,
        caption: idx === 0 ? `🖼 *Карусель для прогона \`${runId}\`* (${slideBuffers.length} слайдов)` : undefined,
        parse_mode: "Markdown" as const,
      }));

      await this.telegramApi.sendMediaGroup(chatId, media, slideBuffers.slice(0, 10));
    } catch (err) {
      logger.error({ err, runId }, "Error rendering carousel in Telegram");
      await this.telegramApi.sendMessage(chatId, "❌ Ошибка при отправке карусели из базы данных.");
    }
  }

  async handleViewFullText(cb: TelegramCallbackQuery, runId: string): Promise<void> {
    const chatId = cb.message?.chat.id;
    if (!chatId || !runId) return;

    await this.telegramApi.answerCallbackQuery(cb.id);

    const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
    const writingDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.WRITING });
    const fullText = (writingDoc?.result as any)?.text || "Текст отсутствует.";

    await this.telegramApi.sendMessage(
      chatId,
      `📝 *Полный текст поста для прогона \`${runId}\`:*\n\n${fullText}`
    );
  }

  async handleUploadCover(cb: TelegramCallbackQuery, runId: string): Promise<void> {
    const chatId = cb.message?.chat.id;
    if (!chatId || !runId) return;

    await this.telegramApi.answerCallbackQuery(cb.id, "Пришлите фото для обложки");
    this.photoHandler.setPendingPhoto(cb.from.id, { runId, slideIndex: 0 });
    await this.telegramApi.sendMessage(
      chatId,
      `📸 *Режим загрузки своей обложки*\n\n` +
      `Пришлите в этот чат изображение/кадр (как обычное фото).\n` +
      `Оно будет загружено в GridFS и заменено на 1-й слайд обложки карусели для прогона \`${runId}\`.`
    );
  }

  async handleEditText(cb: TelegramCallbackQuery, runId: string): Promise<void> {
    const chatId = cb.message?.chat.id;
    if (!chatId || !runId) return;

    await this.telegramApi.answerCallbackQuery(cb.id, "Отправьте исправленный текст");
    this.textEditor.setPendingEdit(cb.from.id, runId);
    await this.telegramApi.sendMessage(
      chatId,
      `✏️ *Режим редактирования текста поста*\n\n` +
      `Отправьте новым сообщением исправленный текст для прогона \`${runId}\`.`
    );
  }

  async handleRegenerateWriting(cb: TelegramCallbackQuery, runId: string): Promise<void> {
    if (!await this.checkTenantAccess(cb.from.id, runId, cb.id)) return;
    await this.telegramApi.answerCallbackQuery(cb.id, "🔄 Запускаю регенерацию текста...");

    const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
    const currentRun = await runsCol.findOne({ runId });

    const writingQueue = this.queues[PipelineStage.WRITING];
    if (writingQueue) {
      await writingQueue.add("writing-job", {
        runId,
        stage: PipelineStage.WRITING,
        attempt: ((currentRun as any)?.attempts || 1) + 1,
        payload: {
          topic: currentRun?.topic,
          tenantId: currentRun?.tenantId,
          pillarId: (currentRun?.topic as any)?.pillarId,
        },
      } as AgentJob);
    }

    const chatId = cb.message?.chat.id;
    if (chatId) {
      await this.telegramApi.sendMessage(
        chatId,
        `✍️ *Запущена повторная генерация текста* для прогона \`${runId}\`. Ожидайте готовности.`
      );
    }
  }

  async handleRegenerateDesign(cb: TelegramCallbackQuery, runId: string): Promise<void> {
    if (!await this.checkTenantAccess(cb.from.id, runId, cb.id)) return;
    await this.telegramApi.answerCallbackQuery(cb.id, "🎨 Запускаю редизайн карусели...");

    const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
    const currentRun = await runsCol.findOne({ runId });

    const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
    const writingDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.WRITING });

    const designQueue = this.queues[PipelineStage.DESIGN];
    if (designQueue) {
      await designQueue.add("design-job", {
        runId,
        stage: PipelineStage.DESIGN,
        attempt: ((currentRun as any)?.attempts || 1) + 1,
        payload: {
          writingResult: writingDoc?.result,
          tenantId: currentRun?.tenantId,
          pillarId: (currentRun?.topic as any)?.pillarId,
        },
      } as AgentJob);
    }

    const chatId = cb.message?.chat.id;
    if (chatId) {
      await this.telegramApi.sendMessage(
        chatId,
        `🎨 *Запущена генерация нового дизайна* для прогона \`${runId}\`. Ожидайте готовности.`
      );
    }
  }

  async handleViewLogs(cb: TelegramCallbackQuery, runId: string): Promise<void> {
    const chatId = cb.message?.chat.id;
    if (!chatId || !runId) return;

    await this.telegramApi.answerCallbackQuery(cb.id);
    const runLogs = await this.logViewer.getRunLogs(runId);
    await this.telegramApi.sendMessage(chatId, runLogs);
  }
}
