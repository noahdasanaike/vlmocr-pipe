export type JobStatus =
  | "pending"
  | "uploading"
  | "labeling"
  | "training"
  | "inferring"
  | "complete"
  | "failed"
  | "cancelled"
  | "paused";

export type ImageRole = "label_source" | "infer_target";
export type ImageLabelStatus = "pending" | "processing" | "complete" | "failed" | "skipped";
export type ImageInferStatus = "pending" | "processing" | "complete" | "failed" | "skipped";

export interface LabelingModel {
  id: string;
  name: string;
  api_model_id: string;
  is_active: boolean;
}

export interface FinetuneModel {
  id: string;
  name: string;
  hf_repo: string;
  gpu_type: string;
  is_active: boolean;
}

export type JobMode = "full" | "inference_only";

export interface Job {
  id: string;
  name: string;
  mode: JobMode;
  labeling_model_id: string;
  finetune_model_id: string;
  label_ratio: number;
  extraction_schema: Record<string, string>;
  status: JobStatus;
  total_images: number;
  label_images: number;
  infer_images: number;
  labeled_count: number;
  inferred_count: number;
  failed_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  eval_model_id: string | null;
  eval_model_api_id: string | null;
  eval_model_provider_slug: string | null;
  eval_model_provider_base_url: string | null;
  model_config: Record<string, string> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  labeling_model?: EvalModel & { provider_name?: string; provider_slug?: string };
  finetune_model?: FinetuneModel;
}

export interface JobImage {
  id: string;
  job_id: string;
  storage_path: string;
  filename: string;
  role: ImageRole;
  gemini_label: Record<string, string> | null;
  predicted_result: Record<string, string> | null;
  label_status: ImageLabelStatus;
  infer_status: ImageInferStatus;
  ground_truth: string | null;
  nes: number | null;
  cer: number | null;
  created_at: string;
}

export interface SavedModel {
  id: string;
  job_id: string | null;
  finetune_model_id: string | null;
  name: string;
  storage_path: string;
  size_bytes?: number;
  file_count?: number;
  created_at: string;
}

export interface ExtractionSchema {
  [fieldName: string]: string; // field name -> description
}

// -- Benchmark types --

export type BenchmarkRunStatus = "pending" | "running" | "complete" | "failed" | "cancelled";
export type BenchmarkModelStatus = "pending" | "running" | "complete" | "failed";

export interface EvalProvider {
  id: string;
  name: string;
  slug: string;
  base_url: string;
  is_active: boolean;
}

export interface EvalModel {
  id: string;
  provider_id: string;
  name: string;
  api_model_id: string;
  cost_per_image_credits: number;
  config: Record<string, unknown>;
  is_active: boolean;
  // Joined
  provider?: EvalProvider;
}

export interface BenchmarkDataset {
  id: string;
  name: string;
  description: string | null;
  sample_count: number;
  is_public: boolean;
  created_at: string;
}

export interface BenchmarkSample {
  id: string;
  dataset_id: string;
  storage_path: string;
  filename: string;
  ground_truth: string;
  metadata: {
    region?: string;
    period?: string;
    format?: string;
    dataset_source?: string;
  };
  created_at: string;
}

export interface BenchmarkRun {
  id: string;
  name: string;
  dataset_id: string;
  status: BenchmarkRunStatus;
  total_samples: number;
  completed_samples: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  dataset?: BenchmarkDataset;
  run_models?: BenchmarkRunModel[];
}

export interface BenchmarkRunModel {
  id: string;
  run_id: string;
  model_id: string;
  status: BenchmarkModelStatus;
  completed_samples: number;
  error_count: number;
  avg_nes: number | null;
  avg_cer: number | null;
  avg_f1: number | null;
  avg_latency_ms: number | null;
  macro_nes_region: number | null;
  macro_nes_period: number | null;
  macro_nes_format: number | null;
  sococrbench_score: number | null;
  // Joined
  model?: EvalModel;
}

export interface BenchmarkResult {
  id: string;
  run_model_id: string;
  sample_id: string;
  predicted_text: string | null;
  nes: number | null;
  cer: number | null;
  f1: number | null;
  latency_ms: number | null;
  error: string | null;
  // Joined
  sample?: BenchmarkSample;
}
