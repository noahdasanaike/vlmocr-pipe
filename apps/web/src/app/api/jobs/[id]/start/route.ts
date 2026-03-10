import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    // Validate job state
    const startable = ["uploading", "pending", "failed", "cancelled"];
    if (!startable.includes(job.status as string)) {
      return NextResponse.json({ error: `Cannot start job in ${job.status} state` }, { status: 400 });
    }

    // Register image records from the request body
    const body = await req.json().catch(() => ({}));
    const uploadedFiles: { path: string; filename: string; contentType: string }[] =
      body.files ?? [];

    const existingCount = (
      db.prepare("SELECT COUNT(*) as cnt FROM images WHERE job_id = ?").get(id) as { cnt: number }
    ).cnt;

    if (existingCount === 0 && uploadedFiles.length > 0) {
      const isInferenceOnly = job.mode === "inference_only";
      const labelCount = isInferenceOnly ? 0 : Math.ceil(uploadedFiles.length * (Number(job.label_ratio) || 0.3));

      const insertStmt = db.prepare(
        "INSERT INTO images (id, job_id, storage_path, filename, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
      );

      const insertMany = db.transaction((files: typeof uploadedFiles) => {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const role = isInferenceOnly ? "infer_target" : (i < labelCount ? "label_source" : "infer_target");
          insertStmt.run(
            randomUUID(),
            id,
            f.path,
            f.filename,
            role,
          );
        }
      });

      insertMany(uploadedFiles);
    }

    // Count total images
    const totalImages = (
      db.prepare("SELECT COUNT(*) as cnt FROM images WHERE job_id = ?").get(id) as { cnt: number }
    ).cnt;

    if (totalImages === 0) {
      return NextResponse.json({ error: "No images in job. Upload images first." }, { status: 400 });
    }

    const isInferenceOnly = job.mode === "inference_only";
    const labelCount = isInferenceOnly ? 0 : Math.ceil(totalImages * (Number(job.label_ratio) || 0.3));

    // Update status to pending — worker polls DB for pending jobs
    db.prepare(`
      UPDATE jobs SET
        status = 'pending',
        total_images = ?,
        label_images = ?,
        infer_images = ?,
        started_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(totalImages, labelCount, totalImages - labelCount, id);

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (err) {
    console.error("POST /api/jobs/[id]/start error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
