import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone

from pipeline.storage import StorageClient, STORAGE_DIR
from pipeline.labeler import Labeler
from pipeline.trainer import LocalTrainer
from pipeline.inferencer import LocalInferencer
from pipeline.evaluator import call_model

logger = logging.getLogger(__name__)


class PipelineOrchestrator:
    def __init__(self):
        self.storage = StorageClient()
        self.labeler = Labeler(self.storage)
        self.trainer = LocalTrainer(self.storage)
        self.inferencer = LocalInferencer(self.storage)

    async def update_job_status(
        self,
        job_id: str,
        status: str,
        error_message: str | None = None,
        **kwargs,
    ):
        """Update job status in DB."""
        updates = {"status": status}
        if error_message:
            updates["error_message"] = error_message
        updates.update(kwargs)
        self.storage.update_job(job_id, **updates)

    async def run_inference_only(self, job_id: str):
        """Run inference-only pipeline using an eval model."""
        job = self.storage.get_job(job_id)

        if job["status"] in ("cancelled", "paused"):
            logger.info(f"Job {job_id} was {job['status']}, skipping")
            return

        await self.update_job_status(job_id, "inferring")

        all_images = self.storage.get_images(job_id, role="infer_target")
        schema = job["extraction_schema"]
        model_api_id = job.get("eval_model_api_id", "")
        provider_slug = job.get("eval_model_provider_slug", "")
        provider_base_url = job.get("eval_model_provider_base_url", "")

        # Look up model config (reasoning_effort, media_resolution, etc.)
        # Merge: model defaults < job-level overrides
        model_config = {}
        if job.get("eval_model_id"):
            eval_model = self.storage.get_eval_model(job["eval_model_id"])
            if eval_model:
                model_config = eval_model.get("config", {})
        job_config = json.loads(job.get("model_config") or "{}") if isinstance(job.get("model_config"), str) else job.get("model_config", {})
        if job_config:
            model_config = {**model_config, **job_config}

        # Build extraction prompt from schema
        fields_desc = "\n".join(
            f"- {k}: {v}" for k, v in schema.items()
        )
        prompt = (
            f"Extract the following fields from this image and return ONLY valid JSON "
            f"with these keys:\n{fields_desc}\n\n"
            f"Return a JSON object with keys: {', '.join(schema.keys())}. "
            f"No explanation, just the JSON."
        )

        # Skip already-inferred images (resumption support)
        pending_images = [img for img in all_images if img.get("infer_status") != "complete"]
        inferred_count = len(all_images) - len(pending_images)
        if inferred_count > 0:
            logger.info(f"Skipping {inferred_count} already-inferred images")

        for img in pending_images:
            # Check for cancellation
            current = self.storage.get_job(job_id)
            if current["status"] in ("cancelled", "paused"):
                return

            try:
                image_bytes = await self.storage.download_image(img["storage_path"])
                predicted_text, _latency = await call_model(
                    image_bytes=image_bytes,
                    filename=img["filename"],
                    prompt=prompt,
                    model_api_id=model_api_id,
                    provider_slug=provider_slug,
                    provider_base_url=provider_base_url,
                    config=model_config,
                )

                # Parse JSON from response
                try:
                    predicted_result = json.loads(predicted_text)
                except json.JSONDecodeError:
                    # Try to extract JSON from markdown code block
                    match = re.search(r'\{[^{}]*\}', predicted_text, re.DOTALL)
                    if match:
                        try:
                            predicted_result = json.loads(match.group())
                        except json.JSONDecodeError:
                            logger.warning(f"Truncated output for {img['filename']}: {predicted_text[:200]}")
                            predicted_result = {k: None for k in schema}
                    else:
                        logger.warning(f"No JSON in output for {img['filename']}: {predicted_text[:200]}")
                        predicted_result = {k: None for k in schema}

                self.storage.update_image(
                    img["id"],
                    predicted_result=predicted_result,
                    infer_status="complete",
                )
                inferred_count += 1
                await self.update_job_status(
                    job_id, "inferring", inferred_count=inferred_count
                )
            except Exception as e:
                logger.error(f"Failed to infer image {img['id']}: {e}")
                self.storage.update_image(img["id"], infer_status="failed")

        # Complete
        await self.update_job_status(
            job_id,
            "complete",
            inferred_count=inferred_count,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.info(f"Inference-only job {job_id} completed ({inferred_count} images)")

    async def run(self, job_id: str):
        """Run the full pipeline for a job."""
        job = self.storage.get_job(job_id)

        if job["status"] in ("cancelled", "paused"):
            logger.info(f"Job {job_id} was {job['status']}, skipping")
            return

        # Dispatch to inference-only path if applicable
        if job.get("mode") == "inference_only":
            await self.run_inference_only(job_id)
            return

        # Stage 1: Label (status already set to 'labeling' by queue consumer)
        label_images = self.storage.get_images(job_id, role="label_source")
        schema = job["extraction_schema"]
        labeling_model = job.get("labeling_model") or {}
        label_model_api_id = labeling_model.get("api_model_id", "")
        label_provider = labeling_model.get("provider") or {}
        label_provider_slug = label_provider.get("slug", "")
        label_provider_base_url = label_provider.get("base_url", "")
        label_model_config = json.loads(labeling_model.get("config", "{}")) if isinstance(labeling_model.get("config"), str) else labeling_model.get("config", {})
        job_config = json.loads(job.get("model_config") or "{}") if isinstance(job.get("model_config"), str) else job.get("model_config", {})
        if job_config:
            label_model_config = {**label_model_config, **job_config}

        # Count already-labeled images (from previous runs)
        labeled_count = sum(1 for img in label_images if img.get("gemini_label"))
        if labeled_count > 0:
            logger.info(f"Skipping {labeled_count} already-labeled images")

        for img in label_images:
            # Skip already-labeled images
            if img.get("gemini_label"):
                continue

            # Check for cancellation
            current = self.storage.get_job(job_id)
            if current["status"] in ("cancelled", "paused"):
                return

            try:
                image_bytes = await self.storage.download_image(img["storage_path"])
                label = await self.labeler.label_image(
                    image_bytes, schema, label_model_api_id, label_provider_slug, label_provider_base_url,
                    config=label_model_config,
                )

                self.storage.update_image(
                    img["id"],
                    gemini_label=label,
                    label_status="complete",
                )
                labeled_count += 1
                await self.update_job_status(
                    job_id, "labeling", labeled_count=labeled_count
                )
            except Exception as e:
                logger.error(f"Failed to label image {img['id']}: {e}")
                self.storage.update_image(img["id"], label_status="failed")

        if labeled_count == 0:
            await self.update_job_status(
                job_id, "failed", error_message="No images were successfully labeled"
            )
            return

        # Stage 2: Train
        await self.update_job_status(job_id, "training")
        try:
            adapter_path = await self.trainer.train(job_id, job)
        except Exception as e:
            await self.update_job_status(
                job_id, "failed", error_message=f"Training failed: {e}"
            )
            return

        # Stage 3: Infer
        await self.update_job_status(job_id, "inferring")
        infer_images = self.storage.get_images(job_id, role="infer_target")

        # Skip already-inferred images (resumption support)
        pending_infer = [img for img in infer_images if img.get("infer_status") != "complete"]
        inferred_count = len(infer_images) - len(pending_infer)
        if inferred_count > 0:
            logger.info(f"Skipping {inferred_count} already-inferred images")

        try:
            results = await self.inferencer.infer_batch(
                job_id, job, adapter_path, pending_infer
            )
            for img_id, result in results:
                self.storage.update_image(
                    img_id,
                    predicted_result=result,
                    infer_status="complete",
                )
                inferred_count += 1
                await self.update_job_status(
                    job_id, "inferring", inferred_count=inferred_count
                )
        except Exception as e:
            await self.update_job_status(
                job_id, "failed", error_message=f"Inference failed: {e}"
            )
            return

        # Also store Gemini labels as results for label_source images
        for img in label_images:
            if img.get("gemini_label"):
                self.storage.update_image(
                    img["id"],
                    predicted_result=img["gemini_label"],
                    infer_status="complete",
                )

        # Stage 4: Complete
        await self.update_job_status(
            job_id,
            "complete",
            inferred_count=inferred_count,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

        # Save the fine-tuned model with size info
        adapter_full_path = STORAGE_DIR / adapter_path
        adapter_size = 0
        adapter_file_count = 0
        try:
            for f in adapter_full_path.rglob("*"):
                if f.is_file():
                    adapter_size += f.stat().st_size
                    adapter_file_count += 1
        except Exception:
            pass

        # Insert saved_models record
        conn = self.storage._get_conn()
        try:
            conn.execute(
                """INSERT INTO saved_models (id, job_id, finetune_model_id, name, storage_path, size_bytes, file_count)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid.uuid4()),
                    job_id,
                    job["finetune_model_id"],
                    f"{job['name']} - Adapter",
                    adapter_path,
                    adapter_size,
                    adapter_file_count,
                ),
            )
            conn.commit()
        except Exception as e:
            logger.warning(f"Failed to save model record: {e}")
        finally:
            conn.close()

        logger.info(f"Job {job_id} completed successfully")
