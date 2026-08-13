import "dotenv/config";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getChromePath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  return "google-chrome";
}

async function generateScreenshots() {
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--headless"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 }); // Carousel square size

  const templateDir = path.resolve(__dirname, "../../template");
  const scratchDir = "/Users/ilassalimov/.gemini/antigravity-ide/brain/8eb260eb-4a88-422c-9b6e-45dbef297b9b/scratch";
  
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  const templates = [
    { key: "testo-pharma-compliance", badge: "COMPLIANCE", title: "Ensuring 21 CFR Part 11 Compliance", color: "#3B82F6" },
    { key: "testo-pharma-cold-chain", badge: "LOGISTICS", title: "Mastering the Pharma Cold Chain (GDP)", color: "#06B6D4" },
    { key: "testo-pharma-audit", badge: "QA", title: "How to pass FDA Inspections with zero findings", color: "#10B981" },
  ];

  for (const t of templates) {
    console.log(`Generating screenshot for ${t.key}...`);
    const coverPath = path.join(templateDir, t.key, "cover.html");
    const html = fs.readFileSync(coverPath, "utf8");

    // Replace placeholders
    const rendered = html
      .replace("{{BADGE}}", t.badge)
      .replace("{{TITLE}}", t.title)
      .replace("{{BODY}}", "Learn the essential strategies to ensure complete data integrity and compliance in your pharmaceutical processes.")
      .replace("{{ILLUSTRATION}}", "")
      .replace("{{FOOTER_LEFT}}", `<img src="https://azia-test.com/wp-content/uploads/2025/02/logo.svg" alt="Testo" style="height: 60px; max-height: 60px; width: auto; display: block; object-fit: contain;" />`)
      .replace("{{PAGE_NUMBER}}", "1/10")
      .replace("{{ACCENT_COLOR}}", t.color)
      .replace("{{INK_COLOR}}", "#14171A")
      .replace("{{PAPER_COLOR}}", "#FAF9F6");

    await page.setContent(rendered, { waitUntil: "domcontentloaded", timeout: 60000 });
    // Даем небольшую паузу для гарантированной прогрузки шрифтов
    await new Promise(r => setTimeout(r, 1000));
    const outPath = path.join(scratchDir, `${t.key}.png`);
    await page.screenshot({ path: outPath, type: "png" });
    console.log(`Saved ${outPath}`);
  }

  await browser.close();
}

generateScreenshots().catch(console.error);
