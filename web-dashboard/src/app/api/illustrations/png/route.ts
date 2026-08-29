import { NextResponse } from "next/server";
import { connectMongo, getCollection, Collections } from "@pipeline/shared/db";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "linkedin_pipeline";

/**
 * PNG-библиотека иллюстраций для нишевых вертикалей (Testo и будущие клиенты).
 * Полностью отдельная от SVG-библиотеки tech-портала (/api/illustrations) — как по коллекции
 * Mongo (png_illustrations vs svg_illustrations), так и по фильтрации (templateSetId), поэтому
 * данные никогда не пересекаются между порталами.
 */
export async function GET(req: Request) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const { searchParams } = new URL(req.url);
    const templateSetId = searchParams.get("templateSetId") || "industrial-measurement-equipment";
    const sets = [templateSetId];
    if (templateSetId.startsWith("testo-") || templateSetId === "industrial-measurement-equipment") {
      sets.push("industrial-measurement-equipment", "testo-brand-orange", "testo-pharma-compliance", "testo-pharma-audit", "testo-pharma-cold-chain");
    }
    const illustrations = await getCollection(Collections.PNG_ILLUSTRATIONS)
      .find({ templateSetId: { $in: sets } })
      .toArray();
    return NextResponse.json(illustrations);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch PNG illustrations" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const body = await req.json();
    if (!body.name || !body.base64Content || !body.templateSetId) {
      return NextResponse.json({ error: "name, base64Content and templateSetId are required" }, { status: 400 });
    }
    const result = await getCollection(Collections.PNG_ILLUSTRATIONS).insertOne({
      name: body.name,
      templateSetId: body.templateSetId,
      base64Content: body.base64Content,
    });
    return NextResponse.json({ _id: result.insertedId, ...body });
  } catch (err) {
    return NextResponse.json({ error: "Failed to upload PNG illustration" }, { status: 500 });
  }
}
