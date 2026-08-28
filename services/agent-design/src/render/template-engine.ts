import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "@pipeline/shared/logger";
import type { SlideItem } from "../validators/slide-deck.validator.js";
import type { StyleConfig, RenderContext } from "../types/index.js";
import { resolveIllustrationTag, matchIllustrationForSlide } from "../assets/illustration-loader.js";

const logger = createLogger("agent-design:template-engine");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateDir = path.resolve(__dirname, "../../template");

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function loadTemplateHtml(templateRelPath: string): string {
  const normalizedPath = templateRelPath.endsWith(".html") ? templateRelPath : `${templateRelPath}.html`;
  const fullPath = path.join(templateDir, normalizedPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Template HTML file not found: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

export function formatSlideBullets(
  bullets: string[] | undefined,
  bulletFormat: string | undefined,
  isCover: boolean,
  fallbackDesc?: string
): { bodyText: string; bodyHtml: string } {
  const safeBullets = bullets || [];

  if (isCover) {
    let desc = "";
    if (safeBullets.length > 0) {
      desc = safeBullets.filter(Boolean).join(" ");
    } else if (fallbackDesc) {
      desc = fallbackDesc;
    }
    return {
      bodyText: desc,
      bodyHtml: desc ? `<p class="body-text">${escapeHtml(desc)}</p>` : "",
    };
  }

  // Cards format
  if (bulletFormat === "card-box" || bulletFormat === undefined) {
    const html = safeBullets
      .map(
        (b) =>
          `<div class="bullet-card"><p class="bullet-text">${escapeHtml(b)}</p></div>`
      )
      .join("");
    return {
      bodyText: safeBullets.join("\n"),
      bodyHtml: html,
    };
  }

  if (bulletFormat === "inline-arrow") {
    const html = safeBullets
      .map((b) => `<p class="bullet-item arrow">→ ${escapeHtml(b)}</p>`)
      .join("");
    return {
      bodyText: safeBullets.join("\n"),
      bodyHtml: html,
    };
  }

  const html = safeBullets
    .map((b) => `<p class="bullet-item">${escapeHtml(b)}</p>`)
    .join("");
  return {
    bodyText: safeBullets.join("\n"),
    bodyHtml: html,
  };
}

export function interpolateTemplate(
  templateHtml: string,
  slide: SlideItem,
  style: StyleConfig,
  index: number,
  totalSlides: number,
  fallbackCoverDesc?: string,
  logoHtml?: string
): string {
  const isCover = index === 0 || slide.isCover === true;
  const badge = slide.badge || (isCover ? style.defaultCoverBadge : style.defaultCardBadge);
  const title = slide.title || "";

  const { bodyText, bodyHtml } = formatSlideBullets(
    slide.bullets,
    style.bulletFormat,
    isCover,
    fallbackCoverDesc
  );

  const illustrationKey = slide.illustration || slide.illustration_name || matchIllustrationForSlide(slide);
  const illustrationTag = resolveIllustrationTag(illustrationKey, style.key);

  const brand = style.brand || {
    accentColor: "#FF7900",
    inkColor: "#09090B",
    paperColor: "#FFFFFF",
  };

  const footerLeft =
    logoHtml ||
    `<span style="font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 800; color: ${brand.inkColor};">${style.name || "Testo"}</span>`;

  let rendered = templateHtml
    .replace(/\{\{ACCENT_COLOR\}\}/g, brand.accentColor)
    .replace(/\{\{INK_COLOR\}\}/g, brand.inkColor)
    .replace(/\{\{PAPER_COLOR\}\}/g, brand.paperColor)
    .replace(/\{\{BADGE\}\}/g, escapeHtml(badge))
    .replace(/\{\{TITLE\}\}/g, escapeHtml(title))
    .replace(/\{\{BODY\}\}/g, escapeHtml(bodyText))
    .replace(/\{\{BODY_HTML\}\}/g, bodyHtml)
    .replace(/\{\{BODY_STYLE\}\}/g, bodyText.trim() ? "display: block;" : "display: none;")
    .replace(/\{\{PAGE_NUMBER\}\}/g, String(index + 1))
    .replace(/\{\{TOTAL_PAGES\}\}/g, String(totalSlides))
    .replace(/\{\{PAGE_TEXT\}\}/g, `${index + 1}/${totalSlides}`)
    .replace(/\{\{FOOTER_LEFT\}\}/g, footerLeft)
    .replace(/\{\{ILLUSTRATION\}\}/g, illustrationTag)
    .replace(
      /\{\{ILLUSTRATION_STYLE\}\}/g,
      illustrationTag && !isCover ? "display: flex;" : "display: none;"
    );

  return rendered;
}
