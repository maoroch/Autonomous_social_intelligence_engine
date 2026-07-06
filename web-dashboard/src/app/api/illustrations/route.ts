import { NextResponse } from "next/server";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "linkedin_pipeline";

export async function GET() {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const illustrations = await getCollection(Collections.SVG_ILLUSTRATIONS).find({}).toArray();
    return NextResponse.json(illustrations);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch illustrations" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const body = await req.json();
    if (!body.name || !body.svgContent) {
      return NextResponse.json({ error: "Name and svgContent are required" }, { status: 400 });
    }
    const result = await getCollection(Collections.SVG_ILLUSTRATIONS).insertOne({
      name: body.name,
      svgContent: body.svgContent,
    });
    return NextResponse.json({ _id: result.insertedId, name: body.name, svgContent: body.svgContent });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create illustration" }, { status: 500 });
  }
}
