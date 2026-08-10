import { NextResponse } from "next/server";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";
import { ObjectId } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "linkedin_pipeline";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const { id } = await params;
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
    }

    const body = await req.json();
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (body.name) updateData.name = body.name.trim();
    if (body.type) updateData.type = body.type;
    if (body.pillarId) updateData.pillarId = body.pillarId;
    if (typeof body.htmlTemplate === "string") updateData.htmlTemplate = body.htmlTemplate;
    if (typeof body.cssContent === "string") updateData.cssContent = body.cssContent;
    if (typeof body.isDefault === "boolean") updateData.isDefault = body.isDefault;

    const result = await getCollection(Collections.DESIGN_TEMPLATES).updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const updated = await getCollection(Collections.DESIGN_TEMPLATES).findOne({ _id: new ObjectId(id) });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const { id } = await params;
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
    }

    const result = await getCollection(Collections.DESIGN_TEMPLATES).deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete template" }, { status: 500 });
  }
}
