import { z } from "zod";

/**
 * Универсальный конверт job'а, который Open Claw кладёт в очередь любого агента.
 * `payload` — произвольные входные данные конкретного агента (валидируются им самим
 * по своей входной схеме), `runId` связывает job с записью PipelineRun в Mongo.
 */
export const AgentJobSchema = z.object({
  runId: z.string().min(1),
  stage: z.string().min(1),
  attempt: z.number().int().min(1).default(1),
  payload: z.record(z.string(), z.unknown()),
  extraInstructions: z.string().optional(), // доп. инструкции от Open Claw при ретрае
});
export type AgentJob = z.infer<typeof AgentJobSchema>;

/**
 * Событие, которое агент кладёт в очередь pipeline:events по завершении работы
 * (успешной или нет). Open Claw слушает эту очередь и решает, что делать дальше.
 */
export const PipelineEventSchema = z.object({
  runId: z.string().min(1),
  stage: z.string().min(1),
  status: z.enum(["completed", "failed"]),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});
export type PipelineEvent = z.infer<typeof PipelineEventSchema>;
