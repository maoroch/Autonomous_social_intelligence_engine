import { createLogger } from "@pipeline/shared/logger";
import type { TelegramInlineKeyboardMarkup, TelegramInputMediaPhoto, TelegramUpdate } from "../types/telegram.types.js";

const logger = createLogger("telegram-bot:api");

export class TelegramApiService {
  private baseUrl: string;

  constructor(private token: string) {
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    replyMarkup?: TelegramInlineKeyboardMarkup
  ): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        }),
      });
      const data = (await res.json()) as any;
      if (!data.ok) {
        logger.error({ data, chatId }, "Telegram sendMessage returned error");
      }
      return data;
    } catch (err) {
      logger.error({ err, chatId }, "Failed to send Telegram message");
      return null;
    }
  }

  async editMessageCaption(
    chatId: number | string,
    messageId: number,
    caption: string,
    replyMarkup?: TelegramInlineKeyboardMarkup
  ): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/editMessageCaption`, {
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
      return await res.json();
    } catch (err) {
      logger.error({ err, chatId, messageId }, "Failed to edit message caption");
      return null;
    }
  }

  async editMessageReplyMarkup(
    chatId: number | string,
    messageId: number,
    replyMarkup: TelegramInlineKeyboardMarkup
  ): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: replyMarkup,
        }),
      });
      return await res.json();
    } catch (err) {
      logger.error({ err, chatId, messageId }, "Failed to edit message reply markup");
      return null;
    }
  }

  async sendMediaGroup(
    chatId: number | string,
    media: TelegramInputMediaPhoto[],
    files: { name: string; buffer: Buffer }[]
  ): Promise<any> {
    try {
      const formData = new FormData();
      formData.append("chat_id", String(chatId));
      formData.append("media", JSON.stringify(media));

      for (const file of files) {
        const blob = new Blob([file.buffer], { type: "image/png" });
        formData.append(file.name, blob, file.name);
      }

      const res = await fetch(`${this.baseUrl}/sendMediaGroup`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as any;
      if (!data.ok) {
        logger.error({ data, chatId }, "Failed to sendMediaGroup in Telegram");
      }
      return data;
    } catch (err) {
      logger.error({ err, chatId }, "Failed to upload and send album via sendMediaGroup");
      return null;
    }
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert: boolean = false
  ): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          show_alert: showAlert,
        }),
      });
      return (await res.json()) as any;
    } catch (err) {
      logger.error({ err, callbackQueryId }, "Failed to answer Telegram callback query");
      return null;
    }
  }

  async getUpdates(offset: number, timeout: number = 30): Promise<TelegramUpdate[]> {
    try {
      const res = await fetch(`${this.baseUrl}/getUpdates?offset=${offset}&timeout=${timeout}`);
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as any;
      if (data.ok && Array.isArray(data.result)) {
        return data.result as TelegramUpdate[];
      }
      return [];
    } catch (err) {
      logger.error({ err }, "Error fetching updates in long polling");
      return [];
    }
  }
}
