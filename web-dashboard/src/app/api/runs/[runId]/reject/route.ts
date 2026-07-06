import { NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_URL ?? "http://localhost:4000";

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  await fetch(`${OPENCLAW_URL}/approval/runs/${runId}/reject`, { method: "POST" });
  return NextResponse.redirect(new URL(`/dashboard/runs/${runId}`, req.url));
}
