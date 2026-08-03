import { NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_URL ?? "http://localhost:4000";

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  const res = await fetch(
    `${OPENCLAW_URL}/approval/runs/${runId}/reject${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`,
    { method: "POST" }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to reject run" }, { status: res.status });
  }

  // Раньше здесь был редирект на /dashboard/runs/:runId — этот путь больше не существует
  // после перехода на изолированные tenant-порталы. Отдаём JSON, редирект делает клиент.
  return NextResponse.json({ ok: true });
}
