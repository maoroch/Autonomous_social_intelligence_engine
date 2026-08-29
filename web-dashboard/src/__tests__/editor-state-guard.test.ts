import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Editor State Guard & Background Poll Desync Prevention", () => {
  it("should prevent background polling updates from overwriting dirty user inputs", () => {
    let localTitle = "Результат: 4,8 млн ₽ экономии";
    let isDirty = false;

    // 1. User types in the input field:
    function onUserTyping(newText: string) {
      localTitle = newText;
      isDirty = true;
    }

    onUserTyping("Результат: 4,8 млн рублей чистой экономии");
    assert.equal(localTitle, "Результат: 4,8 млн рублей чистой экономии");
    assert.equal(isDirty, true);

    // 2. Incoming background poll arrives with older data:
    const incomingServerData = {
      title: "Результат: 4,8 млн ₽ экономии",
    };

    function onBackgroundSync(serverData: { title: string }) {
      if (!isDirty) {
        localTitle = serverData.title;
      }
    }

    onBackgroundSync(incomingServerData);

    // Assert: User's typed text is preserved!
    assert.equal(
      localTitle,
      "Результат: 4,8 млн рублей чистой экономии",
      "User input must NOT be overwritten by background poll while dirty"
    );

    // 3. User saves:
    function onSaveSuccess(savedServerData: { title: string }) {
      localTitle = savedServerData.title;
      isDirty = false;
    }

    onSaveSuccess({ title: "Результат: 4,8 млн рублей чистой экономии" });
    assert.equal(isDirty, false);
    assert.equal(localTitle, "Результат: 4,8 млн рублей чистой экономии");
  });

  it("should correctly detect re-render completion from imageIds or updatedAt", () => {
    const prevPreviewId = "img_old_1";
    let isReRendering = true;

    // Simulate completion check in useRunDetails
    function checkCompletion(designResult: any, prevId: string | null): boolean {
      const newPreviewId =
        designResult?.imageIds?.[0] ||
        designResult?.updatedAt ||
        designResult?.preview_cover_1_id ||
        designResult?.imageId ||
        null;

      if (newPreviewId && newPreviewId !== prevId) {
        return false; // isReRendering becomes false
      }
      return true; // still re-rendering
    }

    // When design finishes, it returns fresh imageIds:
    const updatedDesignResult = {
      template_name: "industrial-measurement-equipment",
      imageIds: ["img_new_123", "img_new_124"],
      updatedAt: "2026-08-29T15:00:00.000Z",
    };

    isReRendering = checkCompletion(updatedDesignResult, prevPreviewId);
    assert.equal(isReRendering, false, "isReRendering should turn off when new imageIds arrive");
  });
});
