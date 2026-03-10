import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getFileUrl } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const image = db.prepare("SELECT storage_path FROM images WHERE id = ?").get(id) as { storage_path: string } | undefined;
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ signed_url: getFileUrl(image.storage_path) });
}
