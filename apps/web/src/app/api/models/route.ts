import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const database = getDb();

  const models = database
    .prepare(
      `SELECT sm.*, fm.name AS finetune_model_name, fm.hf_repo
       FROM saved_models sm
       LEFT JOIN finetune_models fm ON sm.finetune_model_id = fm.id
       ORDER BY sm.created_at DESC`
    )
    .all();

  return NextResponse.json(models);
}
