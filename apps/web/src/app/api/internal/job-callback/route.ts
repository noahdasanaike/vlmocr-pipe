import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Simple localhost-only guard: only accept requests from the local worker
function isLocalRequest(req: NextRequest): boolean {
  const forwarded = req.headers.get("x-forwarded-for");
  const host = req.headers.get("host") ?? "";
  // Accept if no proxy (direct local) or from localhost
  if (!forwarded) return true;
  const ip = forwarded.split(",")[0].trim();
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost" || host.startsWith("localhost");
}

export async function POST(req: NextRequest) {
  if (!isLocalRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { job_id, status, error_message, labeled_count, inferred_count } = body;

    if (!job_id) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }

    // Validate status if provided
    const validStatuses = ["pending", "uploading", "labeling", "training", "inferring", "complete", "failed", "cancelled", "paused"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }

    const db = getDb();

    // Verify job exists
    const job = db.prepare("SELECT id FROM jobs WHERE id = ?").get(job_id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

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
    if (typeof labeled_count === "number") {
      sets.push("labeled_count = ?");
      values.push(labeled_count);
    }
    if (typeof inferred_count === "number") {
      sets.push("inferred_count = ?");
      values.push(inferred_count);
    }
    if (status === "complete") {
      sets.push("completed_at = datetime('now')");
    }

    values.push(job_id);

    db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).run(...values);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
