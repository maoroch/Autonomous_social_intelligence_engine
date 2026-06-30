import { NextResponse } from "next/server";

const SERVICES = {
  openclaw: "http://openclaw:4000/health",
  "agent-trend": "http://agent-trend:4001/health",
  "agent-positioning": "http://agent-positioning:4002/health",
  "agent-strategy": "http://agent-strategy:4003/health",
  "agent-writing": "http://agent-writing:4004/health",
  "agent-design": "http://agent-design:4005/health",
  "agent-seo": "http://agent-seo:4006/health",
};

export async function GET() {
  const results: Record<string, boolean> = {};
  
  await Promise.all(
    Object.entries(SERVICES).map(async ([name, url]) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
        results[name] = res.ok;
      } catch {
        results[name] = false;
      }
    })
  );

  return NextResponse.json(results);
}
