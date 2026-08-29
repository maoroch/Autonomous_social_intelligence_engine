import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTestoForbiddenDomain } from "../competency.js";

describe("Testo Manufacturer Competency & PPE Rejection", () => {
  it("should detect and reject electrical PPE / NFPA 70E topics as forbidden for Testo", () => {
    const ppeTopic1 = {
      title: "NFPA 70E Electrical Safety: Best practices for Arc Flash PPE and dielectric gloves",
      summary: "Overview of personal protective equipment and protective apparel in manufacturing",
    };
    const ppeTopic2 = {
      title: "Выбор СИЗ от дугового пробоя на подстанциях",
      summary: "Спецодежда, диэлектрические щитки и безопасность персонала",
    };

    assert.equal(isTestoForbiddenDomain(ppeTopic1.title, ppeTopic1.summary), true);
    assert.equal(isTestoForbiddenDomain(ppeTopic2.title, ppeTopic2.summary), true);
  });

  it("should NOT reject legitimate Testo measurement instrument topics", () => {
    const legitTopic1 = {
      title: "Как Testo 350 помогает настроить котел и снизить выбросы NOx",
      summary: "Промышленный газоанализ и наладка режимов горения",
    };
    const legitTopic2 = {
      title: "Мониторинг чистых зон по 21 CFR Part 11 с системой Testo Saveris",
      summary: "Контроль температуры и влажности на фармацевтическом производстве",
    };
    const legitTopic3 = {
      title: "Поиск микроутечек метана на газопроводах с помощью Testo 316",
      summary: "Локализация утечек горючих газов и безопасность арматуры",
    };

    assert.equal(isTestoForbiddenDomain(legitTopic1.title, legitTopic1.summary), false);
    assert.equal(isTestoForbiddenDomain(legitTopic2.title, legitTopic2.summary), false);
    assert.equal(isTestoForbiddenDomain(legitTopic3.title, legitTopic3.summary), false);
  });
});
