import json
import logging
import re

from pipeline.storage import StorageClient
from pipeline.evaluator import call_model

logger = logging.getLogger(__name__)


class Labeler:
    def __init__(self, storage: StorageClient):
        self.storage = storage

    async def label_image(
        self,
        image_bytes: bytes,
        schema: dict[str, str],
        model_api_id: str,
        provider_slug: str,
        provider_base_url: str,
    ) -> dict:
        """Label a single image using any eval model."""
        schema_description = "\n".join(
            f'- "{field}": {desc}' for field, desc in schema.items()
        )

        prompt = f"""Analyze this document image and extract the following fields.
Return ONLY a JSON object with these exact keys and their extracted values.
If a field cannot be found, set its value to null.

Fields to extract:
{schema_description}

Return valid JSON only, no markdown formatting."""

        predicted_text, _latency = await call_model(
            image_bytes=image_bytes,
            filename="label_image.jpg",
            prompt=prompt,
            model_api_id=model_api_id,
            provider_slug=provider_slug,
            provider_base_url=provider_base_url,
            max_tokens=2048,
        )

        # Parse JSON response
        text = predicted_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]

        try:
            result = json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON from response
            match = re.search(r'\{[\s\S]*\}', text)
            if match:
                result = json.loads(match.group())
            else:
                raise RuntimeError(f"Could not parse JSON from model response: {text[:200]}")

        if isinstance(result, list):
            result = result[0] if result else {}

        # Ensure all schema keys present
        for key in schema:
            if key not in result:
                result[key] = None

        return result
