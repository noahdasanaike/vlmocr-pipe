import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { settingKey, testUrl } = await req.json();

    if (!settingKey || !testUrl) {
      return NextResponse.json({ ok: false, error: "Missing parameters" }, { status: 400 });
    }

    // Get the actual (unmasked) key from DB
    const apiKey = db.getSetting(settingKey);
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "No key saved" });
    }

    // Try calling the models endpoint with this key
    const res = await fetch(testUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      return NextResponse.json({ ok: true });
    }

    const status = res.status;
    if (status === 401 || status === 403) {
      return NextResponse.json({ ok: false, error: "Invalid or expired key" });
    }

    return NextResponse.json({ ok: false, error: `Provider returned ${status}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg });
  }
}
