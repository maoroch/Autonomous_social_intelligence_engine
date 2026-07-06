import { Router } from "express";
import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc } from "@pipeline/shared/db";
import { PipelineRunStatus, PipelineStage, QueueName, type AgentJob } from "@pipeline/shared";
import type { Logger } from "@pipeline/shared/logger";
import { createQueue } from "@pipeline/shared/queue";

/**
 * Роуты, которые дёргает Next.js dashboard для Human Approval flow.
 */
export function createApprovalRouter(logger: Logger): Router {
  const publishingQueue = createQueue(QueueName.PUBLISHING, process.env.REDIS_URL ?? "redis://localhost:6379");
  const router = Router();
  const runs = () => getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
  const stageResults = () => getCollection<StageResultDoc>(Collections.STAGE_RESULTS);

  // Список прогонов, ожидающих подтверждения.
  router.get("/runs", async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const filter = status ? { status: status as PipelineRunDoc["status"] } : {};
    const items = await runs().find(filter).sort({ updatedAt: -1 }).limit(50).toArray();
    res.json({ items });
  });

  // Полная карточка прогона: сам run + все результаты стадий.
  router.get("/runs/:runId", async (req, res) => {
    const run = await runs().findOne({ runId: req.params.runId });
    if (!run) return res.status(404).json({ error: "run not found" });

    const stages = await stageResults().find({ runId: req.params.runId }).sort({ createdAt: 1 }).toArray();
    res.json({ run, stages });
  });

  router.post("/runs/:runId/approve", async (req, res) => {
    const runId = req.params.runId;
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

    const selectedTemplate = req.body?.template_name || (designStage?.result as any)?.template_name || "cover-2";
    const imageId = selectedTemplate === "cover-1"
      ? ((designStage?.result as any)?.zip_cover_1_id || (designStage?.result as any)?.imageId)
      : ((designStage?.result as any)?.zip_cover_2_id || (designStage?.result as any)?.imageId);

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
    const result = await runs().updateOne(
      { runId: req.params.runId, status: PipelineRunStatus.AWAITING_APPROVAL },
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
    const { postText, slides } = req.body;

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

  return router;
}
