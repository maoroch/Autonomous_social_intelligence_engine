import { getCollection, Collections } from "@pipeline/shared/db";
import { createLogger } from "@pipeline/shared/logger";

const logger = createLogger("telegram-bot:text-editor");

export class TextEditorHandler {
  private userPendingState = new Map<number, { action: "edit_text"; runId: string }>();

  setPendingEdit(userId: number, runId: string) {
    this.userPendingState.set(userId, { action: "edit_text", runId });
  }

  getPendingEdit(userId: number) {
    return this.userPendingState.get(userId);
  }

  clearPendingEdit(userId: number) {
    this.userPendingState.delete(userId);
  }

  async applyDirectTextEdit(runId: string, newText: string): Promise<boolean> {
    try {
      const stageResultsCol = getCollection(Collections.STAGE_RESULTS);
      const existingWriting = await stageResultsCol.findOne({ runId, stage: "writing" });
      const currentResult = (existingWriting?.result as Record<string, any>) || {};

      await stageResultsCol.updateOne(
        { runId, stage: "writing" },
        { $set: { result: { ...currentResult, text: newText }, updatedAt: new Date() } },
        { upsert: true }
      );

      logger.info({ runId }, "Applied direct text edit to MongoDB stage_results");
      return true;
    } catch (err) {
      logger.error({ err, runId }, "Failed to apply text edit");
      return false;
    }
  }
}
