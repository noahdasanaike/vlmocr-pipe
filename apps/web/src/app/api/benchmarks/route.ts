import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

export async function GET() {
  const db = getDb();
  const runs = db.prepare("SELECT * FROM benchmark_runs ORDER BY created_at DESC").all() as Record<string, unknown>[];

  // Join dataset info
  for (const run of runs) {
    if (run.dataset_id) {
      run.dataset = db.prepare("SELECT * FROM benchmark_datasets WHERE id = ?").get(run.dataset_id) ?? null;
    } else {
      run.dataset = null;
    }
    // Join run_models
    const runModels = db.prepare(
      "SELECT * FROM benchmark_run_models WHERE run_id = ?"
    ).all(run.id) as Record<string, unknown>[];

    for (const rm of runModels) {
      const model = db.prepare("SELECT * FROM eval_models WHERE id = ?").get(rm.model_id) as Record<string, unknown> | undefined;
      if (model) {
        model.provider = db.prepare("SELECT * FROM eval_providers WHERE id = ?").get(model.provider_id) ?? null;
        if (model.config) model.config = JSON.parse(model.config as string);
      }
      rm.model = model ?? null;
    }
    run.run_models = runModels;
  }

  return NextResponse.json(runs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, dataset_id, model_ids } = body;

  if (!name || !dataset_id || !model_ids?.length) {
    return NextResponse.json(
      { error: "name, dataset_id, and model_ids[] are required" },
      { status: 400 }
    );
  }

  const db = getDb();

  const dataset = db.prepare("SELECT * FROM benchmark_datasets WHERE id = ?").get(dataset_id) as Record<string, unknown> | undefined;
  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  const runId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO benchmark_runs (id, name, dataset_id, status, total_samples, completed_samples, error_message, started_at, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, 0, NULL, NULL, NULL, ?, ?)
  `).run(runId, name, dataset_id, dataset.sample_count, now, now);

  // Create run_models entries
  const insertRunModel = db.prepare(`
    INSERT INTO benchmark_run_models (id, run_id, model_id, status, completed_samples, error_count, avg_nes, avg_cer, avg_f1, avg_latency_ms, created_at)
    VALUES (?, ?, ?, 'pending', 0, 0, NULL, NULL, NULL, NULL, ?)
  `);

  const runModels: Record<string, unknown>[] = [];

  const insertAll = db.transaction((mids: string[]) => {
    for (const mid of mids) {
      const rmId = randomUUID();
      insertRunModel.run(rmId, runId, mid, now);

      const model = db.prepare("SELECT * FROM eval_models WHERE id = ?").get(mid) as Record<string, unknown> | undefined;
      if (model) {
        const provider = db.prepare("SELECT * FROM eval_providers WHERE id = ?").get(model.provider_id) ?? null;
        if (model.config) model.config = JSON.parse(model.config as string);
        model.provider = provider;
      }

      runModels.push({
        id: rmId,
        run_id: runId,
        model_id: mid,
        status: "pending",
        completed_samples: 0,
        error_count: 0,
        avg_nes: null,
        avg_cer: null,
        avg_f1: null,
        avg_latency_ms: null,
        created_at: now,
        model: model ?? null,
      });
    }
  });

  insertAll(model_ids);

  const run = {
    id: runId,
    name,
    dataset_id,
    status: "pending",
    total_samples: dataset.sample_count,
    completed_samples: 0,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    dataset,
    run_models: runModels,
  };

  return NextResponse.json(run);
}
