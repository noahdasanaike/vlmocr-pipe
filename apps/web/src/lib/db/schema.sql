-- vlmocr-pipe — SQLite Schema

-- Application settings (API keys, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Labeling models (Gemini variants)
CREATE TABLE IF NOT EXISTS labeling_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  api_model_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fine-tune base models
CREATE TABLE IF NOT EXISTS finetune_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  hf_repo TEXT NOT NULL,
  gpu_type TEXT NOT NULL DEFAULT 'AMPERE_80',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Jobs
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'full' CHECK (mode IN ('full', 'inference_only')),
  labeling_model_id TEXT REFERENCES eval_models(id),
  finetune_model_id TEXT REFERENCES finetune_models(id),
  label_ratio REAL NOT NULL DEFAULT 0.30,
  extraction_schema TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','uploading','labeling','training','inferring','complete','failed','cancelled','paused')),
  total_images INTEGER NOT NULL DEFAULT 0,
  label_images INTEGER NOT NULL DEFAULT 0,
  infer_images INTEGER NOT NULL DEFAULT 0,
  labeled_count INTEGER NOT NULL DEFAULT 0,
  inferred_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  eval_model_id TEXT,
  eval_model_api_id TEXT,
  eval_model_provider_slug TEXT,
  eval_model_provider_base_url TEXT,
  model_config TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Images within a job
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'infer_target'
    CHECK (role IN ('label_source', 'infer_target')),
  gemini_label TEXT,
  predicted_result TEXT,
  label_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (label_status IN ('pending', 'processing', 'complete', 'failed', 'skipped')),
  infer_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (infer_status IN ('pending', 'processing', 'complete', 'failed', 'skipped')),
  ground_truth TEXT,
  nes REAL,
  cer REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Saved fine-tuned models
CREATE TABLE IF NOT EXISTS saved_models (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  finetune_model_id TEXT REFERENCES finetune_models(id),
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Eval providers (OpenRouter, DeepInfra, etc.)
CREATE TABLE IF NOT EXISTS eval_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Eval models
CREATE TABLE IF NOT EXISTS eval_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES eval_providers(id),
  name TEXT NOT NULL,
  api_model_id TEXT NOT NULL,
  cost_per_image_credits REAL NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Benchmark datasets
CREATE TABLE IF NOT EXISTS benchmark_datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sample_count INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Benchmark samples
CREATE TABLE IF NOT EXISTS benchmark_samples (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES benchmark_datasets(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  ground_truth TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Benchmark runs
CREATE TABLE IF NOT EXISTS benchmark_runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dataset_id TEXT NOT NULL REFERENCES benchmark_datasets(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'failed', 'cancelled')),
  total_samples INTEGER NOT NULL DEFAULT 0,
  completed_samples INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Benchmark run models
CREATE TABLE IF NOT EXISTS benchmark_run_models (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES eval_models(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  completed_samples INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  avg_nes REAL,
  avg_cer REAL,
  avg_f1 REAL,
  avg_latency_ms REAL,
  macro_nes_region REAL,
  macro_nes_period REAL,
  macro_nes_format REAL,
  sococrbench_score REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Benchmark results
CREATE TABLE IF NOT EXISTS benchmark_results (
  id TEXT PRIMARY KEY,
  run_model_id TEXT NOT NULL REFERENCES benchmark_run_models(id) ON DELETE CASCADE,
  sample_id TEXT NOT NULL REFERENCES benchmark_samples(id),
  predicted_text TEXT,
  nes REAL,
  cer REAL,
  f1 REAL,
  latency_ms INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_images_job_id ON images(job_id);
CREATE INDEX IF NOT EXISTS idx_images_role ON images(role);
CREATE INDEX IF NOT EXISTS idx_saved_models_job ON saved_models(job_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_samples_dataset ON benchmark_samples(dataset_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_run_models_run ON benchmark_run_models(run_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_run_model ON benchmark_results(run_model_id);
