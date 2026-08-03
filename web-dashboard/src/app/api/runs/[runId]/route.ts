import { NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_URL ?? "http://localhost:4000";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const url = tenantId
      ? `${OPENCLAW_URL}/approval/runs/${runId}?tenantId=${encodeURIComponent(tenantId)}`
      : `${OPENCLAW_URL}/approval/runs/${runId}`;
    const res = await fetch(url, {
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
