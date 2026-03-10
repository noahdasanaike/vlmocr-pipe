import json
import logging
from pathlib import Path

from pipeline.storage import StorageClient, STORAGE_DIR

logger = logging.getLogger(__name__)


class LocalInferencer:
    def __init__(self, storage: StorageClient):
        self.storage = storage

    async def infer_batch(
        self,
        job_id: str,
        job: dict,
        adapter_path: str,
        images: list[dict],
    ) -> list[tuple[str, dict]]:
        if not images:
            return []

        schema = job["extraction_schema"]
        hf_repo = job["finetune_model"]["hf_repo"]
        adapter_full_path = str(STORAGE_DIR / adapter_path)

        schema_desc = "\n".join(f'- "{k}": {v}' for k, v in schema.items())
        instruction = (
            f"Extract the following fields from this document image:\n"
            f"{schema_desc}\n"
            f"Return a JSON object with the extracted values."
        )

        logger.info(f"Starting local inference: {len(images)} images with {hf_repo}")

        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
            from peft import PeftModel

            device = "cuda" if torch.cuda.is_available() else "cpu"

            # Load base model + adapter
            base_model = AutoModelForCausalLM.from_pretrained(
                hf_repo,
                trust_remote_code=True,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
                device_map="auto" if device == "cuda" else None,
            )
            model = PeftModel.from_pretrained(base_model, adapter_full_path)
            model.eval()

            tokenizer = AutoTokenizer.from_pretrained(hf_repo, trust_remote_code=True)
            if tokenizer.pad_token is None:
                tokenizer.pad_token = tokenizer.eos_token

            results = []
            for img in images:
                try:
                    prompt = f"### Instruction:\n{instruction}\n\n### Response:\n"
                    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048)
                    inputs = {k: v.to(model.device) for k, v in inputs.items()}

                    with torch.no_grad():
                        outputs = model.generate(
                            **inputs,
                            max_new_tokens=512,
                            temperature=0.1,
                            do_sample=True,
                        )

                    response = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)

                    # Parse JSON from response
                    try:
                        result = json.loads(response)
                    except json.JSONDecodeError:
                        import re
                        match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
                        if match:
                            result = json.loads(match.group())
                        else:
                            result = {k: response for k in schema}

                    results.append((img["id"], result))
                except Exception as e:
                    logger.error(f"Failed to infer image {img['id']}: {e}")
                    results.append((img["id"], {k: None for k in schema}))

            return results

        except ImportError as e:
            raise RuntimeError(
                f"ML dependencies not installed. Run: pip install torch transformers peft. Error: {e}"
            )
