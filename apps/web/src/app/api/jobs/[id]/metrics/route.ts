import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Accept a ground truth CSV upload (filename,ground_truth per row).
 * Compute NES and CER for each image that has a predicted_result.
 * Store ground_truth, nes, cer in the images table.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const job = db.prepare("SELECT id, status FROM jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Parse CSV from request body
  const formData = await req.formData();
  const csvFile = formData.get("file") as File | null;

  if (!csvFile) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  }

  const csvText = await csvFile.text();
  const lines = csvText.trim().split("\n");

  // Parse CSV: filename,ground_truth (skip header if present)
  const gtMap = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const commaIdx = line.indexOf(",");
    if (commaIdx === -1) continue;

    let filename = line.substring(0, commaIdx).trim();
    let gt = line.substring(commaIdx + 1).trim();

    // Remove quotes
    if (filename.startsWith('"') && filename.endsWith('"')) {
      filename = filename.slice(1, -1);
    }
    if (gt.startsWith('"') && gt.endsWith('"')) {
      gt = gt.slice(1, -1).replace(/""/g, '"');
    }

    // Skip header row
    if (i === 0 && (filename.toLowerCase() === "filename" || filename.toLowerCase() === "file")) {
      continue;
    }

    gtMap.set(filename, gt);
  }

  if (gtMap.size === 0) {
    return NextResponse.json({ error: "No valid rows found in CSV" }, { status: 400 });
  }

  // Get all images for this job
  const images = db.prepare(
    "SELECT id, filename, predicted_result FROM images WHERE job_id = ?"
  ).all(id) as { id: string; filename: string; predicted_result: string | null }[];

  if (!images.length) {
    return NextResponse.json({ error: "No images found" }, { status: 404 });
  }

  // Compute metrics for each matched image
  let matched = 0;
  let totalNes = 0;
  let totalCer = 0;

  const updateStmt = db.prepare(
    "UPDATE images SET ground_truth = ?, nes = ?, cer = ? WHERE id = ?"
  );

  const computeAll = db.transaction(() => {
    for (const img of images) {
      const gt = gtMap.get(img.filename);
      if (gt === undefined) continue;

      const parsedResult = img.predicted_result ? JSON.parse(img.predicted_result) : {};
      const pred = Object.values(parsedResult).join(" ");

      const nes = computeNes(pred, gt);
      const cer = computeCer(pred, gt);

      updateStmt.run(gt, nes, cer, img.id);

      matched++;
      totalNes += nes;
      totalCer += cer;
    }
  });

  computeAll();

  return NextResponse.json({
    matched,
    total_images: images.length,
    avg_nes: matched > 0 ? totalNes / matched : null,
    avg_cer: matched > 0 ? totalCer / matched : null,
  });
}

// Simple Levenshtein distance
function editDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (s1[i - 1] === s2[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[n];
}

function computeNes(pred: string, gt: string): number {
  if (!pred && !gt) return 1.0;
  const d = editDistance(pred, gt);
  return 1.0 - d / Math.max(pred.length, gt.length);
}

function computeCer(pred: string, gt: string): number {
  if (!gt) return pred ? 1.0 : 0.0;
  return editDistance(pred, gt) / gt.length;
}
