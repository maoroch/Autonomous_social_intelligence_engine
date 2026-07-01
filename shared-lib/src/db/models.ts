import type { ObjectId } from "mongodb";
import type { PipelineRunStatus, PipelineStage } from "../types/pipeline.js";

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
  retries: Record<string, number>; // stage -> кол-во повторов
  createdAt: Date;
  updatedAt: Date;
  failedReason?: string;
  seoImprovementsCount?: number;
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
