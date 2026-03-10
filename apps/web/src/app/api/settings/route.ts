import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const settings = db.getAllSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { key, value } = body as { key: string; value: string };

  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value are required" }, { status: 400 });
  }

  db.setSetting(key, value);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { key } = body as { key: string };

  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  db.deleteSetting(key);
  return NextResponse.json({ ok: true });
}
