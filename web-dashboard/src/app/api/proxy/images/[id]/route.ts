import { NextRequest, NextResponse } from "next/server";
import AdmZip from "adm-zip";

const OPENCLAW_URL = process.env.OPENCLAW_URL || "http://localhost:4000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = req.nextUrl.searchParams;
  const fileIndex = searchParams.get("index"); // 0-based index of the card inside the zip

  try {
    const response = await fetch(`${OPENCLAW_URL}/images/${id}`);
    if (!response.ok) {
      return new NextResponse("ZIP file not found", { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // If no index specified, return the ZIP file as-is
    if (fileIndex === null) {
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="carousel_${id}.zip"`,
        },
      });
    }

    // Otherwise, parse ZIP and extract the specific slide card PNG
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries().sort((a, b) => a.entryName.localeCompare(b.entryName));
    
    const idx = parseInt(fileIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= entries.length) {
      return new NextResponse("Index out of bounds", { status: 400 });
    }

    const targetEntry = entries[idx];
    const imageBuffer = targetEntry.getData();

    return new NextResponse(new Uint8Array(imageBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("Failed to extract card from zip:", error);
    return new NextResponse("Failed to extract image from zip archive", { status: 500 });
  }
}
