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
      return new NextResponse("File not found", { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // If a specific slide card index is requested from a ZIP archive
    if (fileIndex !== null) {
      try {
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries().sort((a, b) => a.entryName.localeCompare(b.entryName));
        
        const idx = parseInt(fileIndex, 10);
        if (!isNaN(idx) && idx >= 0 && idx < entries.length) {
          const targetEntry = entries[idx];
          const imageBuffer = targetEntry.getData();

          return new NextResponse(new Uint8Array(imageBuffer), {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          });
        }
      } catch (zipErr) {
        // If not a valid zip, fall through to direct stream
      }
    }

    const isZip = contentType.includes("zip") || contentType.includes("octet-stream");
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    };

    if (isZip) {
      headers["Content-Disposition"] = `attachment; filename="carousel_${id}.zip"`;
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error("Failed to proxy image:", error);
    return new NextResponse("Failed to load image", { status: 500 });
  }
}
