import { getCollection, Collections, type StageResultDoc, type PipelineRunDoc } from "@pipeline/shared/db";
import { PipelineStage } from "@pipeline/shared";
import { createLogger } from "@pipeline/shared/logger";
import type { BotQueues } from "../services/test-runner.js";

const logger = createLogger("telegram-bot:photo-handler");

export interface PendingPhotoState {
  runId: string;
  slideIndex: number;
}

export class PhotoHandler {
  private pendingUploads = new Map<number, PendingPhotoState>();

  constructor(
    private queues: BotQueues,
    private botToken: string,
    private sendMessage: (chatId: number | string, text: string, replyMarkup?: any) => Promise<any>
  ) {}

  setPendingPhoto(userId: number, state: PendingPhotoState) {
    this.pendingUploads.set(userId, state);
  }

  getPendingPhoto(userId: number): PendingPhotoState | undefined {
    return this.pendingUploads.get(userId);
  }

  clearPendingPhoto(userId: number) {
    this.pendingUploads.delete(userId);
  }

  /**
   * Обработка входящего фото из чата Telegram
   */
  async handlePhotoMessage(msg: any): Promise<boolean> {
    const userId = msg.from?.id;
    const chatId = msg.chat?.id;
    if (!userId || !msg.photo || !Array.isArray(msg.photo) || msg.photo.length === 0) {
      return false;
    }

    const pending = this.getPendingPhoto(userId);
    if (!pending) {
      return false;
    }

    this.clearPendingPhoto(userId);
    const { runId, slideIndex } = pending;

    try {
      await this.sendMessage(chatId, `⏳ *Загружаю ваш кадр и перерендериваю карусель для \`${runId.substring(0, 8)}\`...*`);

      // 1. Получаем наибольшее разрешение фотографии
      const photoObj = msg.photo[msg.photo.length - 1];
      const fileId = photoObj.file_id;

      // 2. Получаем ссылку на скачивание через getFile
      const getFileRes = await fetch(`https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`);
      if (!getFileRes.ok) {
        throw new Error(`Failed to getFile: ${getFileRes.status}`);
      }
      const fileData = (await getFileRes.json()) as any;
      const filePath = fileData.result?.file_path;
      if (!filePath) {
        throw new Error("Missing file_path from getFile");
      }

      // 3. Скачиваем Buffer изображения
      const downloadRes = await fetch(`https://api.telegram.org/file/bot${this.botToken}/${filePath}`);
      if (!downloadRes.ok) {
        throw new Error(`Failed to download file: ${downloadRes.status}`);
      }
      const arrayBuffer = await downloadRes.arrayBuffer();
      const imageBase64 = `data:image/jpeg;base64,${Buffer.from(arrayBuffer).toString("base64")}`;

      // 4. Обновляем render_data в MongoDB
      const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
      const designDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.DESIGN });

      const renderData = (designDoc?.result as any)?.render_data || {};
      if (Array.isArray(renderData.slides) && renderData.slides[slideIndex]) {
        renderData.slides[slideIndex].backdropImage = imageBase64;
        renderData.slides[slideIndex].sceneImage = imageBase64;
      }

      const customImages = (designDoc?.result as any)?.customImages || {};
      customImages[slideIndex] = imageBase64;

      await stageResultsCol.updateOne(
        { runId, stage: PipelineStage.DESIGN },
        {
          $set: {
            "result.render_data": renderData,
            "result.customImages": customImages,
            updatedAt: new Date(),
          },
        }
      );

      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      const runDoc = await runsCol.findOne({ runId });
      const existingDesignResult = (designDoc?.result as any) || {};
      const templateName =
        existingDesignResult.template_name ||
        (runDoc?.tenantId === "testo"
          ? "testo-brand-orange"
          : runDoc?.tenantId === "software-development-default"
            ? "cover-2"
            : "cinema-media");

      // 5. Отправляем задачу в очередь agent-design для мгновенного быстрого перерендера без LLM
      await this.queues[PipelineStage.DESIGN].add("design-job", {
        runId,
        stage: PipelineStage.DESIGN,
        attempt: 1,
        payload: {
          isInlineEdit: true,
          customImages,
          template_name: templateName,
          tenantId: runDoc?.tenantId,
        },
      } as any);

      logger.info({ runId, slideIndex, userId }, "Applied custom photo to slide deck and triggered fast re-render");
      return true;
    } catch (err: any) {
      logger.error({ err, runId, userId }, "Failed to process custom photo upload");
      await this.sendMessage(chatId, `❌ Не удалось применить фото: ${err.message}`);
      return false;
    }
  }
}
