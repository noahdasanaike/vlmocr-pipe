import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();

    // Get distinct schemas from previous jobs
    const rows = db
      .prepare(
        `SELECT DISTINCT j.name, j.extraction_schema
         FROM jobs j
         WHERE j.extraction_schema IS NOT NULL
         ORDER BY j.created_at DESC
         LIMIT 20`
      )
      .all() as { name: string; extraction_schema: string }[];

    const schemas = rows
      .map((r) => {
        try {
          const parsed =
            typeof r.extraction_schema === "string"
              ? JSON.parse(r.extraction_schema)
              : r.extraction_schema;
          if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
            return { jobName: r.name, schema: parsed };
          }
        } catch {
          /* skip */
        }
        return null;
      })
      .filter(Boolean);

    // Deduplicate by schema content
    const seen = new Set<string>();
    const unique = schemas.filter((s) => {
      const key = JSON.stringify(s!.schema);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json(unique);
  } catch (err) {
    console.error("GET /api/jobs/schemas error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
