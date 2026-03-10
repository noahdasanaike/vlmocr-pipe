import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    // Get all run_models for this benchmark run, then get their results
    const runModels = db.prepare(
      "SELECT id FROM benchmark_run_models WHERE run_id = ?"
    ).all(id) as { id: string }[];

    if (runModels.length === 0) {
      return NextResponse.json([]);
    }

    const runModelIds = runModels.map((rm) => rm.id);
    const placeholders = runModelIds.map(() => "?").join(", ");

    const results = db.prepare(
      `SELECT br.*, bs.metadata as sample_metadata
       FROM benchmark_results br
       LEFT JOIN benchmark_samples bs ON br.sample_id = bs.id
       WHERE br.run_model_id IN (${placeholders})
       ORDER BY br.created_at`
    ).all(...runModelIds) as Record<string, unknown>[];

    // Parse JSON columns safely
    for (const r of results) {
      if (r.sample_metadata) {
        try { r.sample_metadata = JSON.parse(r.sample_metadata as string); } catch { /* leave as string */ }
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error("Benchmark results error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
