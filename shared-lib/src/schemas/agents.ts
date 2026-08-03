import { z } from "zod";

/**
 * Схемы повторяют JSON-структуры результатов агентов из ТЗ.
 * Используются и для рантайм-валидации (на входе/выходе агента),
 * и как источник TypeScript-типов через z.infer.
 */

// ---------- Trend Intelligence Agent ----------

export const TrendItemSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  score: z.number().min(0).max(100),
  keywords: z.array(z.string()).default([]),
  sources: z.array(z.string().url()).default([]),
  published_at: z.string().datetime().optional(),
});
export type TrendItem = z.infer<typeof TrendItemSchema>;

export const TrendAgentOutputSchema = z.object({
  items: z.array(TrendItemSchema).min(1),
});
export type TrendAgentOutput = z.infer<typeof TrendAgentOutputSchema>;

// ---------- Positioning Agent ----------

export const PositioningOutputSchema = z.object({
  relevance: z.number().min(0).max(100),
  reason: z.string().min(1),
  accepted: z.boolean(),
});
export type PositioningOutput = z.infer<typeof PositioningOutputSchema>;

// ---------- Content Strategy Agent ----------

export const ContentFormat = z.enum([
  "story",
  "tutorial",
  "opinion",
  "checklist",
  "case_study",
  "comparison",
  "lessons_learned",
  "mistakes",
  "thread",
  "personal_experience",
]);
export type ContentFormat = z.infer<typeof ContentFormat>;

export const StrategyOutputSchema = z.object({
  format: ContentFormat,
  target_audience: z.string().min(1),
  core_idea: z.string().min(1),
  // Мультиарендность: ссылка на выбранную рубрику (IndustryProfile.contentPillars[].id), если применимо.
  content_pillar_id: z.string().optional(),
});
export type StrategyOutput = z.infer<typeof StrategyOutputSchema>;

// ---------- Writing Agent ----------

export const WritingOutputSchema = z.object({
  text: z.string().min(1),
  hook: z.string().min(1),
  cta: z.string().min(1),
});
export type WritingOutput = z.infer<typeof WritingOutputSchema>;

// ---------- Design Agent ----------

export const DesignTemplateType = z.enum(["html", "svg", "figma_json", "canva", "pptx"]);

export const DesignOutputSchema = z.object({
  template_type: DesignTemplateType,
  card_count: z.number().int().min(1),
  accent_color: z.string(),
  template_name: z.string().optional(),
  render_data: z.record(z.string(), z.unknown()),
  preview_cover_1_id: z.string().optional(),
  preview_cover_2_id: z.string().optional(),
  zip_cover_1_id: z.string().optional(),
  zip_cover_2_id: z.string().optional(),
});
export type DesignOutput = z.infer<typeof DesignOutputSchema>;

// ---------- SEO Agent ----------

export const SeoOutputSchema = z.object({
  score: z.number().min(0).max(100),
  recommendations: z.array(z.string()).default([]),
});
export type SeoOutput = z.infer<typeof SeoOutputSchema>;

// ---------- Author profile (вход для Positioning/Writing) ----------

/**
 * Подключённый аккаунт соцсети для автора. Платформа выбирается per-tenant
 * (Organization.publishingTargets), поэтому у автора может не быть LinkedIn вовсе (например Testo).
 */
export const ConnectedPlatformSchema = z.object({
  platform: z.enum(["linkedin", "instagram"]),
  accountId: z.string().min(1),
  accessToken: z.string().min(1), // хранить зашифрованным на уровне приложения/БД
  connectedAt: z.date().default(() => new Date()),
});
export type ConnectedPlatform = z.infer<typeof ConnectedPlatformSchema>;

export const AuthorProfileSchema = z.object({
  // Дефолт обеспечивает обратную совместимость с профилями, созданными до внедрения мультиарендности.
  tenantId: z.string().min(1).default("software-development-default"),
  topics: z.array(z.string()).min(1),
  forbidden_words: z.array(z.string()).default([]),
  cta_style: z.string().optional(),
  use_emoji: z.boolean().default(false),
  tone: z.string().optional(),
  connectedPlatforms: z.array(ConnectedPlatformSchema).default([]),
});
export type AuthorProfile = z.infer<typeof AuthorProfileSchema>;
