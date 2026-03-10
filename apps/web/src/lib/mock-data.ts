// Fallback data for when the database is unavailable

export const MOCK_PROVIDERS = [
  { id: "p1", name: "OpenRouter", slug: "openrouter", base_url: "https://openrouter.ai/api/v1/chat/completions", is_active: true },
  { id: "p2", name: "DeepInfra", slug: "deepinfra", base_url: "https://api.deepinfra.com/v1/openai/chat/completions", is_active: true },
  { id: "p3", name: "Novita", slug: "novita", base_url: "https://api.novita.ai/openai/chat/completions", is_active: true },
  { id: "p4", name: "DashScope", slug: "dashscope", base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", is_active: true },
  { id: "p5", name: "Replicate", slug: "replicate", base_url: "https://api.replicate.com/v1/predictions", is_active: true },
];

export const MOCK_MODELS = [
  // OpenRouter models
  { id: "m1", provider_id: "p1", name: "GPT-5.2", api_model_id: "openai/gpt-5.2", cost_per_image_credits: 3, config: { reasoning_effort: "low" }, is_active: true },
  { id: "m2", provider_id: "p1", name: "Gemini 3 Pro", api_model_id: "google/gemini-3-pro-preview", cost_per_image_credits: 2, config: { reasoning_effort: "low" }, is_active: true },
  { id: "m3", provider_id: "p1", name: "Gemini 3 Flash", api_model_id: "google/gemini-3-flash-preview", cost_per_image_credits: 1, config: { reasoning_effort: "low" }, is_active: true },
  { id: "m4", provider_id: "p1", name: "Claude Sonnet 4.6", api_model_id: "anthropic/claude-sonnet-4.6", cost_per_image_credits: 3, config: {}, is_active: true },
  { id: "m5", provider_id: "p1", name: "Qwen3-VL 235B", api_model_id: "qwen/qwen3-vl-235b-a22b-instruct", cost_per_image_credits: 2, config: {}, is_active: true },
  { id: "m6", provider_id: "p1", name: "Qwen3.5 397B", api_model_id: "qwen/qwen3.5-397b-a17b", cost_per_image_credits: 3, config: { thinking: false }, is_active: true },
  { id: "m7", provider_id: "p1", name: "Llama 4 Maverick", api_model_id: "meta-llama/llama-4-maverick", cost_per_image_credits: 2, config: {}, is_active: true },
  { id: "m8", provider_id: "p1", name: "Kimi K2.5", api_model_id: "moonshotai/kimi-k2.5", cost_per_image_credits: 2, config: {}, is_active: true },
  { id: "m18", provider_id: "p1", name: "Gemini 2.0 Flash", api_model_id: "google/gemini-2.0-flash-001", cost_per_image_credits: 1, config: {}, is_active: true },
  { id: "m19", provider_id: "p1", name: "Gemini 3.1 Pro", api_model_id: "google/gemini-3.1-pro-preview", cost_per_image_credits: 2, config: {}, is_active: false },
  { id: "m20", provider_id: "p1", name: "ERNIE 4.5 VL 424B", api_model_id: "baidu/ernie-4.5-vl-424b-a47b", cost_per_image_credits: 2, config: {}, is_active: true },
  { id: "m23", provider_id: "p1", name: "Gemini 3.1 Flash Lite", api_model_id: "google/gemini-3.1-flash-lite-preview", cost_per_image_credits: 0.5, config: {}, is_active: true },
  { id: "m24", provider_id: "p1", name: "Seed 2.0 Mini", api_model_id: "bytedance-seed/seed-2.0-mini", cost_per_image_credits: 1, config: {}, is_active: true },
  { id: "m25", provider_id: "p1", name: "Qwen3.5 Plus", api_model_id: "qwen/qwen3.5-plus-02-15", cost_per_image_credits: 2, config: { thinking: false }, is_active: true },
  // DeepInfra models
  { id: "m9", provider_id: "p2", name: "olmOCR-2 (7B)", api_model_id: "allenai/olmOCR-2-7B-1025", cost_per_image_credits: 0.5, config: {}, is_active: true },
  { id: "m10", provider_id: "p2", name: "DeepSeek-OCR", api_model_id: "deepseek-ai/DeepSeek-OCR", cost_per_image_credits: 0.5, config: {}, is_active: true },
  { id: "m11", provider_id: "p2", name: "PaddleOCR-VL 0.9B", api_model_id: "PaddlePaddle/PaddleOCR-VL-0.9B", cost_per_image_credits: 0.25, config: {}, is_active: true },
  { id: "m12", provider_id: "p2", name: "Nemotron Nano 12B", api_model_id: "nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL", cost_per_image_credits: 0.5, config: {}, is_active: false },
  { id: "m21", provider_id: "p2", name: "Qwen3-VL 30B", api_model_id: "Qwen/Qwen3-VL-30B-A3B-Instruct", cost_per_image_credits: 0.5, config: {}, is_active: true },
  // Novita models
  { id: "m13", provider_id: "p3", name: "DeepSeek-OCR2", api_model_id: "deepseek/deepseek-ocr-2", cost_per_image_credits: 1, config: {}, is_active: true },
  { id: "m14", provider_id: "p3", name: "ERNIE 4.5 VL 28B", api_model_id: "baidu/ernie-4.5-vl-28b-a3b", cost_per_image_credits: 1, config: {}, is_active: true },
  { id: "m22", provider_id: "p3", name: "Qwen3-VL 8B", api_model_id: "qwen/qwen3-vl-8b-instruct", cost_per_image_credits: 0.5, config: {}, is_active: true },
  // DashScope models
  { id: "m15", provider_id: "p4", name: "Qwen3.5 Flash", api_model_id: "qwen3.5-flash", cost_per_image_credits: 0.5, config: { thinking: false }, is_active: true },
  { id: "m16", provider_id: "p4", name: "Qwen VL OCR", api_model_id: "qwen-vl-ocr", cost_per_image_credits: 0.5, config: {}, is_active: true },
  { id: "m26", provider_id: "p4", name: "Qwen3.5 35B", api_model_id: "qwen3.5-35b-a3b", cost_per_image_credits: 0.5, config: { thinking: false }, is_active: true },
  { id: "m27", provider_id: "p4", name: "Qwen3.5 27B", api_model_id: "qwen3.5-27b", cost_per_image_credits: 0.5, config: { thinking: false }, is_active: true },
  { id: "m28", provider_id: "p4", name: "Qwen3.5 122B", api_model_id: "qwen3.5-122b-a10b", cost_per_image_credits: 1, config: { thinking: false }, is_active: true },
  // Replicate models
  { id: "m17", provider_id: "p5", name: "dots.ocr", api_model_id: "sljeff/dots.ocr:214a4fc47a5e8254ae83362a34271feeb53c5e61d9bc8aadcf96a5d8717be4d6", cost_per_image_credits: 0.5, config: {}, is_active: true },
];

export const MOCK_DATASETS = [
  {
    id: "ds1",
    user_id: null,
    name: "SocOCRBench",
    description: "Social science OCR benchmark: 37 datasets across 6 regions, 3 periods, 4 formats. ~432 samples covering handwritten text, printed text, printed tables, and handwritten tables.",
    sample_count: 432,
    is_public: true,
    created_at: "2025-01-01T00:00:00Z",
  },
];

// Mock labeling & finetune models for jobs/new page
export const MOCK_LABELING_MODELS = [
  { id: "lm1", name: "Gemini 2.5 Flash", api_model_id: "gemini-2.5-flash-preview-05-20", cost_per_image_credits: 1, is_active: true, created_at: "2025-01-01T00:00:00Z" },
  { id: "lm2", name: "Gemini 2.5 Pro", api_model_id: "gemini-2.5-pro-preview-05-06", cost_per_image_credits: 2, is_active: true, created_at: "2025-01-01T00:00:00Z" },
  { id: "lm3", name: "GPT-4o", api_model_id: "gpt-4o", cost_per_image_credits: 3, is_active: true, created_at: "2025-01-01T00:00:00Z" },
];

export const MOCK_FINETUNE_MODELS = [
  { id: "fm1", name: "Qwen2.5-VL-7B", hf_model_id: "Qwen/Qwen2.5-VL-7B-Instruct", credit_cost_per_image: 1, is_active: true, created_at: "2025-01-01T00:00:00Z" },
  { id: "fm2", name: "Qwen2.5-VL-3B", hf_model_id: "Qwen/Qwen2.5-VL-3B-Instruct", credit_cost_per_image: 0.5, is_active: true, created_at: "2025-01-01T00:00:00Z" },
  { id: "fm3", name: "Florence-2-large", hf_model_id: "microsoft/Florence-2-large", credit_cost_per_image: 0.5, is_active: true, created_at: "2025-01-01T00:00:00Z" },
];

// In-memory store for user-created datasets
const userDatasets: { id: string; user_id: string | null; name: string; description: string | null; sample_count: number; is_public: boolean; created_at: string }[] = [];

export function getMockUserDatasets() {
  return userDatasets;
}

export function addMockUserDataset(dataset: typeof userDatasets[number]) {
  userDatasets.unshift(dataset);
}

// In-memory store for benchmark runs (persists during dev server lifetime)
const runs: Record<string, unknown>[] = [];

export function getMockRuns() {
  return runs;
}

export function addMockRun(run: Record<string, unknown>) {
  runs.unshift(run);
}

export function getMockRun(id: string) {
  return runs.find((r) => r.id === id) ?? null;
}

export function updateMockRun(id: string, updates: Record<string, unknown>) {
  const run = runs.find((r) => r.id === id);
  if (run) Object.assign(run, updates);
}
