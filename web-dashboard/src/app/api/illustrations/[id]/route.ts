import { NextResponse } from "next/server";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";
import { ObjectId } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "linkedin_pipeline";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const doc = await getCollection(Collections.SVG_ILLUSTRATIONS).findOne({ _id: new ObjectId(id) });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(doc);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch illustration" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const body = await req.json();
    delete body._id;
    await getCollection(Collections.SVG_ILLUSTRATIONS).updateOne(
      { _id: new ObjectId(id) },
      { $set: body }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to update illustration" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    await getCollection(Collections.SVG_ILLUSTRATIONS).deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete illustration" }, { status: 500 });
  }
}
