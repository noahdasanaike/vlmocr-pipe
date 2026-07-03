import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb, db as dbHelper } from "@/lib/db";

export async function GET() {
  const db = getDb();

  const models = db.prepare("SELECT * FROM eval_models ORDER BY name").all() as Record<string, unknown>[];
  const providers = db.prepare("SELECT * FROM eval_providers ORDER BY name").all() as Record<string, unknown>[];

  // Parse config JSON for each model
  for (const m of models) {
    if (m.config) m.config = JSON.parse(m.config as string);
  }

  // Check which providers have API keys configured. The setting name per
  // provider must match the worker's evaluator (_get_api_key) and the Settings
  // UI — not a lowercased `${slug}_api_key` guess (which misses GEMINI_API_KEY,
  // REPLICATE_API_TOKEN, and the correct casing entirely).
  const KEY_BY_SLUG: Record<string, string> = {
    openrouter: "OPENROUTER_API_KEY",
    deepinfra: "DEEPINFRA_API_KEY",
    novita: "NOVITA_API_KEY",
    dashscope: "DASHSCOPE_API_KEY",
    replicate: "REPLICATE_API_TOKEN",
    google: "GEMINI_API_KEY",
    qubrid: "QUBRID_API_KEY",
    zenmux: "ZENMUX_API_KEY",
    ollama: "OLLAMA_API_KEY",
    vllm: "VLLM_API_KEY",
  };
  for (const p of providers) {
    const slug = p.slug as string;
    // Local providers don't need a key to be usable.
    if (slug === "ollama" || slug === "vllm") {
      p.has_api_key = true;
      continue;
    }
    const settingKey = KEY_BY_SLUG[slug] ?? `${slug.toUpperCase()}_API_KEY`;
    p.has_api_key = !!(dbHelper.getSetting(settingKey) || process.env[settingKey]);
  }

  return NextResponse.json({ models, providers });
}

/**
 * Register a new inference model. Defaults to the OpenRouter provider (the
 * common case: any of OpenRouter's vision models), but accepts an explicit
 * provider_slug for the other configured providers. Pricing is per 1M tokens.
 */
export async function POST(req: NextRequest) {
  const db = getDb();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiModelId = String(body.api_model_id ?? "").trim();
  if (!apiModelId) {
    return NextResponse.json({ error: "api_model_id is required" }, { status: 400 });
  }

  const providerSlug = String(body.provider_slug ?? "openrouter").trim();
  const provider = db
    .prepare("SELECT id FROM eval_providers WHERE slug = ?")
    .get(providerSlug) as { id: string } | undefined;
  if (!provider) {
    return NextResponse.json(
      { error: `Unknown provider "${providerSlug}"` },
      { status: 400 }
    );
  }

  // Don't add the same model twice for a provider.
  const existing = db
    .prepare("SELECT id, name FROM eval_models WHERE provider_id = ? AND api_model_id = ?")
    .get(provider.id, apiModelId) as { id: string; name: string } | undefined;
  if (existing) {
    return NextResponse.json(
      { error: `"${existing.name}" is already in your models`, id: existing.id },
      { status: 409 }
    );
  }

  const id = `custom-${randomUUID()}`;
  const name = (String(body.name ?? "").trim()) || apiModelId;
  const config =
    body.config && typeof body.config === "object"
      ? JSON.stringify(body.config)
      : "{}";

  db.prepare(
    `INSERT INTO eval_models
       (id, provider_id, name, api_model_id, cost_per_image_credits,
        input_cost_per_1m, output_cost_per_1m, tokens_per_image, config, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    id,
    provider.id,
    name,
    apiModelId,
    1,
    Number(body.input_cost_per_1m) || 0,
    Number(body.output_cost_per_1m) || 0,
    Number(body.tokens_per_image) || 1200,
    config
  );

  const model = db.prepare("SELECT * FROM eval_models WHERE id = ?").get(id) as Record<string, unknown>;
  if (model.config) model.config = JSON.parse(model.config as string);
  return NextResponse.json({ model }, { status: 201 });
}

/**
 * Remove a user-added model. Only the models registered through this API
 * (id prefixed "custom-") can be removed; the seeded catalog is protected.
 */
export async function DELETE(req: NextRequest) {
  const db = getDb();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!id.startsWith("custom-")) {
    return NextResponse.json(
      { error: "Only models you added can be removed" },
      { status: 403 }
    );
  }
  try {
    const info = db.prepare("DELETE FROM eval_models WHERE id = ?").run(id);
    if (info.changes === 0) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }
  } catch {
    // FK constraint: the model is referenced by an existing job.
    return NextResponse.json(
      { error: "This model is used by an existing job and can't be removed" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
