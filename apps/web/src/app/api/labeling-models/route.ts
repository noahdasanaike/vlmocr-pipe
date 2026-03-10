import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const models = db.prepare("SELECT m.*, p.name as provider_name, p.slug as provider_slug FROM eval_models m JOIN eval_providers p ON m.provider_id = p.id WHERE m.is_active = 1 ORDER BY p.name, m.name").all();
  return NextResponse.json(models);
}
