import { NextRequest, NextResponse } from "next/server";
import { readFile, fileExists, contentTypeFor } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const storagePath = path.join("/");

  if (!fileExists(storagePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = readFile(storagePath);
  const ct = contentTypeFor(storagePath);

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
