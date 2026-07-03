import { NextResponse } from "next/server";
import { db as dbHelper } from "@/lib/db";

interface ORModel {
  id: string;
  name?: string;
  context_length?: number | null;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[]; modality?: string };
}

/**
 * Live OpenRouter catalog, filtered to vision-capable models and normalized
 * to the shape eval_models wants (USD per 1M tokens). The /models endpoint is
 * public, but we send the saved key when present so rate limits are per-account.
 */
export async function GET() {
  try {
    const key = dbHelper.getSetting("OPENROUTER_API_KEY") || process.env.OPENROUTER_API_KEY || "";
    const headers: Record<string, string> = {};
    if (key) headers["Authorization"] = `Bearer ${key}`;

    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `OpenRouter returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { data?: ORModel[] };
    const models = (data.data ?? [])
      .filter((m: ORModel) => {
        const arch = m.architecture ?? {};
        const mods: string[] = arch.input_modalities ?? [];
        const modality: string = arch.modality ?? "";
        return (
          (Array.isArray(mods) && mods.includes("image")) ||
          String(modality).includes("image")
        );
      })
      .map((m: ORModel) => {
        const prompt = parseFloat(m.pricing?.prompt ?? "0") * 1_000_000;
        const completion = parseFloat(m.pricing?.completion ?? "0") * 1_000_000;
        return {
          api_model_id: m.id as string,
          name: (m.name as string) || (m.id as string),
          input_cost_per_1m: Number.isFinite(prompt) ? prompt : 0,
          output_cost_per_1m: Number.isFinite(completion) ? completion : 0,
          context_length: m.context_length ?? null,
        };
      })
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

    return NextResponse.json({ models });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch OpenRouter models" },
      { status: 500 }
    );
  }
}
