/**
 * Единственный источник правды для названий стадий пайплайна и очередей BullMQ.
 * Любой сервис (Open Claw или агент) импортирует имена очередей отсюда —
 * это исключает рассинхрон строковых литералов между сервисами.
 */

export const PipelineStage = {
  TREND: "trend",
  POSITIONING: "positioning",
  STRATEGY: "strategy",
  WRITING: "writing",
  DESIGN: "design",
  SEO: "seo",
  HUMAN_APPROVAL: "human_approval",
  PUBLISHING: "publishing",
} as const;

export type PipelineStage = (typeof PipelineStage)[keyof typeof PipelineStage];

/**
 * Порядок стадий в пайплайне. Open Claw использует этот массив,
 * чтобы определить следующий шаг после успешного завершения текущего.
 */
export const PIPELINE_ORDER: PipelineStage[] = [
  PipelineStage.TREND,
  PipelineStage.POSITIONING,
  PipelineStage.STRATEGY,
  PipelineStage.WRITING,
  PipelineStage.DESIGN,
  PipelineStage.SEO,
  PipelineStage.HUMAN_APPROVAL,
  PipelineStage.PUBLISHING,
];

/**
 * Имена очередей BullMQ. Один агент = одна очередь задач.
 * Дополнительно есть служебная очередь pipeline-events, в которую
 * каждый агент кладёт job по завершении — Open Claw её слушает.
 */
export const QueueName = {
  TREND: "queue-agent-trend",
  POSITIONING: "queue-agent-positioning",
  STRATEGY: "queue-agent-strategy",
  WRITING: "queue-agent-writing",
  DESIGN: "queue-agent-design",
  SEO: "queue-agent-seo",
  PIPELINE_EVENTS: "queue-pipeline-events",
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

/** Маппинг стадии пайплайна на очередь, в которую Open Claw кладёт job. */
export const STAGE_TO_QUEUE: Partial<Record<PipelineStage, QueueName>> = {
  [PipelineStage.TREND]: QueueName.TREND,
  [PipelineStage.POSITIONING]: QueueName.POSITIONING,
  [PipelineStage.STRATEGY]: QueueName.STRATEGY,
  [PipelineStage.WRITING]: QueueName.WRITING,
  [PipelineStage.DESIGN]: QueueName.DESIGN,
  [PipelineStage.SEO]: QueueName.SEO,
};

export const JobStatus = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  RETRYING: "retrying",
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const PipelineRunStatus = {
  RUNNING: "running",
  AWAITING_APPROVAL: "awaiting_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
  PUBLISHED: "published",
  FAILED: "failed",
} as const;

export type PipelineRunStatus = (typeof PipelineRunStatus)[keyof typeof PipelineRunStatus];
