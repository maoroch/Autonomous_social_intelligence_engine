import "dotenv/config";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";

/**
 * Seeder for 15 Testo Pharma Industry Illustrations (5 per Rubric)
 * Stores clean, high-resolution vector/base64 illustrations into `png_illustrations` collection.
 */

// Helper to construct crisp PNG base64 from SVG icon for standard HTML template rendering
function svgToBase64PngHtml(svgContent: string): string {
  return Buffer.from(svgContent.trim()).toString("base64");
}

const PHARMA_ILLUSTRATIONS_15 = [
  // ==========================================
  // Рубрика 1: GxP на пальцах / 21 CFR Part 11
  // ==========================================
  {
    name: "audit-trail",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="15" y="10" width="70" height="80" rx="6" fill="#FFFFFF" stroke="#EE8432" stroke-width="4"/>
      <path d="M 28 28 L 72 28 M 28 42 L 60 42 M 28 56 L 66 56 M 28 70 L 52 70" stroke="#14171A" stroke-width="4" stroke-linecap="round"/>
      <circle cx="68" cy="68" r="14" fill="#EE8432"/>
      <path d="M 62 68 L 66 72 L 74 62" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`,
  },
  {
    name: "digital-signature",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M 50 12 L 82 24 V 48 C 82 68 50 88 50 88 C 50 88 18 68 18 48 V 24 Z" fill="#FAF9F6" stroke="#EE8432" stroke-width="4"/>
      <path d="M 32 46 C 36 40 44 42 48 48 C 52 54 44 62 38 58 C 34 56 42 46 68 38" stroke="#14171A" stroke-width="4" fill="none" stroke-linecap="round"/>
      <circle cx="68" cy="38" r="3" fill="#EE8432"/>
    </svg>`,
  },
  {
    name: "data-integrity",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="20" width="60" height="60" rx="8" fill="#FFFFFF" stroke="#14171A" stroke-width="4"/>
      <path d="M 35 40 L 45 40 M 35 50 L 55 50 M 35 60 L 65 60" stroke="#EE8432" stroke-width="4" stroke-linecap="round"/>
      <rect x="52" y="28" width="28" height="24" rx="4" fill="#EE8432"/>
      <path d="M 60 38 L 64 42 L 72 34" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" fill="none"/>
    </svg>`,
  },
  {
    name: "certificate",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="12" width="60" height="76" rx="4" fill="#FFFFFF" stroke="#EE8432" stroke-width="4"/>
      <path d="M 32 28 L 68 28 M 32 40 L 68 40 M 32 52 L 52 52" stroke="#14171A" stroke-width="3" stroke-linecap="round"/>
      <circle cx="64" cy="64" r="12" fill="#EE8432"/>
      <path d="M 60 74 L 56 86 L 64 82 L 72 86 L 68 74" fill="#14171A"/>
    </svg>`,
  },
  {
    name: "gxp-shield",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M 50 10 L 85 25 V 50 C 85 72 50 90 50 90 C 50 90 15 72 15 50 V 25 Z" fill="#EE8432"/>
      <path d="M 35 48 L 46 60 L 68 36" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`,
  },

  // ==========================================
  // Рубрика 2: Холодовая цепь без слепых зон (GDP)
  // ==========================================
  {
    name: "cold-chain-truck",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="30" width="52" height="38" rx="4" fill="#FFFFFF" stroke="#EE8432" stroke-width="4"/>
      <path d="M 62 42 L 78 42 L 88 54 V 68 H 62 Z" fill="#FAF9F6" stroke="#14171A" stroke-width="4"/>
      <circle cx="28" cy="72" r="8" fill="#14171A"/>
      <circle cx="72" cy="72" r="8" fill="#EE8432"/>
      <path d="M 22 48 H 50 M 22 56 H 42" stroke="#EE8432" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
  },
  {
    name: "thermometer",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="42" y="14" width="16" height="52" rx="8" fill="#FFFFFF" stroke="#EE8432" stroke-width="4"/>
      <circle cx="50" cy="74" r="16" fill="#EE8432"/>
      <rect x="47" y="32" width="6" height="34" fill="#EE8432"/>
      <line x1="62" y1="24" x2="68" y2="24" stroke="#14171A" stroke-width="3"/>
      <line x1="62" y1="36" x2="68" y2="36" stroke="#14171A" stroke-width="3"/>
      <line x1="62" y1="48" x2="68" y2="48" stroke="#14171A" stroke-width="3"/>
    </svg>`,
  },
  {
    name: "data-logger",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="25" y="15" width="50" height="70" rx="8" fill="#14171A" stroke="#EE8432" stroke-width="4"/>
      <rect x="35" y="25" width="30" height="22" rx="3" fill="#FFFFFF"/>
      <text x="50" y="41" font-family="sans-serif" font-weight="bold" font-size="12" fill="#EE8432" text-anchor="middle">+4.2°C</text>
      <circle cx="38" cy="62" r="5" fill="#EE8432"/>
      <circle cx="62" cy="62" r="5" fill="#FFFFFF"/>
      <rect x="42" y="74" width="16" height="4" rx="2" fill="#EE8432"/>
    </svg>`,
  },
  {
    name: "3tier-redundancy",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="15" y="66" width="22" height="20" rx="3" fill="#EE8432"/>
      <rect x="39" y="42" width="22" height="44" rx="3" fill="#14171A"/>
      <rect x="63" y="18" width="22" height="68" rx="3" fill="#EE8432"/>
      <path d="M 26 60 L 50 36 L 74 12" stroke="#14171A" stroke-width="4" stroke-dasharray="4 4" fill="none"/>
    </svg>`,
  },
  {
    name: "warehouse-sensor",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M 15 45 L 50 18 L 85 45 V 82 H 15 Z" fill="#FFFFFF" stroke="#EE8432" stroke-width="4"/>
      <circle cx="50" cy="55" r="14" fill="#EE8432"/>
      <path d="M 50 45 V 65 M 40 55 H 60" stroke="#FFFFFF" stroke-width="3"/>
    </svg>`,
  },

  // ==========================================
  // Рубрика 3: Готовы к инспекции? / Audit Preparedness
  // ==========================================
  {
    name: "inspection-checklist",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="16" width="60" height="72" rx="6" fill="#FFFFFF" stroke="#14171A" stroke-width="4"/>
      <rect x="38" y="10" width="24" height="12" rx="3" fill="#EE8432"/>
      <path d="M 30 36 L 36 42 L 48 30" stroke="#EE8432" stroke-width="4" fill="none"/>
      <line x1="54" y1="36" x2="72" y2="36" stroke="#14171A" stroke-width="3"/>
      <path d="M 30 56 L 36 62 L 48 50" stroke="#EE8432" stroke-width="4" fill="none"/>
      <line x1="54" y1="56" x2="72" y2="56" stroke="#14171A" stroke-width="3"/>
    </svg>`,
  },
  {
    name: "thermal-imager",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="20" width="48" height="40" rx="6" fill="#EE8432"/>
      <circle cx="44" cy="40" r="12" fill="#14171A" stroke="#FFFFFF" stroke-width="3"/>
      <path d="M 36 60 L 40 85 H 52 L 56 60 Z" fill="#14171A"/>
      <circle cx="76" cy="30" r="8" fill="#EE8432" opacity="0.6"/>
    </svg>`,
  },
  {
    name: "audit-report",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M 22 14 H 62 L 78 30 V 86 H 22 Z" fill="#FFFFFF" stroke="#EE8432" stroke-width="4"/>
      <path d="M 62 14 V 30 H 78" stroke="#EE8432" stroke-width="4" fill="none"/>
      <line x1="32" y1="42" x2="68" y2="42" stroke="#14171A" stroke-width="3"/>
      <line x1="32" y1="54" x2="68" y2="54" stroke="#14171A" stroke-width="3"/>
      <line x1="32" y1="66" x2="52" y2="66" stroke="#14171A" stroke-width="3"/>
    </svg>`,
  },
  {
    name: "cleanroom-gauge",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="36" fill="#FFFFFF" stroke="#EE8432" stroke-width="4"/>
      <circle cx="50" cy="50" r="4" fill="#14171A"/>
      <path d="M 50 50 L 68 32" stroke="#14171A" stroke-width="4" stroke-linecap="round"/>
      <path d="M 28 50 A 22 22 0 0 1 72 50" stroke="#EE8432" stroke-width="3" stroke-dasharray="4 4" fill="none"/>
    </svg>`,
  },
  {
    name: "distributor-badge",
    templateSetId: "industrial-measurement-equipment",
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="45" r="28" fill="#EE8432"/>
      <path d="M 38 45 L 46 53 L 62 35" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 40 68 L 32 90 L 50 82 L 68 90 L 60 68" fill="#14171A"/>
    </svg>`,
  },
];

async function seedPharmaIllustrations() {
  console.log("🌱 Seeding 15 Testo Pharma Industry Illustrations into MongoDB...");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
  const mongoDbName = process.env.MONGO_DB_NAME || "linkedin_pipeline";

  await connectMongo(mongoUri, mongoDbName);
  const pngCol = getCollection(Collections.PNG_ILLUSTRATIONS);

  for (const item of PHARMA_ILLUSTRATIONS_15) {
    const base64Content = svgToBase64PngHtml(item.svg);
    await pngCol.updateOne(
      { name: item.name, templateSetId: item.templateSetId },
      {
        $set: {
          name: item.name,
          templateSetId: item.templateSetId,
          base64Content,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    console.log(`  ✅ Inserted illustration: ${item.name} (${item.templateSetId})`);
  }

  console.log("🎉 Successfully seeded 15 Testo Pharma Industry Illustrations!");
  process.exit(0);
}

seedPharmaIllustrations().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
