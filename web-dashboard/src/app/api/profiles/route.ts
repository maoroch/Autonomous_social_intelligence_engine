import { NextResponse } from "next/server";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "linkedin_pipeline";

export async function GET(req: Request) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    // Без tenantId ничего не отдаём — иначе портал одного клиента увидит профили другого.
    if (!tenantId) {
      return NextResponse.json([]);
    }
    const profiles = await getCollection(Collections.AUTHOR_PROFILES).find({ tenantId }).toArray();
    return NextResponse.json(profiles);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const body = await req.json();
    if (!body.tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }
    const result = await getCollection(Collections.AUTHOR_PROFILES).insertOne(body);
    return NextResponse.json({ ...body, _id: result.insertedId });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }
}
