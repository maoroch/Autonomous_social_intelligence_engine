import { nanoid } from "nanoid";
import type { Queue } from "bullmq";
import {
  PIPELINE_ORDER,
  PipelineStage,
  PipelineRunStatus,
  STAGE_TO_QUEUE,
  type AgentJob,
} from "@pipeline/shared";
import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc } from "@pipeline/shared/db";
import type { Logger } from "@pipeline/shared/logger";

const MAX_RETRIES_PER_STAGE = Number(process.env.MAX_RETRIES_PER_STAGE ?? 2);

/**
 * Стадии, которые выполняются автоматизированными агентами через очереди.
 * HUMAN_APPROVAL и PUBLISHING обрабатываются отдельно (см. approval.ts /
 * будущий publishing-модуль) — здесь оркеструются только agent-стадии.
 */
const AGENT_STAGES: PipelineStage[] = [
  PipelineStage.TREND,
  PipelineStage.WRITING,
  PipelineStage.DESIGN,
];

export interface AgentQueues {
  [PipelineStage.TREND]: Queue<AgentJob>;
  [PipelineStage.WRITING]: Queue<AgentJob>;
  [PipelineStage.DESIGN]: Queue<AgentJob>;
}

function nextAgentStage(current: PipelineStage): PipelineStage | null {
  if (current === PipelineStage.TREND) return PipelineStage.WRITING;
  if (current === PipelineStage.WRITING) return PipelineStage.DESIGN;
  return null;
}

/** Создаёт новый прогон пайплайна для темы и сразу ставит первую задачу в очередь. */
export async function startPipelineRun(
  queues: AgentQueues,
  logger: Logger,
  initialTopic: { title: string; summary: string; url?: string; imageUrl?: string; fullArticleText?: string; batches?: string[] } = { title: "", summary: "" },
  profileId?: string,
  tenantId?: string,
  targetPillarId?: string,
  skipDesign?: boolean
): Promise<string> {
  const runId = nanoid();
  const now = new Date();
  const isManualTopic = !!(initialTopic && initialTopic.title && initialTopic.title.trim().length > 0);

  const isDirectWriting = isManualTopic || tenantId === "cinema-media";

  const run: any = {
    runId,
    status: PipelineRunStatus.RUNNING,
    currentStage: isDirectWriting ? PipelineStage.WRITING : PipelineStage.TREND,
    topic: initialTopic,
    profileId,
    tenantId,
    contentPillarId: targetPillarId,
    targetPillarId,
    skipDesign: !!skipDesign,
    retries: {},
    createdAt: now,
    updatedAt: now,
  };

  await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).insertOne(run);

  if (isDirectWriting) {
    // Для выбранной темы/статьи фиксируем этап TREND и сразу переходим в WRITING (без Positioning и Strategy)
    await getCollection<StageResultDoc>(Collections.STAGE_RESULTS).insertOne({
      runId,
      stage: PipelineStage.TREND,
      attempt: 1,
      result: {
        items: [
          {
            title: initialTopic.title,
            summary: initialTopic.summary,
            url: initialTopic.url,
            imageUrl: initialTopic.imageUrl,
            fullArticleText: initialTopic.fullArticleText,
            batches: initialTopic.batches,
            score: 100,
            keywords: [],
            sources: initialTopic.url ? [initialTopic.url] : [],
          },
        ],
      },
      createdAt: now,
    });

    await enqueueStage(queues, runId, PipelineStage.WRITING, {
      profileId,
      targetPillarId,
      batches: initialTopic.batches,
    });
    logger.info(
      { runId, tenantId, targetPillarId, topic: initialTopic.title },
      "direct grounded pipeline run started at WRITING stage (skipping Positioning & Strategy)"
    );
  } else {
    await enqueueStage(queues, runId, PipelineStage.TREND, { profileId, targetPillarId });
    logger.info({ runId, tenantId, targetPillarId }, "automated trend discovery pipeline run started");
  }

  return runId;
}

export async function enqueueStage(
  queues: AgentQueues,
  runId: string,
  stage: PipelineStage,
  payload: Record<string, unknown>,
  extraInstructions?: string,
): Promise<void> {
  const queueName = STAGE_TO_QUEUE[stage];
  if (!queueName) {
    throw new Error(`No queue mapped for stage "${stage}"`);
  }

  const runDoc = await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).findOne({ runId });
  const mergedPayload = {
    ...payload,
    targetPillarId: runDoc?.contentPillarId || (payload as any)?.targetPillarId,
  };

  const queue = queues[stage as keyof AgentQueues];
  const job: AgentJob = {
    runId,
    stage,
    attempt: 1,
    payload: mergedPayload,
    extraInstructions,
  };

  await queue.add(stage, job);
}

/**
 * Главный обработчик событий от агентов. Вызывается из QueueEvents-листенера
 * очереди PIPELINE_EVENTS в index.ts. Решает: двигаться дальше, ретраить
 * или останавливать прогон при критической ошибке.
 */
export async function handleAgentCompleted(
  queues: AgentQueues,
  logger: Logger,
  runId: string,
  stage: PipelineStage,
  result: Record<string, unknown>,
): Promise<void> {
  const runs = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const run = await runs.findOne({ runId });
  if (!run) {
    logger.warn({ runId }, "received event for unknown run");
    return;
  }

  const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);

  if (run.status === PipelineRunStatus.AWAITING_APPROVAL) {
    logger.info({ runId, stage }, "received completed event for manual edit re-rendering. Updating stage result.");
    await stageResultsCol.updateOne(
      { runId, stage },
      { $set: { result, updatedAt: new Date() } }
    );
    return;
  }

  // Check if this is a design re-rendering pass triggered by inline manual edit after SEO completion
  const seoStageDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.SEO });
  if (stage === PipelineStage.DESIGN && seoStageDoc) {
    logger.info({ runId, stage }, "received design re-rendering completed event. Restoring AWAITING_APPROVAL status.");
    await stageResultsCol.updateOne(
      { runId, stage: PipelineStage.DESIGN },
      { $set: { result, updatedAt: new Date() } }
    );
    await runs.updateOne(
      { runId },
      { $set: { status: PipelineRunStatus.AWAITING_APPROVAL, currentStage: PipelineStage.HUMAN_APPROVAL, updatedAt: new Date() } }
    );
    return;
  }

  await stageResultsCol.insertOne({
    runId,
    stage,
    attempt: run.retries?.[stage] ?? 1,
    result,
    createdAt: new Date(),
  });

  if (stage === PipelineStage.PUBLISHING) {
    logger.info({ runId }, "publishing completed successfully");
    return;
  }

  if (stage === PipelineStage.WRITING && (run as any).skipDesign) {
    // Explicit skipDesign -> advances directly to HUMAN_APPROVAL
    await runs.updateOne(
      { runId },
      {
        $set: {
          status: PipelineRunStatus.AWAITING_APPROVAL,
          currentStage: PipelineStage.HUMAN_APPROVAL,
          updatedAt: new Date(),
        },
      },
    );
    logger.info({ runId }, "skipDesign active: advanced directly to human approval stage");
    return;
  }

  const next = nextAgentStage(stage);

  if (!next) {
    // Прошли все agent-стадии (последняя — DESIGN) -> ждём ручного подтверждения.
    await runs.updateOne(
      { runId },
      {
        $set: {
          status: PipelineRunStatus.AWAITING_APPROVAL,
          currentStage: PipelineStage.HUMAN_APPROVAL,
          updatedAt: new Date(),
        },
      },
    );
    logger.info({ runId }, "pipeline reached human approval stage");
    return;
  }

  await runs.updateOne({ runId }, { $set: { currentStage: next, updatedAt: new Date() } });
  await enqueueStage(queues, runId, next, result);
  logger.info({ runId, from: stage, to: next }, "advanced to next stage");
}

export async function handleAgentFailed(
  queues: AgentQueues,
  logger: Logger,
  runId: string,
  stage: PipelineStage,
  errorMessage: string,
): Promise<void> {
  const runs = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const run = await runs.findOne({ runId });
  if (!run) {
    logger.warn({ runId }, "received failure event for unknown run");
    return;
  }

  if (stage === PipelineStage.PUBLISHING) {
    await runs.updateOne(
      { runId },
      {
        $set: {
          status: PipelineRunStatus.FAILED,
          failedReason: `Publishing failed: ${errorMessage}`,
          updatedAt: new Date(),
        },
      },
    );
    logger.error({ runId, errorMessage }, "publishing failed");
    return;
  }

  const attempts = (run.retries[stage] ?? 0) + 1;

  if (attempts > MAX_RETRIES_PER_STAGE) {
    await runs.updateOne(
      { runId },
      {
        $set: {
          status: PipelineRunStatus.FAILED,
          failedReason: `Stage "${stage}" failed after ${attempts} attempts: ${errorMessage}`,
          updatedAt: new Date(),
        },
      },
    );
    logger.error({ runId, stage, attempts }, "pipeline run failed: max retries exceeded");
    return;
  }

  await runs.updateOne(
    { runId },
    { $set: { [`retries.${stage}`]: attempts, updatedAt: new Date() } },
  );

  const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);
  let retryPayload: Record<string, unknown> = {};

  if (stage === PipelineStage.POSITIONING) {
    const trendStageDoc = await stageResultsCol.findOne({ runId, stage: PipelineStage.TREND });
    if (trendStageDoc?.result) {
      retryPayload = trendStageDoc.result as Record<string, unknown>;
    }
  }

  const queue = queues[stage as keyof AgentQueues];
  const job: AgentJob = {
    runId,
    stage,
    attempt: attempts,
    payload: retryPayload,
    extraInstructions: `Предыдущая попытка завершилась ошибкой: ${errorMessage}. Попробуй ещё раз с учётом этого.`,
  };
  const backoffDelay = Math.pow(2, attempts - 1) * 2000 + Math.floor(Math.random() * 1000);
  await queue.add(stage, job, { delay: backoffDelay });
  logger.warn({ runId, stage, attempts, backoffDelay }, "retrying stage after failure with exponential backoff");
}
