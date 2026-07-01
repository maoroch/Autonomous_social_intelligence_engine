import { Router } from "express";
import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc } from "@pipeline/shared/db";
import { PipelineRunStatus } from "@pipeline/shared";
import type { Logger } from "@pipeline/shared/logger";

/**
 * Роуты, которые дёргает Next.js dashboard для Human Approval flow.
 * Реальная публикация (Publishing Agent) реализуется на следующем шаге —
 * пока approve просто переводит статус прогона в APPROVED.
 */
export function createApprovalRouter(logger: Logger): Router {
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
    const result = await runs().updateOne(
      { runId: req.params.runId, status: PipelineRunStatus.AWAITING_APPROVAL },
      { $set: { status: PipelineRunStatus.APPROVED, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      return res.status(409).json({ error: "run not awaiting approval" });
    }
    logger.info({ runId: req.params.runId }, "run approved by human");
    // TODO: на следующем шаге — постановка job в Publishing Agent.
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
          title: slide.title,
          bullets: slide.bullets,
          footer: slide.footer
        };
      });
      await stageResults().updateOne(
        { runId, stage: "design" },
        { $set: { "result.render_data": render_data } }
      );
    }

    res.json({ ok: true });
  });

  return router;
}
