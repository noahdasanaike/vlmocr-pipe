import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const models = db.prepare("SELECT * FROM finetune_models WHERE is_active = 1").all();
  return NextResponse.json(models);
}
