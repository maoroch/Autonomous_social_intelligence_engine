import { createLogger } from "@pipeline/shared/logger";
import type { TelegramMessage } from "../types/telegram.types.js";
import type { CommandRouter } from "./command.router.js";
import type { TextEditorHandler } from "../handlers/text-editor.js";
import type { PhotoHandler } from "../handlers/photo-handler.js";
import type { TelegramApiService } from "../services/telegram-api.service.js";

const logger = createLogger("telegram-bot:message-router");

export class MessageRouter {
  constructor(
    private commandRouter: CommandRouter,
    private textEditor: TextEditorHandler,
    private photoHandler: PhotoHandler,
    private telegramApi: TelegramApiService
  ) {}

  async route(msg: TelegramMessage): Promise<void> {
    const text = (msg.text || "").trim();
    const userId = msg.from?.id;
    const chatId = msg.chat.id;

    // 1. Команды (начинаются с /)
    if (text.startsWith("/")) {
      await this.commandRouter.route(msg);
      return;
    }

    // 2. Обработка загрузки фото-кавера
    if (msg.photo && msg.photo.length > 0 && userId) {
      if (this.photoHandler.getPendingPhoto(userId)) {
        logger.info({ userId }, "Routing photo to PhotoHandler");
        await this.photoHandler.handlePhotoMessage(msg);
        return;
      }
    }

    // 3. Обработка текстового ввода (режим редактирования поста)
    if (text && userId) {
      const pendingEdit = this.textEditor.getPendingEdit(userId);
      if (pendingEdit) {
        logger.info({ userId, runId: pendingEdit.runId }, "Applying text edit to post");
        this.textEditor.clearPendingEdit(userId);
        const success = await this.textEditor.applyDirectTextEdit(pendingEdit.runId, text);
        if (success) {
          await this.telegramApi.sendMessage(
            chatId,
            `✅ *Текст поста успешно обновлен!*\n\n${text.substring(0, 300)}...`
          );
        } else {
          await this.telegramApi.sendMessage(chatId, `❌ Ошибка при сохранении текста в базу данных.`);
        }
        return;
      }
    }
  }
}
