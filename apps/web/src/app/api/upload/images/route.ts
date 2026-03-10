import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { saveFile, contentTypeFor } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const jobId = formData.get("jobId") as string;
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

  // Verify job exists
  const db = getDb();
  const job = db.prepare("SELECT id FROM jobs WHERE id = ?").get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const uploaded: { path: string; filename: string; contentType: string }[] = [];
  let idx = 0;

  for (const [key, value] of formData.entries()) {
    if (key === "images" && value instanceof File) {
      const buffer = Buffer.from(await value.arrayBuffer());
      const safeName = value.name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 200);
      const storagePath = `jobs/${jobId}/images/${idx}_${safeName}`;
      const ct = contentTypeFor(value.name);
      saveFile(storagePath, buffer);
      uploaded.push({ path: storagePath, filename: value.name, contentType: ct });
      idx++;
    }
  }

  return NextResponse.json({ files: uploaded, count: uploaded.length });
}
