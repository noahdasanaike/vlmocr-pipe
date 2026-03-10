import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { saveFile, contentTypeFor } from "@/lib/storage";
import { randomUUID } from "crypto";
import JSZip from "jszip";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const zipFile = formData.get("file") as File | null;

  if (!zipFile) {
    return NextResponse.json({ error: "ZIP file is required" }, { status: 400 });
  }

  const zipBuffer = Buffer.from(await zipFile.arrayBuffer());
  const zip = await JSZip.loadAsync(zipBuffer);

  // Look for manifest.json
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    return NextResponse.json(
      { error: "ZIP must contain a manifest.json at root" },
      { status: 400 }
    );
  }

  const manifest = JSON.parse(await manifestFile.async("string")) as {
    name: string;
    description?: string;
    samples: Array<{
      filename: string;
      ground_truth: string;
      metadata?: Record<string, string>;
    }>;
  };

  if (!manifest.name || !manifest.samples?.length) {
    return NextResponse.json(
      { error: "manifest.json must have name and samples[]" },
      { status: 400 }
    );
  }

  const db = getDb();
  const datasetId = randomUUID();

  db.prepare(`
    INSERT INTO benchmark_datasets (id, name, description, sample_count, is_public, created_at)
    VALUES (?, ?, ?, ?, 0, datetime('now'))
  `).run(datasetId, manifest.name, manifest.description ?? null, manifest.samples.length);

  // Upload images and create sample rows
  let uploaded = 0;
  const insertSample = db.prepare(`
    INSERT INTO benchmark_samples (id, dataset_id, storage_path, filename, ground_truth, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const sample of manifest.samples) {
    const imageFile = zip.file(sample.filename);
    if (!imageFile) continue;

    const imageBytes = await imageFile.async("nodebuffer");
    const storagePath = `benchmarks/${datasetId}/${sample.filename}`;

    saveFile(storagePath, imageBytes);

    insertSample.run(
      randomUUID(),
      datasetId,
      storagePath,
      sample.filename,
      sample.ground_truth,
      JSON.stringify(sample.metadata ?? {}),
    );

    uploaded++;
  }

  return NextResponse.json({
    dataset_id: datasetId,
    name: manifest.name,
    samples_uploaded: uploaded,
  });
}
