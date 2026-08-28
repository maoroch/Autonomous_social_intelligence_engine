import { AiClient } from "@pipeline/shared/ai";
import { getCollection, Collections, type PipelineRunDoc } from "@pipeline/shared/db";
import { createLogger } from "@pipeline/shared/logger";
import { applyDeterministicPostProcessing } from "../post-processing/post-processor.js";

const logger = createLogger("agent-writing:self-correction");

export async function runWritingEvaluationAndSelfCorrection(
  aiClient: AiClient,
  runId: string,
  initialText: string,
  evaluatorUrl: string = "http://agent-evaluator:4008"
): Promise<{ text: string; alignmentScore: number }> {
  let text = initialText;
  let finalScore = 100;

  try {
    const evalRes = await fetch(`${evaluatorUrl}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        platform: "linkedin",
        text,
      }),
    });

    if (!evalRes.ok) {
      logger.warn({ runId }, "Evaluator service returned non-200 status — skipping self-correction");
      return { text, alignmentScore: finalScore };
    }

    let evalData = (await evalRes.json()) as {
      alignmentScore: number;
      driftReport: { rule: string; passed: boolean; details: string }[];
      isGoldenMatch: boolean;
    };

    finalScore = evalData.alignmentScore;

    // 🔄 Self-Correction Feedback Loop (Auto-Reflection Pass)
    if (!evalData.isGoldenMatch && evalData.alignmentScore < 85) {
      logger.warn(
        { runId, alignmentScore: evalData.alignmentScore },
        "Drift detected — executing 1-pass Self-Correction LLM Pass"
      );

      const failedRulesText = evalData.driftReport
        .filter((r) => !r.passed)
        .map((r) => `- ${r.rule}: ${r.details}`)
        .join("\n");

      const correctionPrompt = `Предыдущий сгенерированный текст НЕ прошёл валидацию (Alignment Score: ${evalData.alignmentScore}%).
Нарушенные правила:
${failedRulesText}

Пожалуйста, перепишите текст, СТРОГО исправив указанные ошибки.
Оригинальный текст:
${text}`;

      try {
        const retryResponse = await aiClient.complete([
          { role: "system", content: "Вы — строгий технический редактор. Исправьте текст согласно замечаниям." },
          { role: "user", content: correctionPrompt },
        ]);

        if (retryResponse.text) {
          const retryCleaned = applyDeterministicPostProcessing(retryResponse.text, "linkedin");
          text = retryCleaned.text;

          const reEvalRes = await fetch(`${evaluatorUrl}/evaluate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId, platform: "linkedin", text }),
          });

          if (reEvalRes.ok) {
            evalData = (await reEvalRes.json()) as any;
            finalScore = evalData.alignmentScore;
            logger.info({ runId, newScore: evalData.alignmentScore }, "Self-Correction Pass finished");
          }
        }
      } catch (retryErr) {
        logger.warn({ retryErr, runId }, "Self-correction LLM call failed — keeping original text");
      }
    }

    await getCollection<PipelineRunDoc>(Collections.PIPELINE_RUNS).updateOne(
      { runId },
      {
        $set: {
          "evaluation.writing": {
            alignmentScore: evalData.alignmentScore,
            driftReport: evalData.driftReport,
            isGoldenMatch: evalData.isGoldenMatch,
            evaluatedAt: new Date(),
          },
          updatedAt: new Date(),
        },
      }
    );
  } catch (evalErr) {
    logger.warn({ evalErr, runId }, "Evaluator call failed (non-blocking)");
  }

  return { text, alignmentScore: finalScore };
}
