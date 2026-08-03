import { createLogger } from "@pipeline/shared/logger";
import type { PlatformPublisher, PublishCredentials } from "./types.js";

const logger = createLogger("linkedin-publisher");

/**
 * Пытается автоматически определить ownerUrn через LinkedIn OpenID /v2/userinfo,
 * если он явно не задан в credentials (сохраняет поведение старого index.ts).
 */
async function resolveOwnerUrn(accessToken: string, ownerUrn: string | undefined, runId: string): Promise<string | undefined> {
  if (ownerUrn && !ownerUrn.includes("ВАШ_ID")) return ownerUrn;

  logger.info({ runId }, "LinkedIn ownerUrn not provided. Attempting to fetch automatically from /v2/userinfo...");
  try {
    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (meRes.ok) {
      const meData = (await meRes.json()) as any;
      if (meData.sub) {
        const resolved = `urn:li:person:${meData.sub}`;
        logger.info({ runId, ownerUrn: resolved }, "Successfully fetched owner URN automatically");
        return resolved;
      }
      logger.warn({ runId }, "LinkedIn /v2/userinfo response did not contain sub");
    } else {
      const errText = await meRes.text();
      logger.warn({ runId, status: meRes.status, errText }, "Failed to fetch LinkedIn profile ID");
    }
  } catch (err) {
    logger.error({ err, runId }, "Error requesting LinkedIn profile URN");
  }
  return undefined;
}

export class LinkedInPublisher implements PlatformPublisher {
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
    const accessToken = credentials.accessToken;
    const ownerUrn = await resolveOwnerUrn(accessToken, credentials.accountId, runId);

    if (!ownerUrn) {
      throw new Error("Could not resolve LinkedIn ownerUrn for publishing");
    }

    logger.info({ runId, ownerUrn }, "Publishing carousel to LinkedIn...");

    const imageUrns: string[] = [];

    for (const entry of slides) {
      logger.info({ runId, entryName: entry.entryName }, "Registering upload for slide image...");

      const registerRes = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": "202602",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
      });

      if (!registerRes.ok) {
        const errText = await registerRes.text();
        throw new Error(`Failed to register LinkedIn upload: ${registerRes.status} ${errText}`);
      }

      const registerData = (await registerRes.json()) as any;
      const uploadUrl = registerData.value.uploadUrl;
      const assetUrn = registerData.value.image;

      logger.info({ runId, entryName: entry.entryName }, "Uploading image binary to LinkedIn...");
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/png" },
        body: entry.buffer,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Failed to upload image to LinkedIn: ${uploadRes.status} ${errText}`);
      }

      imageUrns.push(assetUrn);
    }

    logger.info({ runId, imageCount: imageUrns.length }, "Creating final LinkedIn publication...");

    const postRes = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202602",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: ownerUrn,
        commentary: text,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: { multiImage: { images: imageUrns.map((urn) => ({ id: urn })) } },
        lifecycleState: "PUBLISHED",
      }),
    });

    if (!postRes.ok) {
      const errText = await postRes.text();
      throw new Error(`Failed to create LinkedIn post: ${postRes.status} ${errText}`);
    }

    const postUrn = postRes.headers.get("x-restli-id") || ((await postRes.json()) as any)?.id || "unknown";
    const url = `https://www.linkedin.com/feed/update/${postUrn}`;
    logger.info({ runId, url }, "Successfully published to LinkedIn!");

    return { url, remoteId: postUrn };
  }
}
