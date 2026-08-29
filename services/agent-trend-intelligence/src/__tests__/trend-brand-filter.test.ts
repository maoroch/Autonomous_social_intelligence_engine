import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hasBrandMention,
  getBrandTagForArticle,
  prioritizeTrendsForTenant,
} from "../filters/trend-filters.js";
import { formatHeadlinesForSelection } from "../analyzer/trend-llm-analyzer.js";
import type { RawTrendItem } from "../validators/trend.validator.js";

describe("Tenant Trend Filters & Priority Ranking", () => {
  it("should accurately detect direct Testo brand and instrument mentions", () => {
    const directMention1: RawTrendItem = {
      title: "New emission limits: how Testo 350 protects industrial boilers",
      summary: "Practical guide to flue gas analysis",
      url: "https://example.com/testo-350",
      source: "Plant Engineering",
      score: 90,
    };
    const directMention2: RawTrendItem = {
      title: "GXP compliance in cold chain",
      summary: "Automated monitoring with Testo Saveris Pharma system",
      url: "https://example.com/saveris",
      source: "Pharma News",
      score: 90,
    };
    const noMention: RawTrendItem = {
      title: "General overview of industrial heat exchangers",
      summary: "Modern heating systems and energy efficiency",
      url: "https://example.com/boilers",
      source: "Plant Engineering",
      score: 85,
    };

    assert.equal(hasBrandMention(directMention1, "testo"), true);
    assert.equal(hasBrandMention(directMention2, "testo"), true);
    assert.equal(hasBrandMention(noMention, "testo"), false);
  });

  it("should tag brand-matching articles in Stage 1 headline selection", () => {
    const items: RawTrendItem[] = [
      {
        title: "Optimizing combustion with Testo 300 analyzer",
        summary: "Field measurements",
        url: "https://example.com/1",
        source: "Source A",
        score: 90,
      },
      {
        title: "Cleanroom validation principles under ISO 14644",
        summary: "Validation methodology",
        url: "https://example.com/2",
        source: "Source B",
        score: 85,
      },
    ];

    const formatted = formatHeadlinesForSelection(items, "testo");
    assert.match(formatted, /\[★ ПРЯМОЕ УПОМИНАНИЕ TESTO \/ BRAND MATCH\]/);
    assert.match(formatted, /Optimizing combustion with Testo 300 analyzer/);
  });

  it("should prioritize brand-matched articles to the front of candidate trends", () => {
    const article1: RawTrendItem = {
      title: "General Plant News",
      summary: "Steam pipes",
      url: "https://example.com/1",
      source: "Source A",
      score: 80,
    };
    const article2: RawTrendItem = {
      title: "New Testo 350 Flue Gas Calibration Guide",
      summary: "Industrial boilers",
      url: "https://example.com/2",
      source: "Source B",
      score: 85,
    };

    const { candidateTrends, brandMatchesCount } = prioritizeTrendsForTenant([article1, article2], "testo");
    assert.equal(brandMatchesCount, 1);
    assert.equal(candidateTrends[0]!.title, "New Testo 350 Flue Gas Calibration Guide");
    assert.equal(candidateTrends[1]!.title, "General Plant News");
  });

  it("should detect cinema-media pop culture keywords", () => {
    const marvelItem: RawTrendItem = {
      title: "Marvel reveals Avengers: Secret Wars concept art",
      summary: "MCU Multiverse update",
      url: "https://example.com/mcu",
      source: "Den of Geek",
      score: 95,
    };
    assert.equal(hasBrandMention(marvelItem, "cinema-media"), true);
    assert.match(getBrandTagForArticle(marvelItem, "cinema-media"), /CINEMA POP-CULTURE HIT/);
  });

  it("should enforce strict pillar isolation between Pharma and Gas analyzers", () => {
    const pharmaArticle: RawTrendItem = {
      title: "Cleanroom temperature logging with Testo Saveris system",
      summary: "FDA 21 CFR Part 11 validation",
      url: "https://example.com/pharma",
      source: "Pharma Tech",
      score: 95,
    };
    const gasArticle: RawTrendItem = {
      title: "Boiler burner combustion tuning with Testo 350 analyzer",
      summary: "Flue gas emissions NOx/CO",
      url: "https://example.com/gas",
      source: "Plant Eng",
      score: 90,
    };

    // When pillar is Pharma:
    assert.equal(hasBrandMention(pharmaArticle, "testo", "pharma-audit-ready"), true);
    assert.equal(hasBrandMention(gasArticle, "testo", "pharma-audit-ready"), false);

    // When pillar is Gas:
    assert.equal(hasBrandMention(gasArticle, "testo", "gas-industrial-emissions"), true);
    assert.equal(hasBrandMention(pharmaArticle, "testo", "gas-industrial-emissions"), false);
  });
});
