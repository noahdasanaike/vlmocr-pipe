"""
Benchmark run orchestrator.

Follows the pattern of pipeline/orchestrator.py:
  For each model in the run:
    For each sample in the dataset:
      1. Load image from local storage
      2. Call evaluator.call_model()
      3. Compute NES/CER/F1 via metrics.py
      4. Insert benchmark_result row
      5. Update progress count
    Compute aggregate macro scores → update benchmark_run_models
  Mark run complete
"""
import logging
from datetime import datetime, timezone

from pipeline.storage import StorageClient
from pipeline.evaluator import call_model
from pipeline.metrics import (
    compute_nes,
    compute_cer,
    compute_f1,
    strip_vlm_markdown,
    extract_cells,
    macro_average,
    compute_sococrbench_score,
    REGIONS,
    PERIODS,
    FORMATS,
)

logger = logging.getLogger(__name__)

# Default prompts
HW_PROMPT = "Transcribe all the text in this image exactly as written. Output ONLY the transcribed text, nothing else."
TABLE_PROMPT = (
    "OCR this document image into a markdown table. "
    "Transcribe all text exactly as written. "
    "Output ONLY the markdown table, nothing else."
)
HW_MAX_TOKENS = 512
TABLE_MAX_TOKENS = 4096


class BenchmarkOrchestrator:
    def __init__(self):
        self.storage = StorageClient()

    async def run(self, run_id: str):
        """Execute a benchmark run."""
        run = self.storage.get_benchmark_run(run_id)
        if not run:
            raise RuntimeError(f"Benchmark run {run_id} not found")

        run_models = self.storage.get_run_models(run_id)
        samples = self.storage.get_benchmark_samples(run["dataset_id"])

        if not samples:
            self.storage.update_benchmark_run(
                run_id, status="failed", error_message="No samples in dataset"
            )
            return

        # Update total count
        total = len(samples) * len(run_models)
        self.storage.update_benchmark_run(
            run_id,
            total_samples=len(samples),
            started_at=datetime.now(timezone.utc).isoformat(),
        )

        completed_total = 0

        for rm in run_models:
            model = rm.get("model", {})
            provider = model.get("provider", {})
            model_config = model.get("config", {})

            self.storage.update_run_model(rm["id"], status="running")

            # Skip already-completed samples (resumption support)
            done_sample_ids = self.storage.get_completed_benchmark_sample_ids(rm["id"])
            pending_samples = [s for s in samples if s["id"] not in done_sample_ids]
            skipped = len(samples) - len(pending_samples)
            if skipped > 0:
                logger.info(f"Skipping {skipped} already-benchmarked samples for model {model.get('name', rm['id'])}")

            completed_for_model = skipped
            error_count = 0
            completed_total += skipped

            for sample in pending_samples:
                # Check for cancellation
                current = self.storage.get_benchmark_run(run_id)
                if current["status"] in ("cancelled", "paused"):
                    logger.info(f"Benchmark run {run_id} was cancelled")
                    return

                meta = sample.get("metadata", {})
                fmt = meta.get("format", "Handwritten text")
                is_table = "table" in fmt.lower()
                prompt = TABLE_PROMPT if is_table else HW_PROMPT
                max_tokens = TABLE_MAX_TOKENS if is_table else HW_MAX_TOKENS

                try:
                    # Download image
                    image_bytes = await self.storage.download_image(sample["storage_path"])

                    # Call model
                    predicted_text, latency = await call_model(
                        image_bytes=image_bytes,
                        filename=sample["filename"],
                        prompt=prompt,
                        model_api_id=model["api_model_id"],
                        provider_slug=provider["slug"],
                        provider_base_url=provider["base_url"],
                        config=model_config,
                        max_tokens=max_tokens,
                    )

                    # Compute metrics
                    gt = sample["ground_truth"]
                    if is_table:
                        pred_clean = extract_cells(strip_vlm_markdown(predicted_text))
                        gt_clean = extract_cells(gt)
                    else:
                        pred_clean = strip_vlm_markdown(predicted_text)
                        gt_clean = gt

                    nes = compute_nes(pred_clean, gt_clean)
                    cer = compute_cer(pred_clean, gt_clean)
                    f1 = compute_f1(pred_clean, gt_clean)
                    latency_ms = int(latency * 1000)

                    # Store result
                    self.storage.insert_benchmark_result(
                        run_model_id=rm["id"],
                        sample_id=sample["id"],
                        predicted_text=predicted_text,
                        nes=nes,
                        cer=cer,
                        f1=f1,
                        latency_ms=latency_ms,
                    )
                    completed_for_model += 1

                except Exception as e:
                    logger.error(
                        f"Benchmark error ({model['name']}, {sample['filename']}): {e}"
                    )
                    error_count += 1
                    self.storage.insert_benchmark_result(
                        run_model_id=rm["id"],
                        sample_id=sample["id"],
                        error=str(e)[:500],
                    )

                completed_total += 1
                # Update progress periodically (every sample)
                self.storage.update_run_model(
                    rm["id"],
                    completed_samples=completed_for_model,
                    error_count=error_count,
                )
                self.storage.update_benchmark_run(
                    run_id, completed_samples=completed_total
                )

            # Compute aggregate scores for this model
            await self._compute_aggregates(rm["id"], run_id)
            self.storage.update_run_model(rm["id"], status="complete")

        # Mark run complete
        self.storage.update_benchmark_run(
            run_id,
            status="complete",
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.info(f"Benchmark run {run_id} completed successfully")

    async def _compute_aggregates(self, run_model_id: str, run_id: str):
        """Compute and store aggregate metrics for a run model."""
        results_data = self.storage.get_benchmark_results_for_run_model(run_model_id)

        if not results_data:
            return

        # Build results list in the format metrics.py expects
        results_for_macro = []
        nes_values = []
        cer_values = []
        f1_values = []
        latencies = []

        for r in results_data:
            sample = r.get("sample", {})
            meta = sample.get("metadata", {})
            has_error = r.get("error") is not None

            entry = {
                "dataset": meta.get("dataset_source", "unknown"),
                "region": meta.get("region", "Unknown"),
                "period": meta.get("period", "Unknown"),
                "fmt": meta.get("format", "Unknown"),
                "nes": float(r["nes"]) if r.get("nes") is not None else 0.0,
                "error": has_error,
            }
            results_for_macro.append(entry)

            if not has_error and r.get("nes") is not None:
                nes_values.append(float(r["nes"]))
            if not has_error and r.get("cer") is not None:
                cer_values.append(float(r["cer"]))
            if not has_error and r.get("f1") is not None:
                f1_values.append(float(r["f1"]))
            if not has_error and r.get("latency_ms") is not None:
                latencies.append(int(r["latency_ms"]))

        updates = {}
        if nes_values:
            updates["avg_nes"] = sum(nes_values) / len(nes_values)
        if cer_values:
            updates["avg_cer"] = sum(cer_values) / len(cer_values)
        if f1_values:
            updates["avg_f1"] = sum(f1_values) / len(f1_values)
        if latencies:
            updates["avg_latency_ms"] = int(sum(latencies) / len(latencies))

        # Macro averages
        updates["macro_nes_region"] = macro_average(results_for_macro, "region", REGIONS)
        updates["macro_nes_period"] = macro_average(results_for_macro, "period", PERIODS)
        updates["macro_nes_format"] = macro_average(results_for_macro, "fmt", FORMATS)
        updates["sococrbench_score"] = compute_sococrbench_score(results_for_macro)

        self.storage.update_run_model(run_model_id, **updates)
