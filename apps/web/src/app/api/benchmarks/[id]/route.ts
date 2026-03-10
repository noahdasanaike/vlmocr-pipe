import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const run = db.prepare("SELECT * FROM benchmark_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Join dataset
  if (run.dataset_id) {
    run.dataset = db.prepare("SELECT * FROM benchmark_datasets WHERE id = ?").get(run.dataset_id) ?? null;
  } else {
    run.dataset = null;
  }

  // Join run_models
  const runModels = db.prepare(
    "SELECT * FROM benchmark_run_models WHERE run_id = ?"
  ).all(id) as Record<string, unknown>[];

  for (const rm of runModels) {
    const model = db.prepare("SELECT * FROM eval_models WHERE id = ?").get(rm.model_id) as Record<string, unknown> | undefined;
    if (model) {
      model.provider = db.prepare("SELECT * FROM eval_providers WHERE id = ?").get(model.provider_id) ?? null;
      if (model.config) model.config = JSON.parse(model.config as string);
    }
    rm.model = model ?? null;
  }
  run.run_models = runModels;

  return NextResponse.json(run);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const run = db.prepare("SELECT id FROM benchmark_runs WHERE id = ?").get(id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  db.prepare("UPDATE benchmark_runs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
