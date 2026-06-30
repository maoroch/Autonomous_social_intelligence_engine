import { NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_URL ?? "http://localhost:4000";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(`${OPENCLAW_URL}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`OpenClaw responded with ${res.status}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
