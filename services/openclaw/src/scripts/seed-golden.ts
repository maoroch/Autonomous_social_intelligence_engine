import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { connectMongo, getCollection, Collections, disconnectMongo } from "@pipeline/shared/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

async function main() {
  const possiblePaths = [
    "/app/golden_datasets",
    path.resolve(process.cwd(), "../golden_datasets"),
    path.resolve(__dirname, "../../../../golden_datasets"),
  ];
  let datasetsDir: string = possiblePaths.find(p => fs.existsSync(p) && fs.readdirSync(p).length > 0) || possiblePaths[0] || "/app/golden_datasets";
  
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  console.log(`Connected to MongoDB, datasetsDir: ${datasetsDir}`);

  interface Mapping {
    file: string;
    altFile?: string;
    collection: string;
  }

  const mappings: Mapping[] = [
    { file: "golden_writting.json", altFile: "golden_dataset_writting.json", collection: Collections.GOLDEN_WRITING },
    { file: "golden_positioning_agent.json", collection: Collections.GOLDEN_POSITIONING },
    { file: "golden_seo_agent.json", collection: Collections.GOLDEN_SEO },
    { file: "golden_strategy_agent.json", collection: Collections.GOLDEN_STRATEGY },
    { file: "golden_trend_agent.json", collection: Collections.GOLDEN_TREND },
    { file: "golden_ru_telegram.json", collection: Collections.GOLDEN_RU_TELEGRAM },
    { file: "golden_ru_threads.json", collection: Collections.GOLDEN_RU_THREADS },
    { file: "golden_testo_pharma.json", collection: Collections.GOLDEN_TESTO_PHARMA },
    { file: "golden_cinema_media.json", collection: Collections.GOLDEN_CINEMA_MEDIA },
  ];

  for (const m of mappings) {
    let datasetPath = path.join(datasetsDir, m.file);
    if (!fs.existsSync(datasetPath) && m.altFile) {
      datasetPath = path.join(datasetsDir, m.altFile);
    }
    if (!fs.existsSync(datasetPath)) {
      console.warn(`File not found: ${datasetPath}, skipping.`);
      continue;
    }
    const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf-8"));
    const col = getCollection(m.collection);
    await col.deleteMany({});
    console.log(`Cleared existing collection: ${m.collection}`);
    
    if (dataset.length > 0) {
      await col.insertMany(dataset);
      console.log(`Successfully seeded ${dataset.length} items into ${m.collection}!`);
    }
  }

  await disconnectMongo();
}

main().catch(err => {
  console.error("Error seeding dataset:", err);
  process.exit(1);
});
