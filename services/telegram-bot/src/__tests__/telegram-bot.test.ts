import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildApprovalKeyboard, buildMainMenuKeyboard } from "../keyboards/inline.js";
import { TextEditorHandler } from "../handlers/text-editor.js";
import { LogViewerService } from "../services/log-viewer.js";

describe("Telegram Bot Unit Tests", () => {
  test("buildApprovalKeyboard should contain valid action callbacks including logs", () => {
    const runId = "test_run_12345";
    const keyboard = buildApprovalKeyboard(runId);

    assert.ok(keyboard.inline_keyboard.length >= 5, "Should have at least 5 rows of buttons");

    // Row 1: Approve & Reject
    const row1 = keyboard.inline_keyboard[0];
    assert.ok(row1);
    assert.strictEqual(row1[0]?.callback_data, `approve_run:${runId}`);
    assert.strictEqual(row1[1]?.callback_data, `reject_run:${runId}`);

    // Row 2: View full carousel album
    const row2 = keyboard.inline_keyboard[1];
    assert.ok(row2);
    assert.strictEqual(row2[0]?.callback_data, `view_carousel:${runId}`);

    // Row 3: View full text
    const row3 = keyboard.inline_keyboard[2];
    assert.ok(row3);
    assert.strictEqual(row3[0]?.callback_data, `view_full_text:${runId}`);

    // Row 4: Upload cover & Edit in Dashboard URL
    const row4 = keyboard.inline_keyboard[3];
    assert.ok(row4);
    assert.strictEqual(row4[0]?.callback_data, `upload_cover:${runId}`);
    assert.match(row4[1]?.url || "", /dashboard\/runs\/test_run_12345/);

    // Last row: View run logs
    const lastRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1];
    assert.ok(lastRow);
    assert.strictEqual(lastRow[0]?.callback_data, `view_logs:${runId}`);
  });

  test("buildMainMenuKeyboard should contain interactive quick action buttons", () => {
    const menu = buildMainMenuKeyboard();
    assert.ok(menu.inline_keyboard.length >= 3, "Menu should have multiple rows");
    assert.strictEqual(menu.inline_keyboard[0]?.[0]?.callback_data, "cmd:daily_cinema");
    assert.strictEqual(menu.inline_keyboard[1]?.[0]?.callback_data, "cmd:daily_tech");
    assert.strictEqual(menu.inline_keyboard[1]?.[1]?.callback_data, "cmd:daily_testo");
    assert.strictEqual(menu.inline_keyboard[2]?.[0]?.callback_data, "cmd:trends");
    assert.strictEqual(menu.inline_keyboard[2]?.[1]?.callback_data, "cmd:status");
  });

  test("TextEditorHandler should manage user pending state accurately", () => {
    const editor = new TextEditorHandler();
    const userId = 998877;
    const runId = "run_abc_777";

    assert.strictEqual(editor.getPendingEdit(userId), undefined);

    editor.setPendingEdit(userId, runId);
    const pending = editor.getPendingEdit(userId);
    assert.ok(pending);
    assert.strictEqual(pending.action, "edit_text");
    assert.strictEqual(pending.runId, runId);

    editor.clearPendingEdit(userId);
    assert.strictEqual(editor.getPendingEdit(userId), undefined);
  });

  test("LogViewerService instance should be created properly", () => {
    const viewer = new LogViewerService();
    assert.ok(viewer);
    assert.strictEqual(typeof viewer.getRunLogs, "function");
    assert.strictEqual(typeof viewer.getRecentErrors, "function");
    assert.strictEqual(typeof viewer.getQueueStats, "function");
    assert.strictEqual(typeof viewer.getRecentRunsSummary, "function");
  });
});
