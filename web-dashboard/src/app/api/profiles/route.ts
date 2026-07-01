import { NextResponse } from "next/server";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "linkedin_pipeline";

export async function GET() {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const profiles = await getCollection(Collections.AUTHOR_PROFILES).find({}).toArray();
    return NextResponse.json(profiles);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const body = await req.json();
    const result = await getCollection(Collections.AUTHOR_PROFILES).insertOne(body);
    return NextResponse.json({ ...body, _id: result.insertedId });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }
}
