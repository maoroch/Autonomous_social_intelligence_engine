import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "@pipeline/shared/logger";
import type { IndustryProfile } from "@pipeline/shared/schemas";
import { TemplateManifestSchema, type TemplateManifest } from "../validators/template.validator.js";
import type { StyleConfig } from "../types/index.js";
import { SOFTWARE_DEV_STYLES, CINEMA_MEDIA_STYLES } from "./template-catalog.js";

const logger = createLogger("agent-design:template-registry");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateDir = path.resolve(__dirname, "../../template");

class TemplateRegistry {
  private templates: Map<string, StyleConfig> = new Map();
  private tenantMap: Map<string, string[]> = new Map();

  constructor() {
    this.discoverDiskTemplates();
  }

  /**
   * Динамическое обнаружение шаблонов на диске через template.json
   */
  public discoverDiskTemplates(): void {
    try {
      if (!fs.existsSync(templateDir)) {
        logger.warn({ templateDir }, "Template directory does not exist");
        return;
      }

      const entries = fs.readdirSync(templateDir);
      for (const entry of entries) {
        const fullPath = path.join(templateDir, entry);
        if (!fs.statSync(fullPath).isDirectory()) continue;

        const manifestPath = path.join(fullPath, "template.json");
        if (fs.existsSync(manifestPath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            const parsed = TemplateManifestSchema.parse(raw);

            const styleConfig: StyleConfig = {
              key: parsed.id,
              name: parsed.name,
              coverTemplate: `${entry}/${parsed.cover.replace(/\.html$/, "")}`,
              cardTemplate: `${entry}/${parsed.card.replace(/\.html$/, "")}`,
              defaultCoverBadge: parsed.defaultCoverBadge,
              defaultCardBadge: parsed.defaultCardBadge,
              bulletFormat: parsed.bulletFormat,
              brand: parsed.brand,
            };

            this.registerTemplate(styleConfig, parsed.tenants);
            logger.info({ id: parsed.id, name: parsed.name }, "Discovered dynamic template manifest");
          } catch (err) {
            logger.error({ entry, err }, "Failed to validate template.json manifest with Zod");
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "Error during disk template discovery");
    }
  }

  public registerTemplate(style: StyleConfig, tenants: string[]): void {
    this.templates.set(style.key, style);
    for (const tenant of tenants) {
      const list = this.tenantMap.get(tenant) ?? [];
      if (!list.includes(style.key)) {
        list.push(style.key);
      }
      this.tenantMap.set(tenant, list);
    }
  }

  public getTemplate(key: string): StyleConfig | undefined {
    // 1. Check registered dynamic templates
    if (this.templates.has(key)) {
      return this.templates.get(key);
    }
    // 2. Check static dev styles
    const devMatch = SOFTWARE_DEV_STYLES.find((s) => s.key === key);
    if (devMatch) return devMatch;
    // 3. Check cinema styles
    const cinemaMatch = CINEMA_MEDIA_STYLES.find((s) => s.key === key);
    if (cinemaMatch) return cinemaMatch;

    return undefined;
  }

  public resolveStylesForTenant(
    tenantId: string | undefined,
    industryProfile: IndustryProfile | undefined
  ): StyleConfig[] {
    const templateSetId = industryProfile?.brandGuidelines?.templateSetId;

    if (tenantId === "testo" || templateSetId === "industrial-measurement-equipment") {
      const keys = this.tenantMap.get("testo") ?? [];
      const styles = keys.map((k) => this.templates.get(k)!).filter(Boolean);
      if (styles.length > 0) return styles;
    }

    if (tenantId === "cinema-media" || templateSetId === "cinema-media" || templateSetId === "cinema-dark-neon") {
      return CINEMA_MEDIA_STYLES;
    }

    if (templateSetId && this.templates.has(templateSetId)) {
      return [this.templates.get(templateSetId)!];
    }

    return SOFTWARE_DEV_STYLES;
  }

  public getAllTemplates(): StyleConfig[] {
    const dynamicList = Array.from(this.templates.values());
    const staticDev = SOFTWARE_DEV_STYLES.filter((s) => !this.templates.has(s.key));
    const staticCinema = CINEMA_MEDIA_STYLES.filter((s) => !this.templates.has(s.key));
    return [...dynamicList, ...staticDev, ...staticCinema];
  }
}

export const templateRegistry = new TemplateRegistry();
