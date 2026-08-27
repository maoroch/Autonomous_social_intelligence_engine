import { createLogger } from "@pipeline/shared/logger";
import type { PlatformPublisher, PublishCredentials, PublishSlide } from "./types.js";

const logger = createLogger("telegram-publisher");

/**
 * Публикатор в Telegram-канал через Telegram Bot API (sendMediaGroup / sendMessage).
 */
export class TelegramPublisher implements PlatformPublisher {
  async publish(params: {
    runId: string;
    text: string;
    slides: PublishSlide[];
    credentials: PublishCredentials;
  }): Promise<{ url: string; remoteId?: string }> {
    const botToken = params.credentials.accessToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = params.credentials.accountId || process.env.TELEGRAM_CHANNEL_ID;

    if (!botToken || !chatId) {
      logger.warn({ runId: params.runId }, "Telegram botToken or chatId is missing. Simulating publication.");
      return {
        url: `https://t.me/cinema_hub/mock_${params.runId}`,
        remoteId: `mock_${params.runId}`,
      };
    }

    try {
      const apiUrl = `https://api.telegram.org/bot${botToken}`;

      if (params.slides.length > 0) {
        const formData = new FormData();
        formData.append("chat_id", chatId);

        const mediaArray = params.slides.map((slide, idx) => {
          const attachName = `slide_${idx}.png`;
          const blob = new Blob([new Uint8Array(slide.buffer)], { type: "image/png" });
          formData.append(attachName, blob, attachName);

          return {
            type: "photo",
            media: `attach://${attachName}`,
            caption: idx === 0 ? params.text.substring(0, 1024) : undefined,
            parse_mode: idx === 0 ? "Markdown" : undefined,
          };
        });

        formData.append("media", JSON.stringify(mediaArray));

        const res = await fetch(`${apiUrl}/sendMediaGroup`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Telegram sendMediaGroup failed: ${res.status} ${errText}`);
        }

        const data = (await res.json()) as any;
        const msgId = data.result?.[0]?.message_id;

        return {
          url: `https://t.me/${chatId.replace("@", "")}/${msgId ?? "1"}`,
          remoteId: String(msgId ?? "1"),
        };
      } else {
        const res = await fetch(`${apiUrl}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: params.text,
            parse_mode: "Markdown",
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Telegram sendMessage failed: ${res.status} ${errText}`);
        }

        const data = (await res.json()) as any;
        const msgId = data.result?.message_id;

        return {
          url: `https://t.me/${chatId.replace("@", "")}/${msgId ?? "1"}`,
          remoteId: String(msgId ?? "1"),
        };
      }
    } catch (err) {
      logger.error({ err, runId: params.runId }, "Failed to publish to Telegram");
      throw err;
    }
  }
}
