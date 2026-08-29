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
      const scanDir = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.name.endsWith(".png") || entry.name.endsWith(".svg")) {
            const key = entry.name.replace(/\.(png|svg)$/, "").toLowerCase();
            if (entry.name.endsWith(".svg")) {
              pngBase64Cache.set(key, fs.readFileSync(fullPath, "utf8"));
            } else {
              pngBase64Cache.set(key, fs.readFileSync(fullPath).toString("base64"));
            }
          }
        }
      };
      scanDir(pngDir);
      logger.info({ count: pngBase64Cache.size }, "Loaded PNG/SVG illustrations from disk");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load local illustrations directory");
  }
}

// Вызываем инициализацию при импорте
initIllustrations();

import { getCollection, Collections } from "@pipeline/shared/db";

export async function loadIllustrationsFromDb(): Promise<void> {
  try {
    const pngCollection = getCollection<any>(Collections.PNG_ILLUSTRATIONS);
    const pngDocs = await pngCollection.find({}).toArray();
    for (const doc of pngDocs) {
      if (doc.name && doc.base64Content) {
        const key = doc.name.toLowerCase();
        pngBase64Cache.set(key, doc.base64Content);
      }
    }

    const svgCollection = getCollection<any>(Collections.SVG_ILLUSTRATIONS);
    const svgDocs = await svgCollection.find({}).toArray();
    for (const doc of svgDocs) {
      if (doc.name && doc.svgContent) {
        const key = doc.name.toLowerCase();
        svgCache.set(key, doc.svgContent);
      }
    }
    logger.info(
      { pngCount: pngDocs.length, svgCount: svgDocs.length },
      "Loaded illustrations from MongoDB collections into cache"
    );
  } catch (err) {
    // If not connected yet during early import, ignore
  }
}

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
  if (!illustrationKey || !illustrationKey.trim()) return "";
  const trimmed = illustrationKey.trim();

  // Direct image URL or Data URI
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("/")
  ) {
    return `<img src="${trimmed}" style="width: 100%; height: 100%; object-fit: cover; display: block;" alt="illustration" />`;
  }

  // Direct inline SVG
  if (trimmed.startsWith("<svg")) {
    return trimmed;
  }

  const key = trimmed.toLowerCase();

  // 1. Проверяем PNG / SVG cache (включая MongoDB)
  if (pngBase64Cache.has(key)) {
    const raw = pngBase64Cache.get(key)!.trim();
    if (raw.startsWith("<svg")) {
      return raw;
    }
    if (raw.startsWith("data:image/")) {
      return `<img src="${raw}" style="width: 100%; height: 100%; object-fit: cover; display: block;" alt="${key}" />`;
    }
    try {
      const head = Buffer.from(raw.slice(0, 100), "base64").toString("utf8").trim();
      if (head.startsWith("<svg")) {
        return Buffer.from(raw, "base64").toString("utf8");
      }
    } catch (e) {}
    return `<img src="data:image/png;base64,${raw}" style="width: 100%; height: 100%; object-fit: cover; display: block;" alt="${key}" />`;
  }

  // 2. Проверяем SVG cache (включая MongoDB)
  if (svgCache.has(key)) {
    return svgCache.get(key)!;
  }

  // 3. Пытаемся прочитать с диска (SVG или PNG)
  try {
    const svgPath = path.join(templateDir, templateSetId, `${key}.svg`);
    if (fs.existsSync(svgPath)) {
      return fs.readFileSync(svgPath, "utf8");
    }
    const pngPath = path.join(templateDir, "png-illustrations", templateSetId, `${key}.png`);
    if (fs.existsSync(pngPath)) {
      const base64 = fs.readFileSync(pngPath).toString("base64");
      return `<img src="data:image/png;base64,${base64}" style="width: 100%; height: 100%; object-fit: cover; display: block;" alt="${key}" />`;
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
