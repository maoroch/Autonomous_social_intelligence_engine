import { NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_URL ?? "http://localhost:4000";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const body = await req.json().catch(() => ({}));

    const res = await fetch(`${OPENCLAW_URL}/approval/runs/${runId}/redesign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, tenantId }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `OpenClaw responded with ${res.status}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
