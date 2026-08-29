import { z } from "zod";

/**
 * Организация (tenant) — верхнеуровневая сущность мультиарендности.
 * Каждый клиент платформы (например tech-портал или Testo-портал) — это одна Organization.
 * См. TZ_vertical_agnostic_b2b_saas.md и TZ_v3_instagram_testo_portal.md.
 */

export const PublishingPlatform = z.enum(["linkedin", "instagram", "telegram", "threads"]);
export type PublishingPlatform = z.infer<typeof PublishingPlatform>;

export const OrganizationSchema = z.object({
  tenantId: z.string().min(1), // человекочитаемый слаг, например "testo" или "software-dev-default"
  name: z.string().min(1),

  // Платформы публикации для этого tenant — НЕ кросспостинг, а выбор основной цели (см. TZ v3, раздел 0).
  publishingTargets: z.array(PublishingPlatform).min(1),

  // Опциональные собственные API-ключи клиента (для собственных лимитов LLM).
  apiKeyOpenRouter: z.string().optional(),
  apiKeyGroq: z.string().optional(),

  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});
export type Organization = z.infer<typeof OrganizationSchema>;

// ---------- Источники трендов (SourceAdapter config) ----------

export const TrendSourceType = z.enum(["rss", "api", "scrape", "youtube", "custom"]);

export const TrendSourceConfigSchema = z.object({
  type: TrendSourceType,
  url: z.string().min(1),
  label: z.string().min(1),
  weight: z.number().min(0).max(1).default(0.5),
});
export type TrendSourceConfig = z.infer<typeof TrendSourceConfigSchema>;

// ---------- Терминологический словарь ----------

export const GlossaryTermSchema = z.object({
  term: z.string().min(1),
  definition: z.string().optional(),
  synonyms: z.array(z.string()).default([]),
  doNotConfuseWith: z.array(z.string()).default([]),
});
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;

// ---------- Таксономия аудитории ----------

export const ToneOfVoice = z.enum(["formal", "semi-formal", "casual"]);

export const AudiencePersonaSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  painPoints: z.array(z.string()).default([]),
  toneOfVoice: ToneOfVoice.default("semi-formal"),
});
export type AudiencePersona = z.infer<typeof AudiencePersonaSchema>;

// ---------- Настройки тона и форматирования ----------

export const HashtagStrategy = z.enum(["aggressive", "moderate", "minimal", "none"]);
export const FormalityLevel = z.enum(["strict", "balanced", "relaxed"]);

export const ContentStyleRulesSchema = z.object({
  maxEmojis: z.number().int().min(0).default(2),
  hashtagStrategy: HashtagStrategy.default("moderate"),
  formalityLevel: FormalityLevel.default("balanced"),
  forbiddenPhrases: z.array(z.string()).default([]),
  requiredDisclaimers: z.array(z.string()).default([]),
});
export type ContentStyleRules = z.infer<typeof ContentStyleRulesSchema>;

// ---------- Бренд-гайдлайны и дизайн ----------

export const BrandGuidelinesSchema = z.object({
  logoUrl: z.string().optional(),
  colorPalette: z.array(z.string()).default([]), // HEX-коды
  fontPrimary: z.string().optional(),
  fontSecondary: z.string().optional(),
  templateSetId: z.string().min(1), // например "software-development" или "industrial-measurement-equipment"
});
export type BrandGuidelines = z.infer<typeof BrandGuidelinesSchema>;

// ---------- Compliance / фактологическая строгость ----------

export const FactSourceType = z.enum(["internal-db", "s3-specsheets", "none"]);

export const ComplianceConfigSchema = z.object({
  factCheckRequired: z.boolean().default(false),
  factSourceType: FactSourceType.default("none"),
  factSourceRef: z.string().optional(),
  regulatedIndustry: z.boolean().default(false),
});
export type ComplianceConfig = z.infer<typeof ComplianceConfigSchema>;

// ---------- Платформо-специфичная адаптация контента ----------

export const ContentFormatType = z.enum(["carousel", "reel-script", "story", "single-image"]);

export const PlatformAdaptationSchema = z.object({
  platform: PublishingPlatform,
  maxCaptionLength: z.number().int().min(1).default(500),
  preferredFormats: z.array(ContentFormatType).min(1),
  visualEmphasis: z.enum(["text-heavy", "visual-heavy"]).default("visual-heavy"),
  hashtagCount: z.number().int().min(0).default(8),
  ctaStyle: z.enum(["soft", "direct"]).default("soft"),
});
export type PlatformAdaptation = z.infer<typeof PlatformAdaptationSchema>;

// ---------- Рубрики контента (Content Pillars) ----------

export const ContentPillarSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  weight: z.number().min(0).max(1).default(0.5),
  seasonalTrigger: z.string().optional(),
  preferredFormat: ContentFormatType,
});
export type ContentPillar = z.infer<typeof ContentPillarSchema>;

// ---------- Настройки валидации терминологии ----------

export const TerminologyRulesSchema = z.object({
  mandatoryTerms: z.record(z.string(), z.array(z.string())).default({}),
  forbiddenTerms: z.array(z.string()).default([]),
  preferredReplacements: z.record(z.string(), z.string()).default({}),
});
export type TerminologyRules = z.infer<typeof TerminologyRulesSchema>;

// ---------- IndustryProfile: главная сущность отраслевой конфигурации ----------

export const IndustryProfileSchema = z.object({
  tenantId: z.string().min(1), // ссылка на Organization.tenantId
  verticalName: z.string().min(1), // например "industrial-measurement-equipment" или "software-development"
  language: z.array(z.string().min(2)).min(1).default(["en"]),

  trendSources: z.array(TrendSourceConfigSchema).default([]),
  glossary: z.array(GlossaryTermSchema).default([]),
  terminologyRules: TerminologyRulesSchema.default({}),
  audiencePersonas: z.array(AudiencePersonaSchema).default([]),
  contentStyleRules: ContentStyleRulesSchema.default({}),
  brandGuidelines: BrandGuidelinesSchema,
  complianceConfig: ComplianceConfigSchema.default({}),
  platformAdaptation: z.array(PlatformAdaptationSchema).default([]),
  contentPillars: z.array(ContentPillarSchema).default([]),

  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});
export type IndustryProfile = z.infer<typeof IndustryProfileSchema>;

/**
 * Дефолтный IndustryProfile для существующего tech-портала — обеспечивает
 * обратную совместимость (Coexistence Policy из TZ v3) при внедрении мультиарендности.
 * Источники ниже — ровно то, что сейчас захардкожено в agent-trend-intelligence/src/aggregator.ts.
 */
export const DEFAULT_SOFTWARE_DEV_INDUSTRY_PROFILE: Omit<IndustryProfile, "createdAt" | "updatedAt"> = {
  tenantId: "software-development-default",
  verticalName: "software-development",
  language: ["en"],
  trendSources: [
    { type: "rss", url: "https://feeds.arstechnica.com/arstechnica/index", label: "Ars Technica (Tech & Systems)", weight: 1.0 },
    { type: "rss", url: "https://feed.infoq.com/", label: "InfoQ (Software Architecture & Cloud)", weight: 1.0 },
    { type: "rss", url: "https://techcrunch.com/feed/", label: "TechCrunch (Startups & AI)", weight: 0.9 },
    { type: "rss", url: "https://venturebeat.com/feed/", label: "VentureBeat (Enterprise AI & ML)", weight: 0.9 },
    { type: "rss", url: "https://dev.to/feed", label: "Dev.to (Engineering & Tutorials)", weight: 0.9 },
    { type: "rss", url: "https://news.ycombinator.com/rss", label: "Hacker News Top Stories", weight: 0.9 },
    { type: "custom", url: "https://t.me/s/github", label: "Telegram @github (Trending Repos)", weight: 1.0 },
  ],
  glossary: [],
  terminologyRules: {
    mandatoryTerms: {},
    forbiddenTerms: [],
    preferredReplacements: {},
  },
  audiencePersonas: [
    { id: "junior", label: "Junior Developer", description: "Начинающий разработчик", painPoints: [], toneOfVoice: "casual" },
    { id: "middle", label: "Middle Developer", description: "Разработчик среднего уровня", painPoints: [], toneOfVoice: "semi-formal" },
    { id: "senior", label: "Senior Developer", description: "Опытный разработчик/тех.лид", painPoints: [], toneOfVoice: "semi-formal" },
  ],
  contentStyleRules: {
    maxEmojis: 3,
    hashtagStrategy: "moderate",
    formalityLevel: "relaxed",
    forbiddenPhrases: [],
    requiredDisclaimers: [],
  },
  brandGuidelines: {
    colorPalette: [],
    templateSetId: "software-development",
  },
  complianceConfig: {
    factCheckRequired: false,
    factSourceType: "none",
    regulatedIndustry: false,
  },
  platformAdaptation: [
    {
      platform: "linkedin",
      maxCaptionLength: 1300,
      preferredFormats: ["carousel"],
      visualEmphasis: "text-heavy",
      hashtagCount: 4,
      ctaStyle: "direct",
    },
  ],
  contentPillars: [
    {
      id: "pet-projects-showcase",
      label: "Подборка pet проектов для твоего github",
      description: "Идеи и готовые архитектуры pet-проектов для портфолио разработчика с готовым стеком и ссылками",
      weight: 0.9,
      preferredFormat: "carousel",
    },
    {
      id: "github-trending-repos",
      label: "Подборка github репозитории",
      description: "Подборка самых полезных и набирающих популярность open-source репозиториев и утилит на GitHub",
      weight: 0.9,
      preferredFormat: "carousel",
    },
    {
      id: "tech-trends-insights",
      label: "Тренды и архитектура в Software Engineering",
      description: "Разбор архитектурных паттернов, трендов веб-разработки, backend и AI инженерии",
      weight: 0.8,
      preferredFormat: "carousel",
    },
    {
      id: "tech-discussions-debates",
      label: "Обсуждения и споры вокруг технологий",
      description: "Горячие дискуссии, баттлы архитектурных подходов, плюсы и минусы техстеков и спорные решения",
      weight: 0.85,
      preferredFormat: "carousel",
    },
  ],
};
