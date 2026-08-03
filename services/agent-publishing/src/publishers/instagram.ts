import { createLogger } from "@pipeline/shared/logger";
import type { PlatformPublisher, PublishCredentials } from "./types.js";

const logger = createLogger("instagram-publisher");

const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Instagram Graph API публикует карусели ТОЛЬКО через image_url — в отличие от LinkedIn,
 * у Graph API нет эндпоинта для прямой загрузки бинарных данных. Поэтому InstagramPublisher
 * принимает функцию uploadAndGetPublicUrl, которая должна загрузить PNG во внешнее публично
 * доступное хранилище (например GridFS + публичный роут openclaw `/images/:id`, см. index.ts)
 * и вернуть абсолютный URL, доступный серверам Meta.
 *
 * Важно: PUBLIC_BASE_URL, на который ссылается uploadAndGetPublicUrl, ДОЛЖЕН быть реальным
 * публичным доменом (не localhost) — иначе Meta не сможет скачать изображение.
 */
export class InstagramPublisher implements PlatformPublisher {
  constructor(private readonly uploadAndGetPublicUrl: (buffer: Buffer, filename: string) => Promise<string>) {}

  async publish({
    runId,
    text,
    slides,
    credentials,
  }: {
    runId: string;
    text: string;
    slides: { entryName: string; buffer: Buffer }[];
    credentials: PublishCredentials;
  }) {
    const { accessToken, accountId: igUserId } = credentials;

    if (!igUserId) {
      throw new Error("Instagram publishing requires a connected ig-user-id (AuthorProfile.connectedPlatforms.accountId)");
    }
    if (slides.length === 0) {
      throw new Error("No slides provided for Instagram publishing");
    }
    if (slides.length > 10) {
      logger.warn({ runId, count: slides.length }, "Instagram carousel supports max 10 items — truncating extra slides");
      slides = slides.slice(0, 10);
    }

    // 1. Публичный хостинг каждого слайда + создание media container для каждого изображения.
    const childContainerIds: string[] = [];
    for (const slide of slides) {
      const publicUrl = await this.uploadAndGetPublicUrl(slide.buffer, slide.entryName);
      logger.info({ runId, entryName: slide.entryName, publicUrl }, "Creating Instagram media container for slide...");

      const params = new URLSearchParams({
        image_url: publicUrl,
        is_carousel_item: "true",
        access_token: accessToken,
      });

      const res = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, { method: "POST", body: params });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to create Instagram media container: ${res.status} ${errText}`);
      }
      const data = (await res.json()) as { id: string };
      childContainerIds.push(data.id);
    }

    // 2. Создание контейнера карусели, ссылающегося на дочерние контейнеры.
    logger.info({ runId, childCount: childContainerIds.length }, "Creating Instagram carousel container...");
    const carouselParams = new URLSearchParams({
      media_type: "CAROUSEL",
      children: childContainerIds.join(","),
      caption: text,
      access_token: accessToken,
    });

    const carouselRes = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, { method: "POST", body: carouselParams });
    if (!carouselRes.ok) {
      const errText = await carouselRes.text();
      throw new Error(`Failed to create Instagram carousel container: ${carouselRes.status} ${errText}`);
    }
    const carouselData = (await carouselRes.json()) as { id: string };
    const creationId = carouselData.id;

    // 3. Ожидание готовности контейнера (Meta обрабатывает изображения асинхронно).
    await this.waitUntilFinished(creationId, accessToken, runId);

    // 4. Публикация.
    logger.info({ runId, creationId }, "Publishing Instagram carousel...");
    const publishParams = new URLSearchParams({ creation_id: creationId, access_token: accessToken });
    const publishRes = await fetch(`${GRAPH_API_BASE}/${igUserId}/media_publish`, { method: "POST", body: publishParams });
    if (!publishRes.ok) {
      const errText = await publishRes.text();
      throw new Error(`Failed to publish Instagram carousel: ${publishRes.status} ${errText}`);
    }
    const publishData = (await publishRes.json()) as { id: string };
    const mediaId = publishData.id;

    // 5. Получение постоянной ссылки на пост.
    let permalink = `https://www.instagram.com/p/unknown/`;
    try {
      const permalinkRes = await fetch(`${GRAPH_API_BASE}/${mediaId}?fields=permalink&access_token=${accessToken}`);
      if (permalinkRes.ok) {
        const permalinkData = (await permalinkRes.json()) as { permalink?: string };
        if (permalinkData.permalink) permalink = permalinkData.permalink;
      }
    } catch (err) {
      logger.warn({ err, runId, mediaId }, "Failed to fetch Instagram permalink, returning fallback URL");
    }

    logger.info({ runId, permalink }, "Successfully published to Instagram!");
    return { url: permalink, remoteId: mediaId };
  }

  private async waitUntilFinished(containerId: string, accessToken: string, runId: string, maxAttempts = 10): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const statusRes = await fetch(`${GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`);
      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as { status_code?: string };
        if (statusData.status_code === "FINISHED") return;
        if (statusData.status_code === "ERROR") {
          throw new Error(`Instagram media container ${containerId} failed processing (status_code=ERROR)`);
        }
      }
      logger.info({ runId, containerId, attempt }, "Instagram container not ready yet, waiting...");
      await sleep(1500);
    }
    logger.warn({ runId, containerId }, "Instagram container status polling timed out — attempting publish anyway");
  }
}
