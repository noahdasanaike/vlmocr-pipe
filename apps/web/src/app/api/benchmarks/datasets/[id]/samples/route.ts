import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getFileUrl } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1");
  const perPage = Math.min(parseInt(req.nextUrl.searchParams.get("per_page") ?? "50"), 100);
  const offset = (page - 1) * perPage;

  const totalRow = db.prepare(
    "SELECT COUNT(*) as cnt FROM benchmark_samples WHERE dataset_id = ?"
  ).get(id) as { cnt: number };
  const total = totalRow.cnt;

  const samples = db.prepare(
    "SELECT * FROM benchmark_samples WHERE dataset_id = ? ORDER BY created_at LIMIT ? OFFSET ?"
  ).all(id, perPage, offset) as Record<string, unknown>[];

  // Add local file URLs and parse JSON columns
  for (const s of samples) {
    s.signed_url = getFileUrl(s.storage_path as string);
    if (s.ground_truth && typeof s.ground_truth === "string") {
      try { s.ground_truth = JSON.parse(s.ground_truth); } catch { /* keep as string */ }
    }
    if (s.metadata && typeof s.metadata === "string") {
      try { s.metadata = JSON.parse(s.metadata); } catch { /* keep as string */ }
    }
  }

  return NextResponse.json({
    samples,
    total,
    page,
    per_page: perPage,
  });
}
