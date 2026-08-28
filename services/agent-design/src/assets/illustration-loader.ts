import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "@pipeline/shared/logger";
import type { SlideItem } from "../validators/slide-deck.validator.js";

const logger = createLogger("agent-design:illustrations");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateDir = path.resolve(__dirname, "../../template");

const svgCache = new Map<string, string>();
const pngBase64Cache = new Map<string, string>();

/**
 * Загрузка SVG и PNG иллюстраций в память
 */
export function initIllustrations(): void {
  try {
    const svgDir = path.join(templateDir, "svg-illustrations");
    if (fs.existsSync(svgDir)) {
      const files = fs.readdirSync(svgDir).filter((f) => f.endsWith(".svg"));
      for (const file of files) {
        const key = file.replace(".svg", "").toLowerCase();
        const content = fs.readFileSync(path.join(svgDir, file), "utf8");
        svgCache.set(key, content);
      }
      logger.info({ count: svgCache.size }, "Loaded SVG illustrations from disk");
    }

    const pngDir = path.join(templateDir, "png-illustrations");
    if (fs.existsSync(pngDir)) {
      const files = fs.readdirSync(pngDir).filter((f) => f.endsWith(".png") || f.endsWith(".svg"));
      for (const file of files) {
        const key = file.replace(/\.(png|svg)$/, "").toLowerCase();
        if (file.endsWith(".svg")) {
          const content = fs.readFileSync(path.join(pngDir, file), "utf8");
          pngBase64Cache.set(key, content);
        } else {
          const base64 = fs.readFileSync(path.join(pngDir, file)).toString("base64");
          pngBase64Cache.set(key, base64);
        }
      }
      logger.info({ count: pngBase64Cache.size }, "Loaded PNG/SVG illustrations from disk");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load local illustrations directory");
  }
}

// Вызываем инициализацию при импорте
initIllustrations();

export function getSvgIllustration(name: string): string | undefined {
  return svgCache.get(name.toLowerCase());
}

export function getPngIllustration(name: string): string | undefined {
  return pngBase64Cache.get(name.toLowerCase());
}

export function resolveIllustrationTag(
  illustrationKey: string | undefined,
  templateSetId: string
): string {
  if (!illustrationKey) return "";
  const key = illustrationKey.toLowerCase();

  // 1. Проверяем PNG / SVG cache
  if (pngBase64Cache.has(key)) {
    const raw = pngBase64Cache.get(key)!;
    if (raw.trim().startsWith("<svg")) {
      return raw;
    }
    return `<img src="data:image/png;base64,${raw}" style="max-height: 100%; max-width: 100%; object-fit: contain;" alt="${key}" />`;
  }

  // 2. Проверяем SVG cache
  if (svgCache.has(key)) {
    return svgCache.get(key)!;
  }

  // 3. Пытаемся прочитать с диска
  try {
    const customPath = path.join(templateDir, templateSetId, `${key}.svg`);
    if (fs.existsSync(customPath)) {
      return fs.readFileSync(customPath, "utf8");
    }
  } catch (e) {
    // ignore
  }

  return "";
}

export function matchIllustrationForSlide(slide: SlideItem): string {
  const text = `${slide.title || ""} ${slide.badge || ""} ${(slide.bullets || []).join(" ")}`.toLowerCase();

  if (text.includes("testo") || text.includes("датчик") || text.includes("sensor") || text.includes("газоанализатор")) {
    return "testo_300";
  }
  if (text.includes("код") || text.includes("code") || text.includes("typescript") || text.includes("git")) {
    return "code";
  }
  if (text.includes("архитектур") || text.includes("system") || text.includes("server") || text.includes("cloud")) {
    return "architecture";
  }
  if (text.includes("мониторинг") || text.includes("метрики") || text.includes("анализ") || text.includes("график")) {
    return "analytics";
  }
  if (text.includes("безопасность") || text.includes("security") || text.includes("auth")) {
    return "security";
  }

  return "architecture";
}
