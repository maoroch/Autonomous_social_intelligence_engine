import { NextRequest, NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_URL ?? "http://localhost:4000";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const tenantId = searchParams.get("tenantId");

  try {
    const body = await req.json().catch(() => ({}));
    const res = await fetch(
      `${OPENCLAW_URL}/approval/runs/${runId}/restart`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, tenantId }),
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: "Failed to restart run" }));
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
