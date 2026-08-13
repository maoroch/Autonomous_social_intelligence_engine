import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GITHUB_OCTOCAT_SVG = `<svg viewBox="0 0 24 24" width="220" height="220" fill="#ffffff" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 12px 32px rgba(255,255,255,0.18));"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>`;

export function testCoverSlideRendering() {
  console.log("🧪 Running Cover & Illustration Unit Tests for Tech Portal...\n");

  const templateDir = path.resolve(__dirname, "../../template");

  const testCases = [
    {
      pillarId: "github-trending-repos",
      templateFile: "cover-github-trending-repos.html",
      title: "5 GitHub Repos That Will Save You 10+ Hours This Week",
      body: "Stop reinventing the wheel. Bookmark these today 📌",
      expectedIllustrationSubstring: "<svg viewBox=\"0 0 24 24\"", // GitHub Octocat SVG
      footerLeft: "<span>@maoroch</span>",
      pageNumber: "1/5",
    },
    {
      pillarId: "tech-discussions-debates",
      templateFile: "cover-tech-discussions-debates.html",
      title: "Monolith vs Microservices: Which Architecture Wins in 2026?",
      body: "Battle of architectural patterns: trade-offs, scaling & real SaaS benchmarks ⚔️",
      expectedIllustrationSubstring: "",
      footerLeft: "<span>@maoroch</span>",
      pageNumber: "1/5",
    },
  ];

  let passedTests = 0;

  for (const tc of testCases) {
    console.log(`🔍 Testing cover template [${tc.templateFile}] for pillar: ${tc.pillarId}...`);

    const filePath = path.join(templateDir, tc.templateFile);
    if (!fs.existsSync(filePath)) {
      throw new Error(`TEST FAILED: Template file not found: ${filePath}`);
    }

    const rawTemplate = fs.readFileSync(filePath, "utf8");

    // 1. Verify mandatory placeholder presence in raw template
    const requiredPlaceholders = ["{{TITLE}}", "{{BODY}}", "{{FOOTER_LEFT}}"];
    for (const ph of requiredPlaceholders) {
      if (!rawTemplate.includes(ph)) {
        throw new Error(`TEST FAILED: Template ${tc.templateFile} missing placeholder ${ph}`);
      }
    }

    // 2. Perform mock substitution logic (matching agent-design index.ts)
    const illustrationContent = tc.expectedIllustrationSubstring ? GITHUB_OCTOCAT_SVG : "";
    let renderedHtml = rawTemplate
      .replace("{{BADGE}}", "TECH DEBATE")
      .replace("{{TITLE}}", tc.title)
      .replace("{{BODY}}", tc.body)
      .replace("{{ILLUSTRATION}}", illustrationContent)
      .replace("{{SCREENSHOT_OR_ILLUSTRATION}}", illustrationContent)
      .replace("{{FOOTER_LEFT}}", tc.footerLeft)
      .replace("{{PAGE_NUMBER}}", tc.pageNumber)
      .replace("{{PAGE_TEXT}}", tc.pageNumber);

    // 3. Verify no unreplaced Mustache placeholders remain
    const unreplacedMatch = renderedHtml.match(/\{\{[A-Z0-9_]+\}\}/g);
    if (unreplacedMatch) {
      throw new Error(`TEST FAILED: Unreplaced placeholders found in ${tc.templateFile}: ${unreplacedMatch.join(", ")}`);
    }

    // 4. Verify expected illustration SVG is correctly embedded
    if (tc.expectedIllustrationSubstring && !renderedHtml.includes(tc.expectedIllustrationSubstring)) {
      throw new Error(`TEST FAILED: Expected illustration missing in ${tc.templateFile}`);
    }

    console.log(`   ✅ Template [${tc.templateFile}] rendered cleanly. No raw mustache placeholders. Octocat/Illustration embedded correctly.`);
    passedTests++;
  }

  console.log(`\n🎉 ALL ${passedTests} Cover Rendering Unit Tests PASSED SUCCESSFULLY!\n`);
}

testCoverSlideRendering();
