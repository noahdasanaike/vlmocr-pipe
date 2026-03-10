import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const job = db.prepare("SELECT extraction_schema FROM jobs WHERE id = ?").get(id) as { extraction_schema: string } | undefined;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const schema = JSON.parse(job.extraction_schema || "{}") as Record<string, string>;

  const images = db.prepare(
    "SELECT * FROM images WHERE job_id = ? ORDER BY created_at"
  ).all(id) as Record<string, unknown>[];

  const format = req.nextUrl.searchParams.get("format");

  const results = images
    .filter((img) => img.predicted_result || img.gemini_label)
    .map((img) => {
      const predicted = img.predicted_result ? JSON.parse(img.predicted_result as string) : null;
      const gemini = img.gemini_label ? JSON.parse(img.gemini_label as string) : null;
      return {
        filename: img.filename,
        source: img.role === "label_source" ? "gemini" : "model",
        ...(predicted ?? gemini ?? {}),
      };
    });

  if (format === "csv") {
    const fields = Object.keys(schema);
    const header = ["filename", "source", ...fields].join(",");
    const rows = results.map((r) =>
      ["filename", "source", ...fields]
        .map((f) => {
          const val = String((r as Record<string, unknown>)[f] ?? "");
          return val.includes(",") ? `"${val.replace(/"/g, '""')}"` : val;
        })
        .join(",")
    );
    const csv = [header, ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="job-${id}-results.csv"`,
      },
    });
  }

  return NextResponse.json(results);
}
