import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectMongo, getCollection, Collections, disconnectMongo, type UserDoc } from "@pipeline/shared/db";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

/**
 * Создаёт по одному admin-пользователю на каждый существующий портал (tech + Testo).
 * ВАЖНО: пароли ниже — временные dev-пароли. Смените их сразу после первого входа
 * (в этом MVP нет UI смены пароля — обновите passwordHash напрямую в БД или через seed повторно).
 */
const SEED_USERS: Array<{ tenantId: string; email: string; password: string; role: "admin" | "creator" }> = [
  { tenantId: "software-development-default", email: "admin@tech.local", password: "changeme-tech-2026", role: "admin" },
  { tenantId: "testo", email: "admin@testo.local", password: "changeme-testo-2026", role: "admin" },
];

async function main() {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  console.log("Connected to MongoDB");

  const usersCol = getCollection<UserDoc>(Collections.USERS);

  for (const seed of SEED_USERS) {
    const existing = await usersCol.findOne({ tenantId: seed.tenantId, email: seed.email });
    if (existing) {
      console.log(`User already exists, skipping: ${seed.email} (${seed.tenantId})`);
      continue;
    }

    const passwordHash = await bcrypt.hash(seed.password, 10);
    await usersCol.insertOne({
      tenantId: seed.tenantId,
      email: seed.email,
      passwordHash,
      role: seed.role,
      createdAt: new Date(),
    });
    console.log(`Created user: ${seed.email} / password: ${seed.password}  (portal: ${seed.tenantId})`);
  }

  console.log("\nDone. Log in at /<tenantId>/login with the credentials above.");
  await disconnectMongo();
}

main().catch((err) => {
  console.error("Error seeding users:", err);
  process.exit(1);
});
