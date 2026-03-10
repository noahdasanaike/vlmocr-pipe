import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { job_id, status, error_message, labeled_count, inferred_count } = body;

  if (!job_id) {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }

  const db = getDb();

  // Build dynamic update
  const sets: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];

  if (status) {
    sets.push("status = ?");
    values.push(status);
  }
  if (error_message !== undefined) {
    sets.push("error_message = ?");
    values.push(error_message);
  }
  if (labeled_count !== undefined) {
    sets.push("labeled_count = ?");
    values.push(labeled_count);
  }
  if (inferred_count !== undefined) {
    sets.push("inferred_count = ?");
    values.push(inferred_count);
  }
  if (status === "complete") {
    sets.push("completed_at = datetime('now')");
  }

  values.push(job_id);

  db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).run(...values);

  return NextResponse.json({ ok: true });
}
