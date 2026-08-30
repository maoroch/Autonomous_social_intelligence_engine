import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CinemaCuratorService, type CuratedArticle } from "../services/cinema-curator.js";

describe("CinemaCuratorService Unit Tests", () => {
  const curator = new CinemaCuratorService();

  test("getFallbackArticles should provide structured grounding articles for fresh and popular modes", () => {
    const freshArticles = curator.getFallbackArticles("fresh");
    assert.ok(freshArticles.length >= 3, "Should have at least 3 fresh fallback articles");
    assert.strictEqual(freshArticles[0]?.category, "fresh");
    assert.ok(freshArticles[0]?.fullArticleText.length > 50, "Full article text must be populated for grounding");
    assert.ok(freshArticles[0]?.url.startsWith("https://"), "Valid article URL required");

    const popularArticles = curator.getFallbackArticles("popular");
    assert.ok(popularArticles.length >= 3, "Should have at least 3 popular fallback articles");
    assert.strictEqual(popularArticles[0]?.category, "popular");
    assert.ok(popularArticles[0]?.summary.length > 20, "Summary must be populated");
  });

  test("getCuratorMenuKeyboard should offer popular vs fresh choice", () => {
    const keyboard = curator.getCuratorMenuKeyboard();
    assert.ok(keyboard.inline_keyboard.length >= 2);

    const flatButtons = keyboard.inline_keyboard.flat();
    const hasPopular = flatButtons.some((b) => b.callback_data === "cinema_mode:popular");
    const hasFresh = flatButtons.some((b) => b.callback_data === "cinema_mode:fresh");

    assert.ok(hasPopular, "Should have popular topics button");
    assert.ok(hasFresh, "Should have fresh news button");
  });

  test("saveUserArticles and getArticleByIndex should manage user session caching accurately", () => {
    const userId = 123456;
    const sampleArticles: CuratedArticle[] = [
      {
        title: "Test Spider-Man Article",
        url: "https://example.com/spiderman",
        summary: "Spider-Man summary",
        fullArticleText: "Full article text about Spider-Man",
        source: "Den of Geek",
        category: "fresh",
      },
      {
        title: "Test Dune Article",
        url: "https://example.com/dune",
        summary: "Dune summary",
        fullArticleText: "Full article text about Dune Messiah",
        source: "Den of Geek",
        category: "popular",
      },
    ];

    curator.saveUserArticles(userId, sampleArticles);

    const article0 = curator.getArticleByIndex(userId, 0);
    assert.ok(article0);
    assert.strictEqual(article0?.title, "Test Spider-Man Article");

    const article1 = curator.getArticleByIndex(userId, 1);
    assert.ok(article1);
    assert.strictEqual(article1?.title, "Test Dune Article");

    const articleNone = curator.getArticleByIndex(userId, 99);
    assert.strictEqual(articleNone, undefined);
  });

  test("formatArticleListMessage should render clean markdown and inline action buttons", () => {
    const sampleArticles: CuratedArticle[] = [
      {
        title: "Spider-Man 4 Filming Updates",
        url: "https://denofgeek.com/spiderman4",
        summary: "Filming begins in NY with Black Cat",
        fullArticleText: "Full body text",
        source: "Den of Geek",
        category: "fresh",
      },
    ];

    const { text, replyMarkup } = curator.formatArticleListMessage(sampleArticles, "fresh");

    assert.ok(text.includes("СВЕЖИЕ КИНО-НОВОСТИ"));
    assert.ok(text.includes("Spider-Man 4 Filming Updates"));
    assert.ok(text.includes("https://denofgeek.com/spiderman4"));

    assert.ok(replyMarkup.inline_keyboard.length >= 2);
    assert.strictEqual(replyMarkup.inline_keyboard[0]?.[0]?.callback_data, "cinema_pick:0");
  });

  test("batchArticleContent should chunk article text into coherent paragraphs and insights", () => {
    const fullText = `Первый абзац статьи содержит важную вводную информацию о кастинге.
    
Второй абзац детально раскрывает сюжетные повороты и новые инсайды со съемочной площадки в Лондоне.

Третий абзац анализирует дату премьеры в кинотеатрах и формат показа в IMAX.`;

    const batches = curator.batchArticleContent(fullText, 200);
    assert.ok(batches.length >= 2, "Should produce at least 2 structured batches");
    assert.ok(batches[0]?.includes("кастинге"));
    assert.ok(batches.some((b) => b.includes("IMAX")));
  });
});
