import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

export async function GET() {
  try {
    const db = getDb();
    const jobs = db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all() as Record<string, unknown>[];

    for (const job of jobs) {
      // Parse JSON columns
      try { if (job.extraction_schema) job.extraction_schema = JSON.parse(job.extraction_schema as string); } catch { /* leave as string */ }
      try { if (job.model_config) job.model_config = JSON.parse(job.model_config as string); } catch { /* leave as string */ }

      // Join labeling_model
      if (job.labeling_model_id) {
        job.labeling_model = db.prepare("SELECT m.*, p.name as provider_name, p.slug as provider_slug FROM eval_models m JOIN eval_providers p ON m.provider_id = p.id WHERE m.id = ?").get(job.labeling_model_id) ?? null;
      } else {
        job.labeling_model = null;
      }

      // Join finetune_model
      if (job.finetune_model_id) {
        job.finetune_model = db.prepare("SELECT * FROM finetune_models WHERE id = ?").get(job.finetune_model_id) ?? null;
      } else {
        job.finetune_model = null;
      }
    }

    return NextResponse.json(jobs);
  } catch (err) {
    console.error("GET /api/jobs error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
  const body = await req.json();
  const {
    name,
    labeling_model_id,
    finetune_model_id,
    label_ratio,
    extraction_schema,
    mode = "full",
    eval_model_id = null,
    eval_model_api_id = null,
    eval_model_provider_slug = null,
    eval_model_provider_base_url = null,
    model_config = {},
  } = body;

  const db = getDb();
  const jobId = randomUUID();

  const labelCount = 0;
  const inferCount = 0;

  db.prepare(`
    INSERT INTO jobs (
      id, name, mode, labeling_model_id, finetune_model_id,
      label_ratio, extraction_schema, total_images, label_images, infer_images,
      eval_model_id, eval_model_api_id, eval_model_provider_slug, eval_model_provider_base_url,
      model_config, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', datetime('now'), datetime('now'))
  `).run(
    jobId,
    name,
    mode,
    mode === "inference_only" ? null : (labeling_model_id || null),
    mode === "inference_only" ? null : (finetune_model_id || null),
    mode === "inference_only" ? 0 : (label_ratio || 0),
    JSON.stringify(extraction_schema || {}),
    0,
    labelCount,
    inferCount,
    eval_model_id || null,
    eval_model_api_id || null,
    eval_model_provider_slug || null,
    eval_model_provider_base_url || null,
    JSON.stringify(model_config || {}),
  );

  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as Record<string, unknown>;
  if (job.extraction_schema) job.extraction_schema = JSON.parse(job.extraction_schema as string);

  const uploadPrefix = `jobs/${jobId}/images/`;

  return NextResponse.json({ job, uploadPrefix }, { status: 201 });
  } catch (err) {
    console.error("POST /api/jobs error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}
