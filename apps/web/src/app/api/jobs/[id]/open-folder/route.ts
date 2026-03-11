import { NextRequest, NextResponse } from "next/server";
import { STORAGE_DIR } from "@/lib/db";
import { join } from "path";
import { existsSync } from "fs";
import { exec } from "child_process";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobDir = join(STORAGE_DIR, "jobs", id);

  if (!existsSync(jobDir)) {
    return NextResponse.json(
      { error: "Job folder not found", path: jobDir },
      { status: 404 }
    );
  }

  // Open folder in OS file explorer
  const platform = process.platform;
  let cmd: string;
  if (platform === "win32") {
    cmd = `explorer "${jobDir.replace(/\//g, "\\")}"`;
  } else if (platform === "darwin") {
    cmd = `open "${jobDir}"`;
  } else {
    cmd = `xdg-open "${jobDir}"`;
  }

  return new Promise<NextResponse>((resolve) => {
    exec(cmd, (err) => {
      if (err) {
        // explorer returns exit code 1 even on success on Windows
        if (platform === "win32") {
          resolve(NextResponse.json({ ok: true, path: jobDir }));
        } else {
          resolve(
            NextResponse.json({ error: "Failed to open folder" }, { status: 500 })
          );
        }
      } else {
        resolve(NextResponse.json({ ok: true, path: jobDir }));
      }
    });
  });
}
