import { NextResponse } from "next/server";
import { connectMongo, getCollection, Collections, type IndustryProfileDoc } from "@pipeline/shared/db";
import { DEFAULT_SOFTWARE_DEV_INDUSTRY_PROFILE } from "@pipeline/shared/schemas";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "linkedin_pipeline";

export async function GET(req: Request) {
  try {
    await connectMongo(MONGO_URI, MONGO_DB_NAME);
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }
    const profile = await getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES).findOne({ tenantId });
    const contentPillars = profile?.contentPillars?.length
      ? profile.contentPillars
      : DEFAULT_SOFTWARE_DEV_INDUSTRY_PROFILE.contentPillars;

    return NextResponse.json({
      verticalName: profile?.verticalName ?? "software-development",
      templateSetId: profile?.brandGuidelines?.templateSetId ?? "software-development",
      contentPillars,
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch tenant info" }, { status: 500 });
  }
}
