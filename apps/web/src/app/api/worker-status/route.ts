import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const heartbeat = db.getSetting("WORKER_HEARTBEAT");
  if (!heartbeat) {
    return NextResponse.json({ alive: false, lastSeen: null });
  }

  const lastSeen = new Date(heartbeat + "Z");
  const ageMs = Date.now() - lastSeen.getTime();
  const alive = ageMs < 30_000; // Consider alive if heartbeat within 30s

  return NextResponse.json({ alive, lastSeen: lastSeen.toISOString(), ageMs });
}
