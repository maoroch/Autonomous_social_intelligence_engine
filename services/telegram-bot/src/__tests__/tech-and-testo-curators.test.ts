import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TechCuratorService } from "../services/tech-curator.js";
import { TestoCuratorService } from "../services/testo-curator.js";

describe("TechCuratorService Unit Tests", () => {
  const service = new TechCuratorService();

  it("detectPillar should accurately map IT and architecture topics", () => {
    assert.equal(
      service.detectPillar("Top 5 Open Source GitHub Repositories", "Tools for backend"),
      "github-trending-repos"
    );
    assert.equal(
      service.detectPillar("BullMQ vs RabbitMQ in high-load architecture", "Database queue systems"),
      "architecture-deep-dive"
    );
    assert.equal(
      service.detectPillar("My weekend side-project in Rust", "Cool interactive tool"),
      "pet-projects-showcase"
    );
  });

  it("getFallbackArticles should provide structured grounding articles", () => {
    const popular = service.getFallbackArticles("popular");
    assert.ok(popular.length >= 3);
    assert.ok(popular[0] && popular[0].batches && popular[0].batches.length > 0);
    assert.equal(popular[0]?.pillarId, "architecture-deep-dive");

    const fresh = service.getFallbackArticles("fresh");
    assert.ok(fresh.length >= 2);
    assert.ok(fresh[0] && fresh[0].batches && fresh[0].batches.length > 0);
    assert.equal(fresh[0]?.pillarId, "github-trending-repos");
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

  it("detectPillar should accurately map gas and pharma topics", () => {
    assert.equal(
      service.detectPillar("Газоанализатор Testo 350 для ТЭЦ", "Контроль выбросов NOx и CO"),
      "gas-industrial-emissions"
    );
    assert.equal(
      service.detectPillar("Наладка котлов с Testo 300", "КПД горелок и избыток воздуха"),
      "gas-boiler-efficiency"
    );
    assert.equal(
      service.detectPillar("Поиск утечек метана с Testo 316-EX", "Взрывозащита ATEX"),
      "gas-safety-leak-detection"
    );
    assert.equal(
      service.detectPillar("Автоматизация 21 CFR Part 11 и GxP", "Система Testo Saveris Pharma"),
      "pharma-compliance-explained"
    );
    assert.equal(
      service.detectPillar("Холодовая цепь GDP и термокартирование", "Логгеры Testo 174T"),
      "pharma-cold-chain-story"
    );
  });

  it("getFallbackArticles should provide structured grounding articles with AZIA-TEST context", () => {
    const gas = service.getFallbackArticles("gas");
    assert.ok(gas.length >= 3);
    assert.ok(gas[0] && gas[0].batches && gas[0].batches.length > 0);
    assert.equal(gas[0]?.pillarId, "gas-industrial-emissions");

    const pharma = service.getFallbackArticles("pharma");
    assert.ok(pharma.length >= 2);
    assert.ok(pharma[0] && pharma[0].batches && pharma[0].batches.length > 0);
    assert.equal(pharma[0]?.pillarId, "pharma-compliance-explained");
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

    assert.ok(text.includes("Testo Kazakhstan Radar:"));
    assert.ok(text.includes("1️⃣"));
    assert.ok(replyMarkup.inline_keyboard.length > 0);
  });
});
