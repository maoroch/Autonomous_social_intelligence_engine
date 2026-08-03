import { NextResponse } from "next/server";
import { connectMongo, getCollection, Collections, type FactChunkDoc } from "@pipeline/shared/db";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "linkedin_pipeline";

export async function GET(req: Request) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json([]);
    }
    const chunks = await getCollection<FactChunkDoc>(Collections.FACT_CHUNKS)
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .toArray();
    return NextResponse.json(chunks);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch fact chunks" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const body = await req.json();
    const { tenantId, productName, sourceLabel, content } = body;

    if (!tenantId || !productName || !sourceLabel || !content) {
      return NextResponse.json(
        { error: "tenantId, productName, sourceLabel and content are required" },
        { status: 400 },
      );
    }

    const doc: Omit<FactChunkDoc, "_id"> = {
      tenantId,
      productName,
      sourceLabel,
      content,
      createdAt: new Date(),
    };
    const result = await getCollection<FactChunkDoc>(Collections.FACT_CHUNKS).insertOne(doc as FactChunkDoc);
    return NextResponse.json({ ...doc, _id: result.insertedId });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create fact chunk" }, { status: 500 });
  }
}
