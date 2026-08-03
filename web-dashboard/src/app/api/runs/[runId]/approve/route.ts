import { NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_URL ?? "http://localhost:4000";

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (e) {
    // ignore
  }

  const res = await fetch(`${OPENCLAW_URL}/approval/runs/${runId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, tenantId }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return new NextResponse(errText, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
