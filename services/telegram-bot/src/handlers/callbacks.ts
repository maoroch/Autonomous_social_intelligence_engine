import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc, getDb } from "@pipeline/shared/db";
import { PipelineStage, PipelineRunStatus } from "@pipeline/shared";
import { createLogger } from "@pipeline/shared/logger";
import { GridFSBucket, ObjectId } from "mongodb";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import type { BotQueues, TestRunnerService } from "../services/test-runner.js";
import type { LogViewerService } from "../services/log-viewer.js";
import type { CinemaCuratorService } from "../services/cinema-curator.js";
import type { TechCuratorService } from "../services/tech-curator.js";
import type { TestoCuratorService } from "../services/testo-curator.js";
import type { TextEditorHandler } from "./text-editor.js";
import type { PhotoHandler } from "./photo-handler.js";
import { buildMainMenuKeyboard } from "../keyboards/inline.js";
import type { AgentJob } from "@pipeline/shared";

const logger = createLogger("telegram-bot:callbacks");

export class CallbackHandler {
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
    private editMessageReplyMarkup?: (chatId: number | string, messageId: number, replyMarkup?: any) => Promise<void>
  ) {}

  private async answerCallback(cbId: string, text?: string, showAlert = false) {
    try {
      await fetch(`https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: cbId, text, show_alert: showAlert }),
      });
    } catch (e) {}
  }

  async handleCallback(cb: {
    id: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number }; caption?: string; text?: string };
    data?: string;
  }) {
    if (!cb.data) return;

    const [action, param] = cb.data.split(":");
    const runId = param;
    const chatId = cb.message?.chat.id;
    const messageId = cb.message?.message_id;

    logger.info({ action, param, userId: cb.from.id }, "Handling callback action");

    try {
      if (action === "approve_run") {
        await this.answerCallback(cb.id, "🚀 Пост утвержден! Отправляю на публикацию...");
        const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
        const currentRun = await runsCol.findOne({ runId });

        await runsCol.updateOne(
          { runId },
          { $set: { status: PipelineRunStatus.APPROVED, currentStage: PipelineStage.PUBLISHING, updatedAt: new Date() } }
        );

        const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
        const writingDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.WRITING });
        const designDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.DESIGN });

        await this.queues[PipelineStage.PUBLISHING].add("publish-job", {
          runId: runId || "",
          stage: PipelineStage.PUBLISHING,
          attempt: 1,
          payload: { 
            text: (writingDoc?.result as any)?.text, 
            images: (designDoc?.result as any)?.imageIds || (designDoc?.result as any)?.carouselImages,
            tenantId: currentRun?.tenantId 
          },
        } as AgentJob);

        if (chatId && messageId && this.editMessageCaption) {
          await this.editMessageCaption(chatId, messageId, (cb.message?.caption || "") + "\n\n✅ *ОТПРАВЛЕНО В КАНАЛ*", { inline_keyboard: [] });
        }
      } else if (action === "view_carousel") {
        if (!chatId || !runId) return;
        await this.answerCallback(cb.id, "⏳ Загружаю слайды карусели...");

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
                  .filter((e) => e.entryName.endsWith(".png"))
                  .sort((a, b) => a.entryName.localeCompare(b.entryName));

                entries.forEach((entry, idx) => {
                  slideBuffers.push({
                    name: `slide_${idx + 1}.png`,
                    buffer: entry.getData(),
                  });
                });
              } catch (zipErr) {
                logger.error({ zipErr, zipIdStr }, "Failed to unzip carousel slides from GridFS");
              }
            }
          }

          if (slideBuffers.length === 0) {
            await this.sendMessage(chatId, `⚠️ Слайды карусели для прогона \`${runId}\` не найдены в базе данных.`);
            return;
          }

          // Формируем multipart FormData для Telegram sendMediaGroup
          const formData = new FormData();
          formData.append("chat_id", String(chatId));

          const mediaArray = slideBuffers.map((slide, idx) => {
            const attachName = `photo_${idx + 1}`;
            formData.append(attachName, new Blob([slide.buffer]), slide.name);

            return {
              type: "photo",
              media: `attach://${attachName}`,
              caption: idx === 0 ? `🖼 *Карусель для прогона \`${runId}\`* (${slideBuffers.length} слайдов):` : undefined,
              parse_mode: idx === 0 ? "Markdown" : undefined,
            };
          });

          formData.append("media", JSON.stringify(mediaArray));

          const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMediaGroup`, {
            method: "POST",
            body: formData as any,
          });

          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Telegram API error ${res.status}: ${errBody}`);
          }
        } catch (err: any) {
          logger.error({ err, runId }, "Failed to send carousel album");
          await this.sendMessage(chatId, `⚠️ Ошибка при отправке альбома слайдов: ${err.message}`);
        }
      } else if (action === "view_full_text") {
        if (!chatId || !runId) return;
        const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
        const writingDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.WRITING });
        await this.sendMessage(chatId, (writingDoc?.result as any)?.text || "Текст отсутствует");
      } else if (action === "view_logs") {
        if (!chatId || !runId) return;
        const logContent = await this.logViewer.getRunLogs(runId);
        await this.sendMessage(chatId, logContent);
      } else if (action === "upload_cover") {
        if (!chatId || !runId) return;
        this.photoHandler.setPendingPhoto(cb.from.id, { runId, slideIndex: 0 });
        await this.sendMessage(chatId, "📸 Отправьте новое фото для обложки:");
      } else if (action === "edit_text") {
        if (!chatId || !runId) return;
        const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
        const currentRun = await runsCol.findOne({ runId });
        const tenantId = currentRun?.tenantId || "cinema-media";
        const dashboardBaseUrl = process.env.DASHBOARD_PUBLIC_URL || "http://localhost:3005";
        const editUrl = `${dashboardBaseUrl}/${tenantId}/dashboard/runs/${runId}`;
        await this.sendMessage(
          chatId,
          `✏️ *Редактирование постов выполняется в Web Dashboard!*\n\n` +
          `Перейдите в веб-интерфейс для удобного редактирования текста, слайдов и шаблонов:\n🔗 ${editUrl}`
        );
      } else if (action === "regenerate_writing") {
        if (!runId) return;
        const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
        const currentRun = await runsCol.findOne({ runId });
        const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
        const trendDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.TREND });
        const strategyDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.STRATEGY });

        await this.queues[PipelineStage.WRITING].add("rewrite-job", {
          runId,
          stage: PipelineStage.WRITING,
          attempt: 1,
          payload: {
            topic: trendDoc?.result || currentRun?.topic,
            strategy: strategyDoc?.result,
            batches: (trendDoc?.result as any)?.batches,
            tenantId: currentRun?.tenantId,
          },
          extraInstructions: "User requested full rewrite of the post copy.",
        } as AgentJob);
        await this.answerCallback(cb.id, "🔄 Запущена регенерация текста...");
        if (chatId) {
          await this.sendMessage(chatId, `🔄 *Агент копирайтинга переписывает текст поста (${currentRun?.tenantId || "default"})...*\nRun ID: \`${runId}\``);
        }
      } else if (action === "regenerate_design") {
        if (!runId) return;
        const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
        const currentRun = await runsCol.findOne({ runId });
        const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
        const writingDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.WRITING });

        await this.queues[PipelineStage.DESIGN].add("redesign-job", {
          runId,
          stage: PipelineStage.DESIGN,
          attempt: 1,
          payload: {
            text: (writingDoc?.result as any)?.text,
            hook: (writingDoc?.result as any)?.hook,
            tenantId: currentRun?.tenantId,
          },
          extraInstructions: "User requested alternative visual design palette.",
        } as AgentJob);
        await this.answerCallback(cb.id, "🎨 Запущена регенерация дизайна...");
        if (chatId) {
          await this.sendMessage(chatId, `🎨 *Агент дизайна перерисовывает карусель (${currentRun?.tenantId || "default"})...*\nRun ID: \`${runId}\``);
        }
      } else if (action === "cinema_mode") {
        const mode = param === "popular" ? "popular" : "fresh";
        const articles = await this.cinemaCurator.fetchCuratedTopics(mode);
        this.cinemaCurator.saveUserArticles(cb.from.id, articles);
        const { text, replyMarkup } = this.cinemaCurator.formatArticleListMessage(articles, mode);
        await this.sendMessage(chatId!, text, replyMarkup);
      } else if (action === "tech_mode") {
        const mode = param === "popular" ? "popular" : "fresh";
        const articles = await this.techCurator.fetchCuratedTopics(mode);
        this.techCurator.saveUserArticles(cb.from.id, articles);
        const { text, replyMarkup } = this.techCurator.formatArticleListMessage(articles, mode);
        await this.sendMessage(chatId!, text, replyMarkup);
      } else if (action === "tech_pick") {
        const article = this.techCurator.getArticleByIndex(cb.from.id, Number(param));
        const runId = await this.techCurator.launchGroundedPipeline(article!, this.openclawUrl, this.queues);
        await this.sendMessage(chatId!, `🚀 Запущен пайплайн: \`${runId}\``);
      } else if (action === "testo_mode") {
        const mode = param === "gas" ? "gas" : "pharma";
        const articles = await this.testoCurator.fetchCuratedTopics(mode);
        this.testoCurator.saveUserArticles(cb.from.id, articles);
        const { text, replyMarkup } = this.testoCurator.formatArticleListMessage(articles, mode);
        await this.sendMessage(chatId!, text, replyMarkup);
      } else if (action === "testo_pick") {
        const article = this.testoCurator.getArticleByIndex(cb.from.id, Number(param));
        const runId = await this.testoCurator.launchGroundedPipeline(article!, this.openclawUrl, this.queues);
        await this.sendMessage(chatId!, `🚀 Запущен пайплайн Testo: \`${runId}\``);
      } else if (action === "cmd") {
        await this.answerCallback(cb.id);
        const command = param;

        if (command === "daily_cinema" && chatId) {
          await this.sendMessage(
            chatId,
            `🎬 *KinoPeek News Radar — Выберите категорию тем:*\n\n` +
            `Какой тип тем вы хотите получить от краулера перед запуском пайплайна?`,
            this.cinemaCurator.getCuratorMenuKeyboard()
          );
        } else if (command === "daily_tech" && chatId) {
          await this.sendMessage(
            chatId,
            `💻 *Tech Radar — Выберите категорию тем:*\n\n` +
            `Что вы хотите сгенерировать сегодня для Tech Portal?`,
            this.techCurator.getCuratorMenuKeyboard()
          );
        } else if (command === "daily_testo" && chatId) {
          await this.sendMessage(
            chatId,
            `🏭 *Testo Kazakhstan Radar — Выберите отрасль:*\n\n` +
            `Какое направление оборудования Testo вы хотите раскрыть в публикации?`,
            this.testoCurator.getCuratorMenuKeyboard()
          );
        } else if (command === "main_menu" && chatId) {
          await this.sendMessage(
            chatId,
            `🤖 *Главное меню Multi-Portal AI Hub:*`,
            buildMainMenuKeyboard()
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
