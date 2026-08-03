import { Router } from "express";
import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc } from "@pipeline/shared/db";
import { PipelineRunStatus, PipelineStage, QueueName, type AgentJob } from "@pipeline/shared";
import type { Logger } from "@pipeline/shared/logger";
import { createQueue } from "@pipeline/shared/queue";
import type { AgentQueues } from "../pipeline/runner.js";

/**
 * Роуты, которые дёргает Next.js dashboard для Human Approval flow.
 */
export function createApprovalRouter(logger: Logger): Router {
  const publishingQueue = createQueue(QueueName.PUBLISHING, process.env.REDIS_URL ?? "redis://localhost:6379");
  const router = Router();
  const runs = () => getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const stageResults = () => getCollection<StageResultDoc>(Collections.STAGE_RESULTS);

  /**
   * Проверяет, что запрошенный run принадлежит указанному tenantId (изоляция данных между порталами).
   * Если у run вообще не задан tenantId (легаси-прогоны tech-портала до внедрения мультиарендности) —
   * пропускаем без строгой проверки, чтобы не сломать существующие данные.
   */
  function assertTenantOwnership(run: PipelineRunDoc, requestedTenantId: string | undefined): boolean {
    if (!run.tenantId) return true;
    return run.tenantId === requestedTenantId;
  }

  // Список прогонов, ожидающих подтверждения.
  router.get("/runs", async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    // Изоляция данных между порталами: без tenantId в запросе НИЧЕГО не возвращаем,
    // чтобы дашборд одного клиента не мог случайно увидеть прогоны другого (см. запрос "отдельные порталы").
    if (tenantId) {
      filter.tenantId = tenantId;
    } else {
      return res.json({ items: [] });
    }
    const items = await runs().find(filter as Partial<PipelineRunDoc>).sort({ updatedAt: -1 }).limit(50).toArray();
    res.json({ items });
  });

  // Полная карточка прогона: сам run + все результаты стадий.
  router.get("/runs/:runId", async (req, res) => {
    const run = await runs().findOne({ runId: req.params.runId });
    if (!run) return res.status(404).json({ error: "run not found" });

    const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
    if (!assertTenantOwnership(run, tenantId)) {
      // 404, а не 403 — не подтверждаем даже факт существования чужого run.
      return res.status(404).json({ error: "run not found" });
    }

    const stages = await stageResults().find({ runId: req.params.runId }).sort({ createdAt: 1 }).toArray();
    res.json({ run, stages });
  });

  router.post("/runs/:runId/approve", async (req, res) => {
    const runId = req.params.runId;
    const requestedTenantId = req.body?.tenantId as string | undefined;

    const existingRun = await runs().findOne({ runId });
    if (!existingRun) return res.status(404).json({ error: "run not found" });
    if (!assertTenantOwnership(existingRun, requestedTenantId)) {
      return res.status(404).json({ error: "run not found" });
    }

    const result = await runs().updateOne(
      { runId, status: PipelineRunStatus.AWAITING_APPROVAL },
      { $set: { status: PipelineRunStatus.APPROVED, currentStage: PipelineStage.PUBLISHING, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      return res.status(409).json({ error: "run not awaiting approval" });
    }
    logger.info({ runId }, "run approved by human");

    // Fetch results to pass to publisher
    const stages = await stageResults().find({ runId }).sort({ createdAt: -1 }).toArray();
    const writingStage = stages.find(s => s.stage === PipelineStage.WRITING);
    const designStage = stages.find(s => s.stage === PipelineStage.DESIGN);

    const designResult = designStage?.result as any;
    const selectedTemplate = req.body?.template_name || designResult?.template_name || "cover-2";
    const imageId =
      selectedTemplate === "cover-1"
        ? designResult?.zip_cover_1_id ?? designResult?.imageId
        : selectedTemplate === "cover-2"
          ? designResult?.zip_cover_2_id ?? designResult?.imageId
          : designResult?.imageId; // нишевые вертикали с одним template-set (например Testo)

    // Save chosen template selection to database
    await stageResults().updateOne(
      { runId, stage: PipelineStage.DESIGN },
      { $set: { "result.template_name": selectedTemplate, "result.imageId": imageId } }
    );

    const payload = {
      text: (writingStage?.result as any)?.text,
      imageId,
      template_name: selectedTemplate,
    };

    await publishingQueue.add(PipelineStage.PUBLISHING, {
      runId,
      stage: PipelineStage.PUBLISHING,
      attempt: 1,
      payload
    });

    res.json({ ok: true });
  });

  router.post("/runs/:runId/reject", async (req, res) => {
    const runId = req.params.runId;
    const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;

    const existingRun = await runs().findOne({ runId });
    if (!existingRun) return res.status(404).json({ error: "run not found" });
    if (!assertTenantOwnership(existingRun, tenantId)) {
      return res.status(404).json({ error: "run not found" });
    }

    const result = await runs().updateOne(
      { runId, status: PipelineRunStatus.AWAITING_APPROVAL },
      { $set: { status: PipelineRunStatus.REJECTED, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      return res.status(409).json({ error: "run not awaiting approval" });
    }
    logger.info({ runId: req.params.runId }, "run rejected by human");
    res.json({ ok: true });
  });

  router.put("/runs/:runId/edit", async (req, res) => {
    const { runId } = req.params;
    const { postText, slides, tenantId } = req.body;

    const existingRun = await runs().findOne({ runId });
    if (!existingRun) return res.status(404).json({ error: "run not found" });
    if (!assertTenantOwnership(existingRun, tenantId)) {
      return res.status(404).json({ error: "run not found" });
    }

    logger.info({ runId }, "received inline edits from human");

    if (postText) {
      await stageResults().updateOne(
        { runId, stage: "writing" },
        { $set: { "result.hook": postText.hook, "result.text": postText.text, "result.cta": postText.cta } }
      );
    }

    if (slides && Array.isArray(slides)) {
      const render_data: Record<string, any> = {};
      slides.forEach((slide: any) => {
        render_data[slide.key] = {
          key: slide.key,
          title: slide.title,
          bullets: slide.bullets,
          footer: slide.footer,
          illustration: slide.illustration
        };
      });
      await stageResults().updateOne(
        { runId, stage: "design" },
        { $set: { "result.render_data": render_data } }
      );

      // Trigger re-rendering of the design agent by queuing a design job
      try {
        const designQueue = createQueue<AgentJob>(QueueName.DESIGN, process.env.REDIS_URL ?? "redis://localhost:6379");
        await designQueue.add(PipelineStage.DESIGN, {
          runId,
          stage: PipelineStage.DESIGN,
          attempt: 1,
          payload: {},
        });
        logger.info({ runId }, "queued design re-rendering for inline edits");
      } catch (err) {
        logger.error({ err, runId }, "failed to queue design re-rendering");
      }
    }

    res.json({ ok: true });
  });

  router.post("/runs/:runId/reprocess", async (req, res) => {
    const { runId } = req.params;
    const { notes, tenantId } = req.body;

    logger.info({ runId, notes }, "requested manual reprocess of run");

    try {
      const run = await runs().findOne({ runId });
      if (!run) {
        return res.status(404).json({ error: "run not found" });
      }
      if (!assertTenantOwnership(run, tenantId)) {
        return res.status(404).json({ error: "run not found" });
      }

      // We cycle back to WRITING stage with user notes in extraInstructions
      // Get the existing strategy stage result to feed into WRITING as input payload
      const strategyDoc = await stageResults().findOne({ runId, stage: PipelineStage.STRATEGY });
      const strategyResult = (strategyDoc?.result as Record<string, unknown>) ?? {};

      // Reset the run status to running, set currentStage to writing
      await runs().updateOne(
        { runId },
        {
          $set: {
            status: PipelineRunStatus.RUNNING,
            currentStage: PipelineStage.WRITING,
            updatedAt: new Date(),
          }
        }
      );

      // We recreate the queues structure locally
      const queues: AgentQueues = {
        [PipelineStage.TREND]: createQueue<AgentJob>(QueueName.TREND, process.env.REDIS_URL ?? "redis://localhost:6379"),
        [PipelineStage.POSITIONING]: createQueue<AgentJob>(QueueName.POSITIONING, process.env.REDIS_URL ?? "redis://localhost:6379"),
        [PipelineStage.STRATEGY]: createQueue<AgentJob>(QueueName.STRATEGY, process.env.REDIS_URL ?? "redis://localhost:6379"),
        [PipelineStage.WRITING]: createQueue<AgentJob>(QueueName.WRITING, process.env.REDIS_URL ?? "redis://localhost:6379"),
        [PipelineStage.DESIGN]: createQueue<AgentJob>(QueueName.DESIGN, process.env.REDIS_URL ?? "redis://localhost:6379"),
        [PipelineStage.SEO]: createQueue<AgentJob>(QueueName.SEO, process.env.REDIS_URL ?? "redis://localhost:6379"),
      };

      const extraInstructions = notes ? `Инструкции от пользователя по переделке: ${notes}` : "Пользователь попросил переделать публикацию.";

      // Delete stage results from writing onwards so they are regenerated
      await stageResults().deleteMany({
        runId,
        stage: { $in: [PipelineStage.WRITING, PipelineStage.DESIGN, PipelineStage.SEO] }
      });

      const { enqueueStage } = await import("../pipeline/runner.js");
      await enqueueStage(queues, runId, PipelineStage.WRITING, strategyResult, extraInstructions);

      logger.info({ runId }, "successfully cycled run back to WRITING stage for manual reprocess");
      res.json({ ok: true });
    } catch (err: any) {
      logger.error({ err, runId }, "failed to cycle run back for reprocess");
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
