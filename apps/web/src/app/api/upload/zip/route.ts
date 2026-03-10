import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { saveFile, contentTypeFor } from "@/lib/storage";
import JSZip from "jszip";

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp", ".bmp",
]);

function isImage(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  return IMAGE_EXTENSIONS.has(ext);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const jobId = formData.get("jobId") as string | null;

  if (!file || !jobId) {
    return NextResponse.json(
      { error: "Missing file or jobId" },
      { status: 400 }
    );
  }

  const db = getDb();

  // Verify job exists
  const job = db.prepare("SELECT id FROM jobs WHERE id = ?").get(jobId) as { id: string } | undefined;
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const zip = await JSZip.loadAsync(buffer);

  const imageEntries: { name: string; file: JSZip.JSZipObject }[] = [];
  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    // Skip __MACOSX and hidden files
    if (relativePath.startsWith("__MACOSX/") || relativePath.includes("/._")) return;
    const basename = relativePath.split("/").pop() ?? relativePath;
    if (isImage(basename)) {
      imageEntries.push({ name: basename, file: zipEntry });
    }
  });

  if (imageEntries.length === 0) {
    return NextResponse.json(
      { error: "No image files found in ZIP" },
      { status: 400 }
    );
  }

  // Save each image to local storage
  const uploaded: { path: string; filename: string; contentType: string }[] = [];
  const BATCH = 20;

  for (let i = 0; i < imageEntries.length; i += BATCH) {
    const batch = imageEntries.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (entry, localIdx) => {
        const idx = i + localIdx;
        const imageBuffer = await entry.file.async("nodebuffer");
        const safeName = entry.name
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .substring(0, 200);
        const storagePath = `jobs/${jobId}/images/${idx}_${safeName}`;
        const ct = contentTypeFor(entry.name);

        saveFile(storagePath, imageBuffer);

        uploaded[idx] = {
          path: storagePath,
          filename: entry.name,
          contentType: ct,
        };
      })
    );
  }

  return NextResponse.json({
    files: uploaded,
    count: uploaded.length,
  });
}
