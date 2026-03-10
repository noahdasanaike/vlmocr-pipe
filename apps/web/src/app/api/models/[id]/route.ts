import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deleteDirectory } from "@/lib/storage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const model = db.prepare("SELECT * FROM saved_models WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!model) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete adapter files from storage
  if (model.storage_path) {
    deleteDirectory(model.storage_path as string);
  }

  // Delete DB record
  db.prepare("DELETE FROM saved_models WHERE id = ?").run(id);

  return NextResponse.json({ ok: true });
}
