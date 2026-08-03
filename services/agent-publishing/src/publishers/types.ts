export interface PublishSlide {
  entryName: string;
  buffer: Buffer;
}

export interface PublishCredentials {
  accessToken: string;
  accountId?: string; // ownerUrn для LinkedIn, ig-user-id для Instagram
}

export interface PublishResult {
  url: string;
  remoteId?: string;
}

/**
 * Единый контракт публикации для разных платформ (см. TZ_v3_instagram_testo_portal.md, раздел 2.4).
 * Реализации: LinkedInPublisher (см. linkedin.ts), InstagramPublisher (см. instagram.ts).
 */
export interface PlatformPublisher {
  publish(params: { runId: string; text: string; slides: PublishSlide[]; credentials: PublishCredentials }): Promise<PublishResult>;
}
