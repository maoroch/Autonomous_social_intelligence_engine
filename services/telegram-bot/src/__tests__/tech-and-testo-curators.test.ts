import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TechCuratorService } from "../services/tech-curator.js";
import { TestoCuratorService } from "../services/testo-curator.js";

describe("TechCuratorService Unit Tests", () => {
  const service = new TechCuratorService();

  it("getFallbackArticles should provide structured grounding articles", () => {
    const popular = service.getFallbackArticles("popular");
    assert.ok(popular.length >= 3);
    assert.ok(popular[0] && popular[0].batches && popular[0].batches.length > 0);

    const fresh = service.getFallbackArticles("fresh");
    assert.ok(fresh.length >= 2);
    assert.ok(fresh[0] && fresh[0].batches && fresh[0].batches.length > 0);
  });

  it("saveUserArticles and getArticleByIndex should manage user session caching accurately", () => {
    const mockArticles = service.getFallbackArticles("popular");
    const userId = 888123;

    service.saveUserArticles(userId, mockArticles);

    const retrieved0 = service.getArticleByIndex(userId, 0);
    assert.ok(retrieved0);
    assert.equal(retrieved0?.title, mockArticles[0]?.title);

    const nonExistent = service.getArticleByIndex(userId, 99);
    assert.equal(nonExistent, undefined);
  });

  it("formatArticleListMessage should render clean markdown and inline action buttons", () => {
    const mockArticles = service.getFallbackArticles("popular");
    const { text, replyMarkup } = service.formatArticleListMessage(mockArticles, "popular");

    assert.ok(text.includes("Tech Radar:"));
    assert.ok(text.includes("1️⃣"));
    assert.ok(replyMarkup.inline_keyboard.length > 0);
  });
});

describe("TestoCuratorService Unit Tests", () => {
  const service = new TestoCuratorService();

  it("getFallbackArticles should provide structured grounding articles with AZIA-TEST context", () => {
    const gas = service.getFallbackArticles("gas");
    assert.ok(gas.length >= 3);
    assert.ok(gas[0] && gas[0].batches && gas[0].batches.length > 0);

    const pharma = service.getFallbackArticles("pharma");
    assert.ok(pharma.length >= 2);
    assert.ok(pharma[0] && pharma[0].batches && pharma[0].batches.length > 0);
  });

  it("saveUserArticles and getArticleByIndex should manage user session caching accurately", () => {
    const mockArticles = service.getFallbackArticles("gas");
    const userId = 777321;

    service.saveUserArticles(userId, mockArticles);

    const retrieved0 = service.getArticleByIndex(userId, 0);
    assert.ok(retrieved0);
    assert.equal(retrieved0?.title, mockArticles[0]?.title);
  });

  it("formatArticleListMessage should render clean markdown and inline action buttons", () => {
    const mockArticles = service.getFallbackArticles("gas");
    const { text, replyMarkup } = service.formatArticleListMessage(mockArticles, "gas");

    assert.ok(text.includes("Testo Dynamic Catalog & Radar:"));
    assert.ok(text.includes("1️⃣"));
    assert.ok(replyMarkup.inline_keyboard.length > 0);
  });
});

describe("Testo Dynamic Catalog Grounding Unit Tests", () => {
  it("resolveTestoDeviceGrounding should accurately match Testo 350, 300, Saveris, 190, 883", async () => {
    const { resolveTestoDeviceGrounding, formatTestoDeviceBatches } = await import("../services/testo-catalog.js");

    const spec350 = resolveTestoDeviceGrounding("Обзор газоанализатора Testo 350 для ТЭЦ");
    assert.equal(spec350.model, "Testo 350");
    assert.ok(spec350.keyFeatures.some((f: string) => f.includes("Пельтье")));

    const specSaveris = resolveTestoDeviceGrounding("Фармацевтический мониторинг чистых помещений Testo Saveris Pharma");
    assert.equal(specSaveris.model, "Testo Saveris Pharma");
    assert.ok(specSaveris.certifications.includes("FDA 21 CFR Part 11"));

    const batches = formatTestoDeviceBatches(spec350);
    assert.ok(batches.length >= 4);
    assert.ok(batches[0]?.includes("Testo 350"));
    assert.ok(batches[1]?.includes("Метрологические параметры:"));
  });
});
