import { MongoClient, type Db, type Collection, type Document } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Ленивая инициализация единственного подключения к MongoDB на процесс.
 * Каждый сервис вызывает connectMongo() один раз при старте.
 */
export async function connectMongo(uri: string, dbName: string): Promise<Db> {
  if (db) return db;

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error("Mongo is not connected yet. Call connectMongo() at service startup first.");
  }
  return db;
}

export async function disconnectMongo(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}

export function getCollection<T extends Document>(name: string): Collection<T> {
  return getDb().collection<T>(name);
}

/** Имена коллекций — единый источник правды, чтобы не разъезжались строки по сервисам. */
export const Collections = {
  PIPELINE_RUNS: "pipeline_runs",
  STAGE_RESULTS: "stage_results",
  AUTHOR_PROFILES: "author_profiles",
  PUBLICATIONS: "publications",
  GOLDEN_WRITING: "golden_writing",
  GOLDEN_POSITIONING: "golden_positioning",
  GOLDEN_SEO: "golden_seo",
  GOLDEN_STRATEGY: "golden_strategy",
  GOLDEN_TREND: "golden_trend",
} as const;
