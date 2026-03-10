import asyncio
import json
import logging
import os
from pathlib import Path

from pipeline.storage import StorageClient, STORAGE_DIR

logger = logging.getLogger(__name__)


class LocalTrainer:
    def __init__(self, storage: StorageClient):
        self.storage = storage

    async def train(self, job_id: str, job: dict) -> str:
        """
        Train a LoRA adapter locally.
        Runs blocking PyTorch ops in a thread to avoid blocking the event loop.
        """
        return await asyncio.to_thread(self._train_sync, job_id, job)

    def _train_sync(self, job_id: str, job: dict) -> str:
        label_images = self.storage.get_images(job_id, role="label_source")
        labeled = [img for img in label_images if img.get("gemini_label")]

        if not labeled:
            raise RuntimeError("No labeled images to train on")

        schema = job["extraction_schema"]
        hf_repo = job["finetune_model"]["hf_repo"]

        # Build training data
        training_data = []
        for img in labeled:
            schema_desc = "\n".join(f'- "{k}": {v}' for k, v in schema.items())
            instruction = (
                f"Extract the following fields from this document image:\n"
                f"{schema_desc}\n"
                f"Return a JSON object with the extracted values."
            )
            image_path = str(STORAGE_DIR / img["storage_path"])
            training_data.append({
                "image_path": image_path,
                "instruction": instruction,
                "response": json.dumps(img["gemini_label"]),
            })

        # Save training JSONL
        dataset_dir = STORAGE_DIR / "jobs" / job_id
        dataset_dir.mkdir(parents=True, exist_ok=True)
        dataset_path = dataset_dir / "training_data.jsonl"
        with open(dataset_path, "w") as f:
            for d in training_data:
                f.write(json.dumps(d) + "\n")

        adapter_storage_path = f"jobs/{job_id}/adapter"
        adapter_full_path = STORAGE_DIR / adapter_storage_path
        adapter_full_path.mkdir(parents=True, exist_ok=True)

        logger.info(f"Starting local training: {hf_repo} with {len(training_data)} samples")

        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer, AutoProcessor
            from peft import LoraConfig, get_peft_model, TaskType

            # Detect device
            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"Training on device: {device}")

            if device == "cpu":
                logger.warning("No GPU detected. Training on CPU will be very slow.")

            # Load model and tokenizer/processor
            logger.info(f"Loading model: {hf_repo}")

            # Try loading as a vision-language model with processor
            try:
                processor = AutoProcessor.from_pretrained(hf_repo, trust_remote_code=True)
            except Exception:
                processor = None

            model = AutoModelForCausalLM.from_pretrained(
                hf_repo,
                trust_remote_code=True,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
                device_map="auto" if device == "cuda" else None,
            )

            # Configure LoRA
            lora_config = LoraConfig(
                r=16,
                lora_alpha=32,
                lora_dropout=0.05,
                bias="none",
                task_type=TaskType.CAUSAL_LM,
                target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
            )

            model = get_peft_model(model, lora_config)
            model.print_trainable_parameters()

            # Simple training loop using TRL SFTTrainer if available
            try:
                from trl import SFTTrainer, SFTConfig
                from datasets import Dataset

                # Build dataset
                ds_data = []
                for d in training_data:
                    ds_data.append({
                        "text": f"### Instruction:\n{d['instruction']}\n\n### Response:\n{d['response']}",
                    })
                dataset = Dataset.from_list(ds_data)

                training_args = SFTConfig(
                    output_dir=str(adapter_full_path),
                    num_train_epochs=3,
                    per_device_train_batch_size=1,
                    gradient_accumulation_steps=4,
                    learning_rate=2e-4,
                    logging_steps=1,
                    save_strategy="no",
                    fp16=device == "cuda",
                    max_seq_length=2048,
                )

                trainer = SFTTrainer(
                    model=model,
                    train_dataset=dataset,
                    args=training_args,
                )

                trainer.train()

            except ImportError:
                # Fallback: manual training loop
                logger.info("TRL not available, using manual training loop")
                tokenizer = AutoTokenizer.from_pretrained(hf_repo, trust_remote_code=True)
                if tokenizer.pad_token is None:
                    tokenizer.pad_token = tokenizer.eos_token

                optimizer = torch.optim.AdamW(model.parameters(), lr=2e-4)
                model.train()

                for epoch in range(3):
                    total_loss = 0
                    for d in training_data:
                        text = f"### Instruction:\n{d['instruction']}\n\n### Response:\n{d['response']}"
                        inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=2048)
                        inputs = {k: v.to(model.device) for k, v in inputs.items()}
                        inputs["labels"] = inputs["input_ids"].clone()

                        outputs = model(**inputs)
                        loss = outputs.loss
                        loss.backward()
                        optimizer.step()
                        optimizer.zero_grad()
                        total_loss += loss.item()

                    avg_loss = total_loss / len(training_data)
                    logger.info(f"Epoch {epoch+1}/3, Loss: {avg_loss:.4f}")

            # Save LoRA adapter
            model.save_pretrained(str(adapter_full_path))
            logger.info(f"Adapter saved to {adapter_full_path}")

            # Free GPU memory
            del model
            if 'trainer' in dir():
                del trainer
            torch.cuda.empty_cache()

        except ImportError as e:
            logger.error(f"Missing ML dependencies: {e}")
            logger.info("Install with: pip install torch transformers peft trl datasets accelerate")
            raise RuntimeError(
                f"ML dependencies not installed. Run: pip install torch transformers peft trl datasets accelerate. Error: {e}"
            )

        return adapter_storage_path
