import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deleteDirectory } from "@/lib/storage";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();
  const { action } = body;

  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "pause") {
    // Can only pause active jobs
    const pauseable = ["labeling", "inferring", "pending"];
    if (!pauseable.includes(job.status as string)) {
      return NextResponse.json({ error: `Cannot pause job in ${job.status} state` }, { status: 400 });
    }
    // Store the previous status so we can resume to it
    db.prepare("UPDATE jobs SET status = 'paused', error_message = ?, updated_at = datetime('now') WHERE id = ?")
      .run(`paused_from:${job.status}`, id);
    return NextResponse.json({ ok: true });
  }

  if (action === "resume") {
    if (job.status !== "paused") {
      return NextResponse.json({ error: "Job is not paused" }, { status: 400 });
    }
    // Restore to pending so the worker picks it up and resumes (it skips completed images)
    db.prepare("UPDATE jobs SET status = 'pending', error_message = NULL, updated_at = datetime('now') WHERE id = ?")
      .run(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Parse JSON columns
  if (job.extraction_schema) job.extraction_schema = JSON.parse(job.extraction_schema as string);

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

  return NextResponse.json(job);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const purge = searchParams.get("purge") === "true";

  if (purge) {
    // Delete all storage files for this job
    deleteDirectory(`jobs/${id}`);

    // Hard delete job (images cascade via FK)
    db.prepare("DELETE FROM images WHERE job_id = ?").run(id);
    db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  } else {
    // Soft cancel
    db.prepare("UPDATE jobs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(id);
  }

  return NextResponse.json({ ok: true });
}
