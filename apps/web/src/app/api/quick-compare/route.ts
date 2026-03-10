import { NextRequest, NextResponse } from "next/server";
import { getDb, db as dbHelper } from "@/lib/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function getProviderApiKey(slug: string): string | null {
  // Check DB settings first, then fall back to env vars
  const settingKey = `${slug}_api_key`;
  const fromDb = dbHelper.getSetting(settingKey);
  if (fromDb) return fromDb;

  const envMap: Record<string, string> = {
    openrouter: "OPENROUTER_API_KEY",
    deepinfra: "DEEPINFRA_API_KEY",
    novita: "NOVITA_API_KEY",
    dashscope: "DASHSCOPE_API_KEY",
    google: "GEMINI_API_KEY",
  };
  const envKey = envMap[slug];
  return envKey ? (process.env[envKey] ?? null) : null;
}

function buildPayload(
  modelApiId: string,
  providerSlug: string,
  dataUri: string,
  prompt: string,
) {
  const messages = [
    {
      role: "user" as const,
      content: [
        { type: "image_url" as const, image_url: { url: dataUri } },
        { type: "text" as const, text: prompt },
      ],
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = {
    model: modelApiId,
    max_tokens: 512,
    messages,
    temperature: 0,
  };

  if (providerSlug === "openrouter") {
    if (modelApiId.includes("gemini-3") && !modelApiId.includes("image-preview")) {
      payload.reasoning = { effort: "low" };
      payload.max_tokens = 8192;
    }
    if (modelApiId.includes("gpt-5") || modelApiId.includes("o3") || modelApiId.includes("o4")) {
      payload.reasoning_effort = "low";
    }
    if (modelApiId.includes("qwen3.5")) {
      payload.transforms = ["no-thinking"];
      payload.max_tokens = 4096;
    }
  } else if (providerSlug === "novita") {
    payload.max_tokens = 4096;
    if (modelApiId.includes("qwen3.5")) {
      payload.chat_template_kwargs = { enable_thinking: false };
    }
  } else if (providerSlug === "dashscope") {
    if (modelApiId === "qwen-vl-ocr") {
      messages[0].content = [
        { type: "image_url" as const, image_url: { url: dataUri }, min_pixels: 3072, max_pixels: 8388608 } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        { type: "text" as const, text: prompt },
      ];
      payload.max_tokens = 4096;
    } else if (modelApiId.includes("qwen3.5")) {
      payload.enable_thinking = false;
      payload.max_tokens = 4096;
    }
  } else if (providerSlug === "deepinfra") {
    if (modelApiId.includes("qwen3.5")) {
      payload.chat_template_kwargs = { enable_thinking: false };
    }
  }

  return payload;
}

/** Extract just the JSON string from a model response that may include markdown/explanation */
function extractJSON(text: string): string {
  try {
    JSON.parse(text);
    return text.trim();
  } catch { /* not raw JSON */ }

  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      JSON.parse(codeBlockMatch[1].trim());
      return codeBlockMatch[1].trim();
    } catch { /* not valid JSON in code block */ }
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      JSON.parse(braceMatch[0]);
      return braceMatch[0];
    } catch { /* not valid JSON */ }
  }

  return text.slice(0, 300);
}

async function callEvalModel(
  dataUri: string,
  prompt: string,
  modelApiId: string,
  providerSlug: string,
  providerBaseUrl: string,
): Promise<string> {
  const apiKey = getProviderApiKey(providerSlug);
  if (!apiKey) throw new Error(`No API key for provider: ${providerSlug}`);

  const payload = buildPayload(modelApiId, providerSlug, dataUri, prompt);

  const res = await fetch(providerBaseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`${providerSlug} API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  return extractJSON(raw);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const modelIdsRaw = formData.get("model_ids") as string | null;
    if (!modelIdsRaw) {
      return NextResponse.json({ error: "model_ids required" }, { status: 400 });
    }

    let modelIds: string[];
    try {
      modelIds = JSON.parse(modelIdsRaw);
    } catch {
      return NextResponse.json({ error: "Invalid model_ids JSON" }, { status: 400 });
    }

    if (!Array.isArray(modelIds) || modelIds.length < 2 || modelIds.length > 4) {
      return NextResponse.json({ error: "Select 2-4 models" }, { status: 400 });
    }

    let schema: Record<string, string> = {};
    const schemaRaw = formData.get("extraction_schema") as string | null;
    if (schemaRaw) {
      try { schema = JSON.parse(schemaRaw); } catch { /* ignore */ }
    }

    // Build prompt
    const fieldsDesc = Object.entries(schema)
      .map(([k, v]) => `- "${k}": ${v}`)
      .join("\n");
    const prompt = fieldsDesc
      ? `Extract the following fields from this image. Return ONLY a JSON object, no explanation, no markdown.\n\nFields:\n${fieldsDesc}\n\nRespond with exactly: {"${Object.keys(schema).join('": "...", "')}":" ..."}`
      : "Transcribe all text visible in this image. Return only the text, no explanation.";

    // Collect image files and convert to data URIs
    const imageFiles: { filename: string; dataUri: string }[] = [];
    const entries = Array.from(formData.entries());
    for (const [key, value] of entries) {
      if (key === "images" && value instanceof File) {
        const buffer = Buffer.from(await value.arrayBuffer());
        const base64 = buffer.toString("base64");
        const mime = value.type || "image/jpeg";
        imageFiles.push({
          filename: value.name,
          dataUri: `data:${mime};base64,${base64}`,
        });
      }
    }

    if (imageFiles.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }

    // Resolve models from DB
    const db = getDb();
    const allModels = db.prepare("SELECT * FROM eval_models WHERE is_active = 1").all() as Record<string, unknown>[];
    const allProviders = db.prepare("SELECT * FROM eval_providers").all() as Record<string, unknown>[];

    const resolvedModels = modelIds
      .map((id) => {
        const model = allModels.find((m) => m.id === id);
        if (!model) return null;
        const provider = allProviders.find((p) => p.id === model.provider_id);
        if (!provider || provider.slug === "replicate") return null;
        return { model, provider };
      })
      .filter(Boolean) as { model: Record<string, unknown>; provider: Record<string, unknown> }[];

    // Only keep models whose provider has an API key
    const withKeys = resolvedModels.filter(({ provider }) =>
      getProviderApiKey(provider.slug as string)
    );
    if (withKeys.length === 0) {
      const names = resolvedModels.map(({ provider }) => provider.name).join(", ");
      return NextResponse.json(
        { error: `No API keys configured for: ${names}. Add keys in Settings.` },
        { status: 500 }
      );
    }

    // Run all model x image combinations
    const results = await Promise.all(
      withKeys.map(async ({ model, provider }) => {
        const outputs = await Promise.all(
          imageFiles.map(async (img) => {
            try {
              const text = await callEvalModel(
                img.dataUri,
                prompt,
                model.api_model_id as string,
                provider.slug as string,
                provider.base_url as string,
              );
              return { filename: img.filename, text };
            } catch (err) {
              return { filename: img.filename, text: `Error: ${err instanceof Error ? err.message : String(err)}` };
            }
          }),
        );
        return {
          modelId: model.id,
          modelName: model.name,
          outputs,
        };
      }),
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Quick compare error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
