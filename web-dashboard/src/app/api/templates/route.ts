import { NextResponse } from "next/server";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";

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
    const templates = await getCollection(Collections.DESIGN_TEMPLATES)
      .find({ tenantId })
      .sort({ updatedAt: -1 })
      .toArray();
    return NextResponse.json(templates);
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch design templates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const body = await req.json();
    const { tenantId, name, type, pillarId, htmlTemplate, cssContent } = body;

    if (!tenantId || !name || !type || !htmlTemplate) {
      return NextResponse.json(
        { error: "tenantId, name, type (cover|card), and htmlTemplate are required" },
        { status: 400 }
      );
    }

    const doc = {
      tenantId,
      name: name.trim(),
      type, // 'cover' | 'card'
      pillarId: pillarId || "all",
      htmlTemplate,
      cssContent: cssContent || "",
      isDefault: Boolean(body.isDefault),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await getCollection(Collections.DESIGN_TEMPLATES).insertOne(doc as any);
    return NextResponse.json({ ...doc, _id: result.insertedId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create template" }, { status: 500 });
  }
}
