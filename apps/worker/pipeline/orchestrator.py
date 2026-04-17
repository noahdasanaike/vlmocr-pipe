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


def _parse_markdown_table(text: str) -> tuple[list[str], list[dict]] | None:
    """Try to parse a markdown table into (headers, rows).

    Returns None if the text doesn't look like a markdown table.
    """
    cleaned = text.strip()
    # Strip code fences
    if cleaned.startswith("```"):
        cleaned = re.sub(r'^```(?:markdown)?\s*', '', cleaned)
        cleaned = re.sub(r'\s*```\s*$', '', cleaned)

    lines = [l.strip() for l in cleaned.split('\n') if l.strip()]
    if len(lines) < 3:
        return None

    # Find header + separator pattern
    header_idx = None
    for i in range(len(lines) - 1):
        if '|' in lines[i] and re.match(r'^[\s|:-]+$', lines[i + 1]):
            header_idx = i
            break
    if header_idx is None:
        return None

    def split_row(line: str) -> list[str]:
        line = line.strip().strip('|')
        return [cell.strip() for cell in line.split('|')]

    headers = split_row(lines[header_idx])
    # Clean up bold markers from headers
    headers = [re.sub(r'\*\*([^*]*)\*\*', r'\1', h).strip() for h in headers]

    rows = []
    for line in lines[header_idx + 2:]:
        if not line or '|' not in line:
            continue
        if re.match(r'^[\s|:-]+$', line):
            continue
        cells = split_row(line)
        row = {}
        for j, header in enumerate(headers):
            val = cells[j].strip() if j < len(cells) else ""
            # Strip bold markers from cell values
            val = re.sub(r'\*\*([^*]*)\*\*', r'\1', val).strip()
            row[header] = val
        rows.append(row)

    if not rows:
        return None

    return headers, rows


def _parse_json_response(text: str, schema: dict[str, str]) -> list[dict]:
    """Parse model response into a list of result dicts.

    Accepts a JSON array, a single JSON object (wrapped into a list),
    or extracts JSON from markdown code blocks. Returns a list with one
    null-filled dict on parse failure.
    """
    # Strip markdown code fences
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
        cleaned = re.sub(r'\s*```\s*$', '', cleaned)

    # Try direct parse
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return parsed if parsed else [{k: None for k in schema}]
        if isinstance(parsed, dict):
            return [parsed]
    except json.JSONDecodeError:
        pass

    # Try to find a JSON array in the text
    arr_match = re.search(r'\[.*\]', cleaned, re.DOTALL)
    if arr_match:
        try:
            parsed = json.loads(arr_match.group())
            if isinstance(parsed, list):
                return parsed if parsed else [{k: None for k in schema}]
        except json.JSONDecodeError:
            pass

    # Fall back to finding individual JSON objects
    objects = []
    for m in re.finditer(r'\{[^{}]*\}', cleaned, re.DOTALL):
        try:
            objects.append(json.loads(m.group()))
        except json.JSONDecodeError:
            continue
    if objects:
        return objects

    logger.warning(f"No JSON found in output: {text[:200]}")
    return [{k: None for k in schema}]


def _build_json_schema(extraction_schema: dict[str, str]) -> dict:
    """Convert extraction_schema {field: description} into a JSON Schema object."""
    properties = {}
    for field, desc in extraction_schema.items():
        properties[field] = {"type": "string", "description": desc}
    return {
        "type": "object",
        "properties": properties,
        "required": list(extraction_schema.keys()),
        "additionalProperties": False,
    }


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

        # Build JSON Schema for structured output if enabled
        custom_prompt = job.get("custom_prompt")
        use_custom_prompt = bool(custom_prompt)

        if not use_custom_prompt and model_config.pop("structured_output", False):
            model_config["json_schema"] = _build_json_schema(schema)

        if use_custom_prompt:
            prompt = custom_prompt
        else:
            # Build extraction prompt from schema
            fields_desc = "\n".join(
                f"- {k}: {v}" for k, v in schema.items()
            )
            prompt = (
                f"Extract ALL observations from this image and return ONLY a valid JSON array. "
                f"Each element should be an object with these keys:\n{fields_desc}\n\n"
                f"If the image contains a table or list with multiple rows/entries, return one object per row. "
                f"Return a JSON array of objects with keys: {', '.join(schema.keys())}. "
                f"No explanation, just the JSON array."
            )

        # Look up model pricing for USD cost calculation
        input_cost_per_1m = 0.0
        output_cost_per_1m = 0.0
        if job.get("eval_model_id"):
            eval_model = self.storage.get_eval_model(job["eval_model_id"])
            if eval_model:
                input_cost_per_1m = eval_model.get("input_cost_per_1m", 0) or 0
                output_cost_per_1m = eval_model.get("output_cost_per_1m", 0) or 0

        # Skip already-inferred images (resumption support)
        pending_images = [img for img in all_images if img.get("infer_status") not in ("complete", "failed")]
        inferred_count = sum(1 for img in all_images if img.get("infer_status") == "complete")
        failed_count = sum(1 for img in all_images if img.get("infer_status") == "failed")
        total_input_tokens = 0
        total_output_tokens = 0
        total_cost = 0.0
        if inferred_count > 0 or failed_count > 0:
            logger.info(f"Resuming: {inferred_count} complete, {failed_count} failed, {len(pending_images)} pending")

        for img in pending_images:
            # Check for cancellation
            current = self.storage.get_job(job_id)
            if current["status"] in ("cancelled", "paused"):
                return

            try:
                image_bytes = await self.storage.download_image(img["storage_path"])
                predicted_text, _latency, in_tok, out_tok = await call_model(
                    image_bytes=image_bytes,
                    filename=img["filename"],
                    prompt=prompt,
                    model_api_id=model_api_id,
                    provider_slug=provider_slug,
                    provider_base_url=provider_base_url,
                    config=model_config,
                    max_tokens=4096,
                )
                total_input_tokens += in_tok
                total_output_tokens += out_tok

                # Parse response
                if use_custom_prompt:
                    # Try to parse structured data from the response
                    stripped = predicted_text.strip()

                    # 1. Try markdown table
                    table_result = _parse_markdown_table(stripped)
                    if table_result:
                        headers, rows = table_result
                        predicted_result = rows
                        # Update job schema to match detected columns (once)
                        if inferred_count == 0:
                            detected_schema = {h: h for h in headers}
                            self.storage.update_job(job_id, extraction_schema=json.dumps(detected_schema))
                            schema.clear()
                            schema.update(detected_schema)
                    else:
                        # 2. Try JSON array/object
                        try:
                            parsed = json.loads(stripped)
                            if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
                                predicted_result = parsed
                                if inferred_count == 0:
                                    detected_schema = {k: k for k in parsed[0].keys()}
                                    self.storage.update_job(job_id, extraction_schema=json.dumps(detected_schema))
                                    schema.clear()
                                    schema.update(detected_schema)
                            elif isinstance(parsed, dict):
                                predicted_result = [parsed]
                            else:
                                predicted_result = {"output": stripped}
                        except (json.JSONDecodeError, ValueError):
                            # 3. Plain text fallback
                            predicted_result = {"output": stripped}
                else:
                    # Schema mode: parse JSON array
                    predicted_result = _parse_json_response(predicted_text, schema)

                self.storage.update_image(
                    img["id"],
                    predicted_result=predicted_result,
                    infer_status="complete",
                )
                inferred_count += 1
                total_cost = (total_input_tokens * input_cost_per_1m + total_output_tokens * output_cost_per_1m) / 1_000_000
                await self.update_job_status(
                    job_id, "inferring",
                    inferred_count=inferred_count, failed_count=failed_count,
                    total_input_tokens=total_input_tokens, total_output_tokens=total_output_tokens,
                    total_cost=total_cost,
                )
            except Exception as e:
                logger.error(f"Failed to infer image {img['id']}: {e}")
                self.storage.update_image(img["id"], infer_status="failed")
                failed_count += 1
                await self.update_job_status(
                    job_id, "inferring",
                    inferred_count=inferred_count, failed_count=failed_count,
                    total_input_tokens=total_input_tokens, total_output_tokens=total_output_tokens,
                    total_cost=total_cost,
                )

        # Complete
        await self.update_job_status(
            job_id,
            "complete",
            inferred_count=inferred_count,
            failed_count=failed_count,
            total_input_tokens=total_input_tokens,
            total_output_tokens=total_output_tokens,
            total_cost=total_cost,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.info(f"Inference-only job {job_id} completed ({inferred_count} inferred, {failed_count} failed)")

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

        # Build JSON Schema for structured output if enabled
        if label_model_config.pop("structured_output", False):
            label_model_config["json_schema"] = _build_json_schema(schema)

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
