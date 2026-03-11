-- Seed data — only runs if tables are empty

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
  ('p6', 'Google AI Studio', 'google', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'),
  ('p7', 'Qubrid', 'qubrid', 'https://platform.qubrid.com/v1/chat/completions'),
  ('p8', 'ZenMux', 'zenmux', 'https://zenmux.ai/api/v1/chat/completions'),
  ('p9', 'Ollama (Local)', 'ollama', 'http://localhost:11434/v1/chat/completions'),
  ('p10', 'vLLM (Local)', 'vllm', 'http://localhost:8000/v1/chat/completions');

-- Eval models (pricing: input/output cost per 1M tokens in USD, tokens_per_image = approx image tokens)
-- OpenRouter models use OR pricing; Google models use Google AI Studio pricing
-- Gemini batch API halves costs (handled in code)
INSERT OR IGNORE INTO eval_models (id, provider_id, name, api_model_id, cost_per_image_credits, input_cost_per_1m, output_cost_per_1m, tokens_per_image, config) VALUES
  ('m1',  'p1',  'GPT-5.2',              'openai/gpt-5.2',                           3,    2.50, 10.00, 765,  '{"reasoning_effort":"low"}'),
  ('m2',  'p6',  'Gemini 3.1 Pro',       'gemini-3.1-pro-preview',                   2,    1.25, 10.00, 1300, '{"reasoning_effort":"low"}'),
  ('m3',  'p6',  'Gemini 3 Flash',       'gemini-3-flash-preview',                   1,    0.15,  3.50, 1300, '{"reasoning_effort":"low"}'),
  ('m4',  'p1',  'Claude Sonnet 4.6',    'anthropic/claude-sonnet-4.6',              3,    3.00, 15.00, 1050, '{}'),
  ('m5',  'p1',  'Qwen3-VL 235B',       'qwen/qwen3-vl-235b-a22b-instruct',        2,    1.20,  1.20, 1500, '{}'),
  ('m6',  'p1',  'Qwen3.5 397B',        'qwen/qwen3.5-397b-a17b',                  3,    2.00,  8.00, 1500, '{"thinking":false}'),
  ('m7',  'p1',  'Llama 4 Maverick',    'meta-llama/llama-4-maverick',              2,    0.20,  0.60, 1200, '{}'),
  ('m8',  'p1',  'Kimi K2.5',           'moonshotai/kimi-k2.5',                     2,    0.60,  0.60, 1200, '{}'),
  ('m18', 'p6',  'Gemini 2.5 Flash-Lite','gemini-2.5-flash-lite',                   0.5,  0.075, 0.30, 1300, '{}'),
  ('m20', 'p1',  'ERNIE 4.5 VL 424B',   'baidu/ernie-4.5-vl-424b-a47b',            2,    0.40,  0.40, 1200, '{}'),
  ('m23', 'p6',  'Gemini 3.1 Flash Lite','gemini-3.1-flash-lite-preview',           0.5,  0.075, 0.30, 1300, '{}'),
  ('m24', 'p1',  'Seed 2.0 Mini',       'bytedance-seed/seed-2.0-mini',             1,    0.15,  0.15, 1200, '{}'),
  ('m25', 'p1',  'Qwen3.5 Plus',        'qwen/qwen3.5-plus-02-15',                 2,    1.50,  1.50, 1500, '{"thinking":false}'),
  ('m9',  'p2',  'olmOCR-2 (7B)',        'allenai/olmOCR-2-7B-1025',                0.5,  0.06,  0.06, 1200, '{}'),
  ('m10', 'p2',  'DeepSeek-OCR',         'deepseek-ai/DeepSeek-OCR',                0.5,  0.10,  0.10, 1200, '{}'),
  ('m11', 'p2',  'PaddleOCR-VL 0.9B',   'PaddlePaddle/PaddleOCR-VL-0.9B',          0.25, 0.03,  0.03, 1200, '{}'),
  ('m21', 'p2',  'Qwen3-VL 30B',        'Qwen/Qwen3-VL-30B-A3B-Instruct',          0.5,  0.13,  0.13, 1500, '{}'),
  ('m13', 'p3',  'DeepSeek-OCR2',        'deepseek/deepseek-ocr-2',                 1,    0.10,  0.10, 1200, '{}'),
  ('m14', 'p3',  'ERNIE 4.5 VL 28B',    'baidu/ernie-4.5-vl-28b-a3b',              1,    0.20,  0.20, 1200, '{}'),
  ('m22', 'p3',  'Qwen3-VL 8B',         'qwen/qwen3-vl-8b-instruct',               0.5,  0.10,  0.10, 1500, '{}'),
  ('m15', 'p4',  'Qwen3.5 Flash',       'qwen3.5-flash',                            0.5,  0.20,  0.60, 1500, '{"thinking":false}'),
  ('m16', 'p4',  'Qwen VL OCR',         'qwen-vl-ocr',                              0.5,  0.20,  0.60, 1500, '{}'),
  ('m26', 'p4',  'Qwen3.5 35B',         'qwen3.5-35b-a3b',                          0.5,  0.20,  0.60, 1500, '{"thinking":false}'),
  ('m27', 'p4',  'Qwen3.5 27B',         'qwen3.5-27b',                              0.5,  0.20,  0.60, 1500, '{"thinking":false}'),
  ('m28', 'p4',  'Qwen3.5 122B',        'qwen3.5-122b-a10b',                        1,    0.80,  2.40, 1500, '{"thinking":false}'),
  ('m17', 'p5',  'dots.ocr',            'sljeff/dots.ocr:214a4fc47a5e8254ae83362a34271feeb53c5e61d9bc8aadcf96a5d8717be4d6', 0.5, 0.05, 0.05, 1200, '{}'),
  ('m12', 'p2',  'Nemotron Nano 12B',   'nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL',    0.5,  0.07,  0.07, 1200, '{}'),
  ('m30', 'p6',  'Gemini 2.5 Flash',    'gemini-2.5-flash',                          1,    0.15,  3.50, 1300, '{}'),
  ('m31', 'p6',  'Gemini 2.5 Pro',      'gemini-2.5-pro',                            2,    1.25, 10.00, 1300, '{}'),
  ('m32', 'p1',  'GPT-5.3 Codex',       'openai/gpt-5.3-codex',                     3,    3.00, 12.00, 765,  '{"reasoning_effort":"low"}'),
  ('m33', 'p1',  'GPT-5.4',             'openai/gpt-5.4',                            3,    3.00, 12.00, 765,  '{"reasoning_effort":"low"}'),
  ('m34', 'p1',  'Claude Opus 4.6',     'anthropic/claude-opus-4.6',                 5,   15.00, 75.00, 1050, '{}'),
  ('m35', 'p1',  'Molmo 2 8B',          'allenai/molmo-2-8b',                        0.5,  0.10,  0.10, 1200, '{}'),
  ('m36', 'p1',  'Gemma 3 4B',          'google/gemma-3-4b-it',                      0.25, 0.07,  0.07, 1200, '{}'),
  ('m37', 'p1',  'Gemma 3 27B',         'google/gemma-3-27b-it',                     1,    0.27,  0.27, 1200, '{}'),
  ('m38', 'p1',  'Gemma 3 12B',         'google/gemma-3-12b-it',                     0.5,  0.15,  0.15, 1200, '{}'),
  ('m39', 'p7',  'HunyuanOCR',          'tencent/HunyuanOCR',                        1,    0.50,  0.50, 1200, '{}'),
  ('m40', 'p8',  'Seed 2.0 Pro',        'volcengine/doubao-seed-2.0-pro',            2,    0.50,  0.50, 1200, '{}'),
  ('m41', 'p8',  'Seed 2.0 Lite',       'volcengine/doubao-seed-2.0-lite',           1,    0.15,  0.15, 1200, '{}'),
  ('m42', 'p9',  'LightOnOCR2',         'maternion/LightOnOCR-2',                    0,    0,     0,    0,    '{}'),
  ('m43', 'p9',  'Qwen3.5 2B (Ollama)', 'qwen3.5:2b',                               0,    0,     0,    0,    '{"thinking":false}'),
  ('m44', 'p10', 'dots.ocr 1.5',        'model',                                     0,    0,     0,    0,    '{}');
