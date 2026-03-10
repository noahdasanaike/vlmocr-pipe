import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const images = db.prepare("SELECT * FROM images WHERE job_id = ? ORDER BY created_at").all(id);

  // Parse JSON fields
  const parsed = (images as Record<string, unknown>[]).map((img) => ({
    ...img,
    gemini_label: img.gemini_label ? JSON.parse(img.gemini_label as string) : null,
    predicted_result: img.predicted_result ? JSON.parse(img.predicted_result as string) : null,
  }));

  return NextResponse.json(parsed);
}
