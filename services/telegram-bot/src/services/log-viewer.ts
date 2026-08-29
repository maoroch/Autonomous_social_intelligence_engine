import { getCollection, Collections, type PipelineRunDoc, type StageResultDoc } from "@pipeline/shared/db";
import { PipelineStage, type PipelineEvent } from "@pipeline/shared";
import { createLogger } from "@pipeline/shared/logger";
import type { BotQueues } from "./test-runner.js";

const logger = createLogger("telegram-bot:log-viewer");

export class LogViewerService {
  /**
   * Получение детального журнала прогона по runId
   */
  async getRunLogs(runId: string): Promise<string> {
    try {
      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      const stageResultsCol = getCollection<StageResultDoc>(Collections.STAGE_RESULTS);

      // Ищем прогон по полному или префиксному ID
      let run = await runsCol.findOne({ runId });
      if (!run && runId.length >= 6) {
        run = await runsCol.findOne({ runId: { $regex: `^${runId}`, $options: "i" } });
      }

      if (!run) {
        return `⚠️ *Прогон с ID \`${runId}\` не найден в базе данных.*`;
      }

      const effectiveRunId = run.runId;
      const stageResults = await stageResultsCol
        .find({ runId: effectiveRunId })
        .sort({ createdAt: 1 })
        .toArray();

      const lines: string[] = [
        `📜 *ЖУРНАЛ ПРОГОНА* \`${effectiveRunId}\``,
        `🏢 *Портал:* \`${run.tenantId || "default"}\``,
        `📂 *Рубрика:* \`${(run as any).contentPillarId || (run as any).targetPillarId || "n/a"}\``,
        `📌 *Тема:* ${run.topic?.title || "Без темы"}`,
        `⚙️ *Статус:* \`${run.status}\` (Стадия: \`${run.currentStage}\`)`,
        `⏱ *Создан:* ${run.createdAt ? new Date(run.createdAt).toLocaleString("ru-RU") : "n/a"}`,
        "",
        `📊 *СТАДИИ ПАЙПЛАЙНА:*`,
      ];

      if (stageResults.length === 0) {
        lines.push(`_Нет сохраненных результатов этапов._`);
      } else {
        for (const sr of stageResults) {
          const res = (sr.result as Record<string, any>) || {};
          const duration = sr.createdAt ? `[${new Date(sr.createdAt).toLocaleTimeString("ru-RU")}]` : "";

          let details = "";
          switch (sr.stage) {
            case PipelineStage.TREND: {
              const count = Array.isArray(res.items) ? res.items.length : 0;
              details = `Отобрано трендов: ${count}`;
              break;
            }
            case PipelineStage.POSITIONING: {
              details = `Relevance: ${res.relevance}% (Accepted: ${res.accepted})`;
              if (res.reason) details += `\n   Причина: _${res.reason.substring(0, 100)}..._`;
              break;
            }
            case PipelineStage.STRATEGY: {
              details = `Формат: \`${res.format}\` | Аудитория: _${res.target_audience}_`;
              if (res.core_idea) details += `\n   Идея: _${res.core_idea.substring(0, 100)}..._`;
              break;
            }
            case PipelineStage.WRITING: {
              const textLen = typeof res.text === "string" ? res.text.length : 0;
              details = `Текст: ${textLen} симв. (Хук: "${(res.hook || "").substring(0, 50)}...")`;
              break;
            }
            case PipelineStage.DESIGN: {
              const slidesCount = Array.isArray(res.render_data?.slides)
                ? res.render_data.slides.length
                : res.slidesCount || 0;
              details = `Шаблон: \`${res.template_name || "default"}\` | Слайдов: ${slidesCount}`;
              break;
            }
            case PipelineStage.SEO: {
              details = `SEO Score: ${res.score}/100`;
              if (Array.isArray(res.recommendations) && res.recommendations.length > 0) {
                details += ` | Советов: ${res.recommendations.length}`;
              }
              break;
            }
            case PipelineStage.PUBLISHING: {
              details = `Статус публикации: ${res.status || "готово"}`;
              break;
            }
            default:
              details = `Завершено`;
          }

          lines.push(`• *${sr.stage.toUpperCase()}* ${duration}\n   ${details}`);
        }
      }

      if (run.retries && Object.keys(run.retries).length > 0) {
        lines.push("", `🔄 *Повторные попытки (Retries):*`);
        for (const [stg, count] of Object.entries(run.retries)) {
          lines.push(`- ${stg}: ${count}`);
        }
      }

      return lines.join("\n");
    } catch (err: any) {
      logger.error({ err, runId }, "Failed to get run logs");
      return `❌ *Ошибка при чтении логов:* ${err.message}`;
    }
  }

  /**
   * Получение списка последних сбоев и ошибок
   */
  async getRecentErrors(limit = 5): Promise<string> {
    try {
      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      const failedRuns = await runsCol
        .find({
          $or: [{ status: "failed" }, { status: "rejected" }, { error: { $exists: true } }],
        })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();

      if (failedRuns.length === 0) {
        return `✅ *Ошибок и сбоев в недавних прогонах не обнаружено.*`;
      }

      const lines: string[] = [`⚠️ *ПОСЛЕДНИЕ СБОИ И ОТКЛОНЕНИЯ (${failedRuns.length}):*\n`];

      for (const r of failedRuns) {
        const title = r.topic?.title || "Без названия";
        const date = r.updatedAt ? new Date(r.updatedAt).toLocaleTimeString("ru-RU") : "";
        const errDesc = (r as any).error || (r as any).failureReason || "Отклонено валидатором";
        lines.push(
          `• \`${r.runId.substring(0, 8)}\` [${r.status}] ${date}\n  Тема: *${title}*\n  Причина: _${errDesc}_`
        );
      }

      lines.push("\n💡 Для подробностей: `/logs <RunID>`");
      return lines.join("\n");
    } catch (err: any) {
      logger.error({ err }, "Failed to get recent errors");
      return `❌ *Ошибка при получении списка ошибок:* ${err.message}`;
    }
  }

  /**
   * Статистика состояния очередей BullMQ
   */
  async getQueueStats(queues: BotQueues): Promise<string> {
    try {
      const stages = [
        PipelineStage.TREND,
        PipelineStage.POSITIONING,
        PipelineStage.STRATEGY,
        PipelineStage.WRITING,
        PipelineStage.DESIGN,
        PipelineStage.SEO,
        PipelineStage.PUBLISHING,
      ] as const;

      const lines: string[] = [`📊 *СОСТОЯНИЕ ОЧЕРЕДЕЙ ПАЙПЛАЙНА:*\n`];

      for (const stg of stages) {
        const q = queues[stg];
        const [waiting, active, failed, completed] = await Promise.all([
          q.getWaitingCount(),
          q.getActiveCount(),
          q.getFailedCount(),
          q.getCompletedCount(),
        ]);

        const statusIcon = failed > 0 ? "⚠️" : active > 0 ? "⚙️" : "🟢";
        lines.push(
          `${statusIcon} *${stg.toUpperCase()}*: ожидает: \`${waiting}\` | активно: \`${active}\` | сбоев: \`${failed}\` | готово: \`${completed}\``
        );
      }

      return lines.join("\n");
    } catch (err: any) {
      logger.error({ err }, "Failed to get queue stats");
      return `❌ *Ошибка получения очередей:* ${err.message}`;
    }
  }

  /**
   * Сводный обзор последних 5 прогонов
   */
  async getRecentRunsSummary(limit = 5): Promise<string> {
    try {
      const runsCol = getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS);
      const runs = await runsCol.find({}).sort({ createdAt: -1 }).limit(limit).toArray();

      if (runs.length === 0) {
        return `_В базе данных пока нет прогонов._`;
      }

      const lines: string[] = [`📋 *ПОСЛЕДНИЕ ПРОГОНЫ ПАЙПЛАЙНА:*\n`];

      for (const r of runs) {
        const time = r.createdAt ? new Date(r.createdAt).toLocaleTimeString("ru-RU") : "";
        const title = r.topic?.title || "Без темы";
        const icon =
          r.status === "approved"
            ? "✅"
            : r.status === "awaiting_approval"
            ? "⏳"
            : r.status === "running"
            ? "⚙️"
            : r.status === "rejected"
            ? "🚫"
            : "⚠️";

        lines.push(
          `${icon} \`${r.runId.substring(0, 8)}\` (${time}) [${r.currentStage}]\n   *${title}*`
        );
      }

      lines.push("\n💡 Просмотреть детальный лог: `/logs <RunID>`");
      return lines.join("\n");
    } catch (err: any) {
      return `❌ Ошибка: ${err.message}`;
    }
  }
}
