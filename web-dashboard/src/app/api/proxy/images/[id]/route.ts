import { NextRequest, NextResponse } from "next/server";

const OPENCLAW_URL = process.env.OPENCLAW_URL || "http://localhost:4000";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const response = await fetch(`${OPENCLAW_URL}/images/${id}`);

    if (!response.ok) {
      return new NextResponse("Image not found", { status: response.status });
    }

    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    return new NextResponse("Failed to fetch image", { status: 500 });
  }
}
