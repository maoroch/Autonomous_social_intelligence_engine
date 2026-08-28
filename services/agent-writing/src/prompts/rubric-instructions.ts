export function getRubricWritingInstruction(contentPillarId: string): string {
  switch (contentPillarId) {
    case "pet-projects-showcase":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("Подборка pet проектов для твоего github"):
- Structure this post as a curated showcase of 3-4 creative pet-project ideas to build for a GitHub portfolio.
- For each project, specify:
  1. Project Title & Concept
  2. Recommended Tech Stack (e.g. Next.js 15, TypeScript, Tailwind, Supabase, OpenAI API)
  3. Key Architecture Features / Key Learning Takeaways.
- Include practical setup guidelines. Keep it super engaging and actionable for software engineers!`;

    case "github-trending-repos":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("Подборка github репозитории"):
- Structure this post as a curated showcase of 3-4 trending open-source GitHub repositories/tools.
- STRICT RULE: Every repository mentioned MUST BE UNIQUE. Do NOT feature or repeat the same repository twice.
- COVER SLIDE TITLE FORMULA (Slide 1): Must use a high-converting headline formula with sub-caption:
  * Productivity: "5 GitHub Repos That Will Save You 10+ Hours This Week" (Sub-caption: "Stop reinventing the wheel. Bookmark these today 📌")
  * Senior/Architecture: "7 Production-Ready Repos Senior Engineers Keep Quiet About" (Sub-caption: "Learn how large-scale applications are actually built.")
  * Hidden Gems: "5 Underrated GitHub Repos You'll Wish You Found Sooner" (Sub-caption: "Small tools with insanely high impact.")
- REPOSITORY CARDS (Slides 2..N):
  * Slide Title: Strictly the Repository Name ONLY (e.g. "sqlfluff", "airllm", "bonsai").
  * Slide Description: A concise, punchy 2-3 sentence paragraph explaining what the project is, what it does, and why it is valuable to the reader. Do NOT use bullet arrows (→).
- For each repository, specify:
  1. Repo Name & Star Badge (e.g., ⭐ 8.5k stars)
  2. Primary Language & Core Functionality (What problem it solves)
  3. Verified GitHub Link format (e.g., https://github.com/owner/repo)
- Include concise developer highlights!`;

    case "tech-discussions-debates":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("Обсуждения и споры вокруг технологий"):
- Structure this post as a provocative engineering debate comparing two contrasting tech stacks or architectural approaches (e.g. Monolith vs Microservices, REST vs gRPC, SPA vs SSR, ORM vs Raw SQL, Node.js vs Go).
- COVER SLIDE TITLE FORMULA (Slide 1): High-converting battle title with sub-caption:
  * Formula: "[Option A] vs [Option B]: Which Architecture Wins in 2026?" (Sub-caption: "Pros, cons, and when to pick each approach ⚔️")
- REPOSITORY / ARGUMENT CARDS (Slides 2..N):
  * Slide 2: Option A — Key Advantages & Ideal Use Cases
  * Slide 3: Option B — Key Advantages & Ideal Use Cases
  * Slide 4: Real-World Performance & Trade-offs (Cost, Complexity, Team Scalability)
  * Slide 5: Final Engineering Verdict & Guidelines
- Tone: Analytical, objective, encouraging comments and discussion among developers!`;

    case "pharma-compliance-explained":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("GxP на пальцах / 21 CFR Part 11"):
- Structure this post as an educational breakdown explaining complex regulatory GxP & 21 CFR Part 11 requirements in plain, accessible terms.
- Focus on key audit points: Data Integrity, Electronic Signatures, Audit Trail, and Continuous Monitoring with Testo equipment.
- Use relevant pharmaceutical hashtags ONLY (e.g., #pharma #gxp #21cfrpart11 #testo #фармацевтика). Do NOT use tech/GitHub hashtags.`;

    case "pharma-cold-chain-story":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("Холодовая цепь без слепых зон"):
- Structure this post as a risk-analysis journey showing where temperature control breaks during pharmaceutical transport (GDP logistics).
- Emphasize the impact of temperature excursions on drug batch degradation and the necessity of 3-tier data logging redundancy with Testo Saveris.
- Use relevant cold chain hashtags ONLY (e.g., #coldchain #pharma #logistics #testo #холодоваяцепь). Do NOT use tech/GitHub hashtags.`;

    case "pharma-audit-ready":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("Готовы к инспекции? / Audit Preparedness"):
- Structure this post as a checklist debunking common myths about FDA/EMA audit readiness.
- Contrast naive logging ("we record data") with true GxP compliance (Traceability, ERES compliance, immutable logs with Testo).
- Use relevant audit hashtags ONLY (e.g., #audit #gxp #pharma #testo #инспекция). Do NOT use tech/GitHub hashtags.`;

    case "testo-device-breakdown":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("Разбор прибора Testo / Equipment Breakdown"):
- Structure this post as an in-depth B2B device spotlight analyzing a specific Testo instrument (e.g. Testo Saveris Pharma, Testo 174T, Testo 883, Testo 440).
- Highlight key physical specs: measurement range, accuracy tolerances, IP protection class, battery/power specs, and memory capacity.
- Explain the precise B2B business problem solved: eliminating human paper log errors, automated alarm dispatch via SMS/Email, passing FDA/EMA audits without findings.
- Use relevant device hashtags ONLY (e.g., #testo #testosaveris #testo174t #testo883 #измерительныеприборы #gxp). Do NOT use tech/GitHub hashtags.`;

    case "marvel-mcu-lore":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("Marvel & Geek Lore"):
- Structure this post as an exciting geek-breakdown of Marvel Cinematic Universe (MCU) news, trailers, fan theories, Easter eggs, or comic comparisons.
- Tone: Engaging, enthusiastic geek journalism with intriguing hooks and discussion-provoking questions in CTA.
- Use relevant Marvel/geek hashtags ONLY (e.g., #marvel #mcu #comics #geek #cinema).`;

    case "cinema-history-backstage":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("История кино и Закулисье"):
- Structure this post as a captivating "How it was made" behind-the-scenes story of iconic film scenes, stunt work without double, revolutionary VFX, or director/actor improvisations.
- Tone: Cinematic storytelling, fascinating production facts, and engaging tone.
- Use relevant cinema hashtags ONLY (e.g., #cinema #backstage #filmmaking #vfx #hollywood).`;

    case "box-office-analytics":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("Индустрия и Кассовые сборы"):
- Structure this post as an insightful box office & movie industry breakdown analyzing weekend grosses, blockbuster budgets, box office records/flops, or streaming strategies (Netflix, HBO Max, Disney+).
- Tone: Analytical, sharp, engaging for film industry enthusiasts.
- Use relevant industry hashtags ONLY (e.g., #boxoffice #cinema #hollywood #streaming #movieindustry).`;

    case "daily-quick-recap":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("Дайджест и Новости дня"):
- Structure this post as a fast-paced 60-second express recap of major breaking movie news, castings, premiere date announcements, and fresh trailers.
- Tone: Dynamic, concise, hype-driven news digest.
- Use relevant movie news hashtags ONLY (e.g., #cinemanews #trailers #casting #premiere #movies).`;

    case "anime-kawaii-hub":
    case "anime-lore":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("Аниме-культура и Релизы"):
- Structure this post as an aesthetic, engaging review of major anime seasons, manga adaptations, studio animation quality (Ufotable, Mappa, Madhouse), and theatrical releases.
- Tone: Vibrant, enthusiastic, visually descriptive with Japanese anime cultural context.
- Use relevant anime hashtags ONLY (e.g., #anime #ufotable #manga #animereview #kinopeek).`;

    case "product-in-action":
    case "before-after":
    case "myths":
      return `\nSPECIFIC RUBRIC INSTRUCTION ("Industrial Measurement & HVAC Calibration"):
- Structure this post around real-world industrial measurement scenarios (HVAC/R, thermal imaging, calibration certificates).
- Focus on practical field challenges, accurate measurement ranges, and risk prevention.`;

    default:
      return "";
  }
}
