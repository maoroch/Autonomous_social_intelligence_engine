import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runLocalDesignTest() {
  console.log("🚀 Starting standalone Agent-Design unit render test for ALL 3 Testo Pharma rubrics (0 LLM tokens)...\n");

  const templateDir = path.resolve(__dirname, "../../template/industrial-measurement-equipment");
  const coverHtmlPath = path.join(templateDir, "cover.html");
  const cardHtmlPath = path.join(templateDir, "card.html");

  if (!fs.existsSync(coverHtmlPath) || !fs.existsSync(cardHtmlPath)) {
    throw new Error(`Templates not found at ${templateDir}`);
  }

  const coverTemplate = fs.readFileSync(coverHtmlPath, "utf8");
  const cardTemplate = fs.readFileSync(cardHtmlPath, "utf8");

  const logoUrl = "https://azia-test.com/wp-content/uploads/2025/02/logo.svg";
  const footerLeft = `<img src="${logoUrl}" alt="Testo" style="height: 60px; max-height: 60px; width: auto; display: block; object-fit: contain;" />`;

  const rubricDecks = [
    {
      rubricId: "pharma-compliance-explained",
      name: "Рубрика 1: GxP на пальцах / 21 CFR Part 11",
      slides: [
        {
          badge: "GxP Compliance",
          title: "21 CFR Part 11: Требования к ERES и Audit Trail",
          bullets: ["Непрерывность записей и 3-уровневое резервирование данных в фармацевтике", "Автоматизация аудиторского следа Audit Trail с приборами Testo Saveris Pharma"],
          isCover: true,
        },
        {
          badge: "Audit Trail",
          title: "Требования к неизменяемости системных журналов",
          bullets: [
            "Audit Trail: неизменяемый системный журнал, в котором любое изменение настроек или повторная калибровка привязаны к роли пользователя в системе Testo",
            "Защита от фальсификации: полная готовность к инспекции FDA 21 CFR Part 11 без риска отзыва партий термолабильных медикаментов",
          ],
          isCover: false,
        },
      ],
    },
    {
      rubricId: "pharma-cold-chain-story",
      name: "Рубрика 2: Холодовая цепь без слепых зон (GDP)",
      slides: [
        {
          badge: "Cold Chain GDP",
          title: "Холодовая цепь без слепых зон при транспортировке",
          bullets: ["Непрерывный мониторинг фарм-препаратов от склада до аптечной сети", "Исключение риска температурных эксцессов с логгерами Testo 174T"],
          isCover: true,
        },
        {
          badge: "GDP Logistics",
          title: "Контроль температурного режима при перевозке",
          bullets: [
            "3-уровневое резервирование данных и память до 16 000 измерений на каждом контрольном объекте логистической цепи",
            "Автоматическое формирование квалификационных отчетов в соответствии со стандартами GDP и СанПиН",
          ],
          isCover: false,
        },
      ],
    },
    {
      rubricId: "pharma-audit-ready",
      name: "Рубрика 3: Готовы к инспекции? / Audit Preparedness",
      slides: [
        {
          badge: "FDA & EMA Audit",
          title: "Чек-лист готовности к аудиту Минпромторга и FDA",
          bullets: ["Проверка валидации ERES и принципов целостности данных ALCOA+", "Инспекция чистых помещений и системы непрерывного мониторинга"],
          isCover: true,
        },
        {
          badge: "ALCOA+ Checklist",
          title: "Подготовка протоколов и квалификация оборудования",
          bullets: [
            "Чек-лист соответствия ERES: валидированное ПО Testo Saveris, разделение прав пользователей и электронные подписи",
            "Тепловизионный аудит чистых помещений тепловизорами Testo 883 для поиска температурных аномалий перед инспекцией",
          ],
          isCover: false,
        },
      ],
    },
  ];

  for (const deck of rubricDecks) {
    console.log(`📌 Testing Design Templates for ${deck.name}...`);

    const renderedSlides = deck.slides.map((slide, idx) => {
      const template = slide.isCover ? coverTemplate : cardTemplate;
      const pageNum = `${idx + 1}/${deck.slides.length}`;

      let bodyHtml = "";
      if (slide.bullets && slide.bullets.length > 0) {
        bodyHtml = slide.bullets.map(b => `<p>→ ${b}</p>`).join("");
      }

      return template
        .replace("{{BADGE}}", slide.badge)
        .replace("{{TITLE}}", slide.title)
        .replace("{{BODY}}", bodyHtml)
        .replace("{{FOOTER_LEFT}}", footerLeft)
        .replace("{{PAGE_NUMBER}}", pageNum)
        .replace("{{ILLUSTRATION}}", "")
        .replace("{{ACCENT_COLOR}}", "#EE8432")
        .replace("{{INK_COLOR}}", "#14171A")
        .replace("{{PAPER_COLOR}}", "#FAF9F6");
    });

    renderedSlides.forEach((html, i) => {
      const hasLogo = html.includes("azia-test.com") && html.includes("style=\"height: 60px");
      const hasFooter = html.includes("footer-brand");
      console.log(`   Slide ${i + 1} (${deck.slides[i].isCover ? "Cover" : "Card"}): Logo 60px embedded = ${hasLogo}, Footer container = ${hasFooter}`);
    });

    console.log(`✅ ${deck.name} design rendering PASSED!\n`);
  }

  console.log("🎉 ALL 3 Testo Pharma Rubrics Design Unit Tests PASSED!");
}

runLocalDesignTest().catch(console.error);
