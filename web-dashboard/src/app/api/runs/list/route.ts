import { NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_URL ?? "http://localhost:4000";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const url = status 
      ? `${OPENCLAW_URL}/approval/runs?status=${status}`
      : `${OPENCLAW_URL}/approval/runs`;
      
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`OpenClaw responded with ${res.status}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
