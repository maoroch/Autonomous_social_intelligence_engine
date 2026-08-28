import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildApprovalKeyboard, buildMainMenuKeyboard } from "../keyboards/inline.js";
import { TextEditorHandler } from "../handlers/text-editor.js";

describe("Telegram Bot Unit Tests", () => {
  test("buildApprovalKeyboard should contain valid action callbacks", () => {
    const runId = "test_run_12345";
    const keyboard = buildApprovalKeyboard(runId);

    assert.ok(keyboard.inline_keyboard.length >= 4, "Should have at least 4 rows of buttons");
    
    // Row 1: Approve & Reject
    const row1 = keyboard.inline_keyboard[0];
    assert.ok(row1);
    assert.strictEqual(row1[0]?.callback_data, `approve_run:${runId}`);
    assert.strictEqual(row1[1]?.callback_data, `reject_run:${runId}`);

    // Row 2: View full carousel album
    const row2 = keyboard.inline_keyboard[1];
    assert.ok(row2);
    assert.strictEqual(row2[0]?.callback_data, `view_carousel:${runId}`);

    // Row 3: Edit text
    const row3 = keyboard.inline_keyboard[2];
    assert.ok(row3);
    assert.strictEqual(row3[0]?.callback_data, `edit_text:${runId}`);

    // Row 4: Regenerate
    const row4 = keyboard.inline_keyboard[3];
    assert.ok(row4);
    assert.strictEqual(row4[0]?.callback_data, `regenerate_writing:${runId}`);
    assert.strictEqual(row4[1]?.callback_data, `regenerate_design:${runId}`);
  });

  test("buildMainMenuKeyboard should contain interactive quick action buttons", () => {
    const menu = buildMainMenuKeyboard();
    assert.ok(menu.inline_keyboard.length === 2, "Menu should have 2 rows");
    assert.strictEqual(menu.inline_keyboard[0]?.[0]?.callback_data, "cmd:daily_cinema");
    assert.strictEqual(menu.inline_keyboard[0]?.[1]?.callback_data, "cmd:trends");
    assert.strictEqual(menu.inline_keyboard[1]?.[0]?.callback_data, "cmd:test_pipeline");
    assert.strictEqual(menu.inline_keyboard[1]?.[1]?.callback_data, "cmd:status");
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
});
