import type { ObjectId } from "mongodb";
import type { PipelineRunStatus, PipelineStage } from "../types/pipeline.js";
import type { Organization, IndustryProfile } from "../schemas/organization.js";

/**
 * Один документ = один прогон пайплайна для одной отобранной темы.
 * Open Claw создаёт его при старте и обновляет по мере прохождения стадий.
 */
export interface PipelineRunDoc {
  _id?: ObjectId;
  runId: string; // дублируем как строку для удобных индексов/job.data
  status: PipelineRunStatus;
  currentStage: PipelineStage;
  topic: {
    title: string;
    summary: string;
  };
  profileId?: string;
  // Мультиарендность: с какой Organization/IndustryProfile связан прогон.
  // Опционально на переходный период — существующие записи tech-портала без tenantId
  // трактуются как "software-development-default" на уровне бизнес-логики оркестратора.
  tenantId?: string;
  targetPlatform?: "linkedin" | "instagram";
  contentFormat?: "carousel" | "reel-script" | "story" | "single-image";
  contentPillarId?: string;
  retries: Record<string, number>; // stage -> кол-во повторов
  createdAt: Date;
  updatedAt: Date;
  failedReason?: string;
  seoImprovementsCount?: number;
  needsComplianceReview?: boolean;
  adaptations?: {
    telegram?: PlatformAdaptation;
    threads?: PlatformAdaptation;
  };
}

export interface PlatformAdaptation {
  text: string;
  hook?: string;
  hashtags?: string[];
  length: "short" | "long";
  alignmentScore?: number;
  evaluatedAt?: Date;
}

export interface GoldenEvaluationDoc {
  _id?: ObjectId;
  runId: string;
  platform: "linkedin" | "telegram" | "threads";
  alignmentScore: number; // 0..100
  driftReport: {
    rule: string;
    passed: boolean;
    details: string;
  }[];
  evaluatedAt: Date;
}

/** Результат каждой стадии хранится отдельным документом — удобно для аудита и Learning Agent в будущем. */
export interface StageResultDoc {
  _id?: ObjectId;
  runId: string;
  stage: PipelineStage;
  attempt: number;
  result: unknown;
  createdAt: Date;
}

/** Документ Organization в MongoDB (см. schemas/organization.ts для Zod-валидации при записи). */
export interface OrganizationDoc extends Organization {
  _id?: ObjectId;
}

/** Документ IndustryProfile в MongoDB (см. schemas/organization.ts для Zod-валидации при записи). */
export interface IndustryProfileDoc extends IndustryProfile {
  _id?: ObjectId;
}

export type UserRole = "admin" | "creator";

/** Пользователь дашборда — привязан строго к одному tenant (порталу). Базовая авторизация. */
export interface UserDoc {
  _id?: ObjectId;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}

/**
 * Фрагмент проверенного факта (например строка из спецификации прибора) для RAG-слоя.
 * Используется agent-writing для регулируемых ниш (complianceConfig.factCheckRequired === true),
 * чтобы модель цитировала числа ИЗ этой базы, а не "додумывала" их.
 * См. shared-lib/src/ai/retrieval.ts.
 */
export interface FactChunkDoc {
  _id?: ObjectId;
  tenantId: string;
  productName: string; // например "testo 400" — ссылка на конкретное изделие/тему
  sourceLabel: string; // человекочитаемый источник, например "Официальный datasheet testo 400, стр. 2"
  content: string; // сам текст факта, короткий и самодостаточный
  createdAt: Date;
}

export interface DesignTemplateDoc {
  _id?: ObjectId;
  tenantId: string;
  name: string;
  type: "cover" | "card";
  pillarId: string; // e.g. "github-trending-repos" | "pet-projects-showcase" | "tech-trends-insights" | "all"
  htmlTemplate: string;
  cssContent?: string;
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
