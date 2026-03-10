import { NextRequest, NextResponse } from "next/server";
import { readFile, fileExists, contentTypeFor } from "@/lib/storage";
import { resolve, normalize } from "path";
import { STORAGE_DIR } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const storagePath = path.join("/");

  // Prevent path traversal — resolved path must stay within STORAGE_DIR
  const resolvedPath = resolve(STORAGE_DIR, normalize(storagePath));
  if (!resolvedPath.startsWith(resolve(STORAGE_DIR))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
