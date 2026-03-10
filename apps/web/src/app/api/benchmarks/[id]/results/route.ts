import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const results = db.prepare(
    "SELECT * FROM benchmark_results WHERE run_id = ? ORDER BY created_at"
  ).all(id) as Record<string, unknown>[];

  // Parse JSON columns
  for (const r of results) {
    if (r.predicted_result) r.predicted_result = JSON.parse(r.predicted_result as string);
    if (r.metadata) r.metadata = JSON.parse(r.metadata as string);
  }

  return NextResponse.json(results);
}
