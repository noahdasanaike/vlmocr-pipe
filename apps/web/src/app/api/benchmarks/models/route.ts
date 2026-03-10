import { NextResponse } from "next/server";
import { getDb, db as dbHelper } from "@/lib/db";

export async function GET() {
  const db = getDb();

  const models = db.prepare("SELECT * FROM eval_models ORDER BY name").all() as Record<string, unknown>[];
  const providers = db.prepare("SELECT * FROM eval_providers ORDER BY name").all() as Record<string, unknown>[];

  // Parse config JSON for each model
  for (const m of models) {
    if (m.config) m.config = JSON.parse(m.config as string);
  }

  // Check which providers have API keys configured
  for (const p of providers) {
    const slug = p.slug as string;
    const settingKey = `${slug}_api_key`;
    const hasKey = !!(dbHelper.getSetting(settingKey) || process.env[`${slug.toUpperCase()}_API_KEY`]);
    p.has_api_key = hasKey;
  }

  return NextResponse.json({ models, providers });
}
