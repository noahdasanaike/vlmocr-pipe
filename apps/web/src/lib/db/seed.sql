-- Seed data — only runs if tables are empty

-- Labeling models
INSERT OR IGNORE INTO labeling_models (id, name, api_model_id) VALUES
  ('lm1', 'Gemini 2.5 Flash', 'gemini-2.5-flash-preview-05-20'),
  ('lm2', 'Gemini 2.5 Pro', 'gemini-2.5-pro-preview-05-06');

-- Fine-tune models
INSERT OR IGNORE INTO finetune_models (id, name, hf_repo, gpu_type) VALUES
  ('fm1', 'GLM-OCR (0.9B)', 'zai-org/GLM-OCR', 'AMPERE_48'),
  ('fm2', 'dots.OCR (1.7B)', 'rednote-hilab/dots.ocr', 'AMPERE_48'),
  ('fm3', 'PaddleOCR-VL 1.5 (0.9B)', 'PaddlePaddle/PaddleOCR-VL-1.5', 'AMPERE_48'),
  ('fm4', 'OLMoOCR 2 (7B)', 'allenai/olmOCR-2-7B-1025', 'AMPERE_80');

-- Eval providers
INSERT OR IGNORE INTO eval_providers (id, name, slug, base_url) VALUES
  ('p1', 'OpenRouter', 'openrouter', 'https://openrouter.ai/api/v1/chat/completions'),
  ('p2', 'DeepInfra', 'deepinfra', 'https://api.deepinfra.com/v1/openai/chat/completions'),
  ('p3', 'Novita', 'novita', 'https://api.novita.ai/openai/chat/completions'),
  ('p4', 'DashScope', 'dashscope', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'),
  ('p5', 'Replicate', 'replicate', 'https://api.replicate.com/v1/predictions'),
  ('p6', 'Google AI Studio', 'google', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');

-- Eval models
INSERT OR IGNORE INTO eval_models (id, provider_id, name, api_model_id, cost_per_image_credits, config) VALUES
  ('m1', 'p1', 'GPT-5.2', 'openai/gpt-5.2', 3, '{"reasoning_effort":"low"}'),
  ('m2', 'p1', 'Gemini 3 Pro', 'google/gemini-3-pro-preview', 2, '{"reasoning_effort":"low"}'),
  ('m3', 'p1', 'Gemini 3 Flash', 'google/gemini-3-flash-preview', 1, '{"reasoning_effort":"low"}'),
  ('m4', 'p1', 'Claude Sonnet 4.6', 'anthropic/claude-sonnet-4.6', 3, '{}'),
  ('m5', 'p1', 'Qwen3-VL 235B', 'qwen/qwen3-vl-235b-a22b-instruct', 2, '{}'),
  ('m6', 'p1', 'Qwen3.5 397B', 'qwen/qwen3.5-397b-a17b', 3, '{"thinking":false}'),
  ('m7', 'p1', 'Llama 4 Maverick', 'meta-llama/llama-4-maverick', 2, '{}'),
  ('m8', 'p1', 'Kimi K2.5', 'moonshotai/kimi-k2.5', 2, '{}'),
  ('m18', 'p1', 'Gemini 2.0 Flash', 'google/gemini-2.0-flash-001', 1, '{}'),
  ('m20', 'p1', 'ERNIE 4.5 VL 424B', 'baidu/ernie-4.5-vl-424b-a47b', 2, '{}'),
  ('m23', 'p1', 'Gemini 3.1 Flash Lite', 'google/gemini-3.1-flash-lite-preview', 0.5, '{}'),
  ('m24', 'p1', 'Seed 2.0 Mini', 'bytedance-seed/seed-2.0-mini', 1, '{}'),
  ('m25', 'p1', 'Qwen3.5 Plus', 'qwen/qwen3.5-plus-02-15', 2, '{"thinking":false}'),
  ('m9', 'p2', 'olmOCR-2 (7B)', 'allenai/olmOCR-2-7B-1025', 0.5, '{}'),
  ('m10', 'p2', 'DeepSeek-OCR', 'deepseek-ai/DeepSeek-OCR', 0.5, '{}'),
  ('m11', 'p2', 'PaddleOCR-VL 0.9B', 'PaddlePaddle/PaddleOCR-VL-0.9B', 0.25, '{}'),
  ('m21', 'p2', 'Qwen3-VL 30B', 'Qwen/Qwen3-VL-30B-A3B-Instruct', 0.5, '{}'),
  ('m13', 'p3', 'DeepSeek-OCR2', 'deepseek/deepseek-ocr-2', 1, '{}'),
  ('m14', 'p3', 'ERNIE 4.5 VL 28B', 'baidu/ernie-4.5-vl-28b-a3b', 1, '{}'),
  ('m22', 'p3', 'Qwen3-VL 8B', 'qwen/qwen3-vl-8b-instruct', 0.5, '{}'),
  ('m15', 'p4', 'Qwen3.5 Flash', 'qwen3.5-flash', 0.5, '{"thinking":false}'),
  ('m16', 'p4', 'Qwen VL OCR', 'qwen-vl-ocr', 0.5, '{}'),
  ('m26', 'p4', 'Qwen3.5 35B', 'qwen3.5-35b-a3b', 0.5, '{"thinking":false}'),
  ('m27', 'p4', 'Qwen3.5 27B', 'qwen3.5-27b', 0.5, '{"thinking":false}'),
  ('m28', 'p4', 'Qwen3.5 122B', 'qwen3.5-122b-a10b', 1, '{"thinking":false}'),
  ('m17', 'p5', 'dots.ocr', 'sljeff/dots.ocr:214a4fc47a5e8254ae83362a34271feeb53c5e61d9bc8aadcf96a5d8717be4d6', 0.5, '{}'),
  ('m30', 'p6', 'Gemini 2.5 Flash', 'gemini-2.5-flash-preview-05-20', 1, '{}'),
  ('m31', 'p6', 'Gemini 2.5 Pro', 'gemini-2.5-pro-preview-05-06', 2, '{}');
