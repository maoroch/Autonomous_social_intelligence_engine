import { NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_URL ?? "http://localhost:4000";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const body = await req.json();

    const res = await fetch(`${OPENCLAW_URL}/approval/runs/${runId}/reprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`OpenClaw responded with ${res.status}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
