import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTemplateHtml, interpolateTemplate, formatSlideBullets } from "../render/template-engine.js";
import type { StyleConfig } from "../types/index.js";
import type { SlideItem } from "../validators/slide-deck.validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateDir = path.resolve(__dirname, "../../template");

describe("Template Interpolation & Cyrillic / Font Support", () => {
  const mockStyle: StyleConfig = {
    key: "industrial-measurement-equipment",
    name: "Testo Brand (Default)",
    coverTemplate: "industrial-measurement-equipment/cover.html",
    cardTemplate: "industrial-measurement-equipment/card.html",
    defaultCoverBadge: "B2B CASE",
    defaultCardBadge: "TECHNICAL OVERVIEW",
    brand: {
      accentColor: "#FF7900",
      inkColor: "#0F172A",
      paperColor: "#FFFFFF",
    },
  };

  it("should contain subset=cyrillic,cyrillic-ext in Google Fonts URL in HTML templates", () => {
    const coverPath = path.join(templateDir, "industrial-measurement-equipment/cover.html");
    const cardPath = path.join(templateDir, "industrial-measurement-equipment/card.html");

    assert.ok(fs.existsSync(coverPath), "Cover HTML template exists");
    assert.ok(fs.existsSync(cardPath), "Card HTML template exists");

    const coverHtml = fs.readFileSync(coverPath, "utf8");
    const cardHtml = fs.readFileSync(cardPath, "utf8");

    assert.ok(
      coverHtml.includes("subset=cyrillic,cyrillic-ext"),
      "cover.html includes cyrillic font subset"
    );
    assert.ok(
      cardHtml.includes("subset=cyrillic,cyrillic-ext"),
      "card.html includes cyrillic font subset"
    );
  });

  it("should correctly interpolate Cyrillic text and ₽ ruble symbol without corruption", () => {
    const slide: SlideItem = {
      key: "slide_4",
      badge: "ROI & ЭКОНОМИЯ",
      title: "Результат: 4,8 млн рублей (или 4,8 млн ₽)",
      bullets: [
        "Аварийный останов котельной предотвращён.",
        "Чистая экономия завода составила 4 800 000 ₽.",
        "Соответствие требованиям GxP подтверждено аудитом."
      ],
      footer: "testo.azia",
      illustration: "savings_chart",
    };

    const rawCard = loadTemplateHtml(mockStyle.cardTemplate);
    const rendered = interpolateTemplate(rawCard, slide, mockStyle, 3, 5, "", "");

    // Assert badges, titles and bullets
    assert.ok(rendered.includes("ROI &amp; ЭКОНОМИЯ"), "Rendered HTML contains escaped Cyrillic badge");
    assert.ok(rendered.includes("Результат: 4,8 млн рублей (или 4,8 млн ₽)"), "Rendered HTML contains Cyrillic title and ₽ symbol");
    assert.ok(rendered.includes("Аварийный останов котельной предотвращён."), "Rendered HTML contains Cyrillic bullet 1");
    assert.ok(rendered.includes("Чистая экономия завода составила 4 800 000 ₽."), "Rendered HTML contains bullet with ₽");
    assert.ok(rendered.includes("4/5"), "Rendered slide page counter 4/5");
  });

  it("should correctly format cover slide description from bullets", () => {
    const bullets = [
      "Как главный энергетик спас котельную.",
      "Реальный кейс предотвращения аварии."
    ];
    const { bodyText, bodyHtml } = formatSlideBullets(bullets, undefined, true);

    assert.equal(bodyText, "Как главный энергетик спас котельную. Реальный кейс предотвращения аварии.");
    assert.ok(bodyHtml.includes("body-text"));
  });
});
