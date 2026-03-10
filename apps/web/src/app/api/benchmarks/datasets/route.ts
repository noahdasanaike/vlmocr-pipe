import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

export async function GET() {
  const db = getDb();
  const datasets = db.prepare("SELECT * FROM benchmark_datasets ORDER BY created_at DESC").all();
  return NextResponse.json(datasets);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, job_id } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const db = getDb();
  const datasetId = randomUUID();

  // If creating from a job, read labeled images
  if (job_id) {
    const images = db.prepare(
      "SELECT id, filename, storage_path, gemini_label FROM images WHERE job_id = ? AND gemini_label IS NOT NULL"
    ).all(job_id) as { id: string; filename: string; storage_path: string; gemini_label: string }[];

    if (images.length === 0) {
      return NextResponse.json({ error: "No labeled images found in job" }, { status: 400 });
    }

    db.prepare(`
      INSERT INTO benchmark_datasets (id, name, description, sample_count, is_public, created_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'))
    `).run(datasetId, name, description || null, images.length);

    const insertSample = db.prepare(`
      INSERT INTO benchmark_samples (id, dataset_id, storage_path, filename, ground_truth, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const insertAll = db.transaction(() => {
      for (const img of images) {
        insertSample.run(
          randomUUID(),
          datasetId,
          img.storage_path,
          img.filename,
          img.gemini_label, // Already stored as JSON text in SQLite
          JSON.stringify({ dataset_source: "job", job_id }),
        );
      }
    });

    insertAll();

    return NextResponse.json({ id: datasetId, name, sample_count: images.length });
  }

  // Create empty dataset
  db.prepare(`
    INSERT INTO benchmark_datasets (id, name, description, sample_count, is_public, created_at)
    VALUES (?, ?, ?, 0, 0, datetime('now'))
  `).run(datasetId, name, description || null);

  return NextResponse.json({
    id: datasetId,
    name,
    description: description || null,
    sample_count: 0,
    is_public: false,
    created_at: new Date().toISOString(),
  });
}
