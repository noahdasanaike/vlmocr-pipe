import asyncio
import base64
import json
import logging
import os

import httpx

from pipeline.storage import StorageClient

logger = logging.getLogger(__name__)

# Gemini rate limit: use semaphore to control concurrency
GEMINI_CONCURRENCY = 5
_semaphore = asyncio.Semaphore(GEMINI_CONCURRENCY)


class GeminiLabeler:
    def __init__(self, storage: StorageClient):
        self.storage = storage
        # Check env var first, then fall back to DB settings
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        if not self.api_key:
            self.api_key = self.storage.get_setting("GEMINI_API_KEY") or ""
        if not self.api_key:
            raise RuntimeError(
                "Missing GEMINI_API_KEY. Set it as an environment variable or in the Settings page."
            )
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"

    async def label_image(
        self,
        image_bytes: bytes,
        schema: dict[str, str],
        model_id: str,
    ) -> dict:
        """Label a single image using Gemini API."""
        async with _semaphore:
            return await self._call_gemini(image_bytes, schema, model_id)

    async def _call_gemini(
        self,
        image_bytes: bytes,
        schema: dict[str, str],
        model_id: str,
        retries: int = 3,
    ) -> dict:
        b64_image = base64.b64encode(image_bytes).decode()

        schema_description = "\n".join(
            f'- "{field}": {desc}' for field, desc in schema.items()
        )

        prompt = f"""Analyze this document image and extract the following fields.
Return ONLY a JSON object with these exact keys and their extracted values.
If a field cannot be found, set its value to null.

Fields to extract:
{schema_description}

Return valid JSON only, no markdown formatting."""

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": b64_image,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
                "mediaResolution": "MEDIA_RESOLUTION_HIGH",
            },
        }

        url = f"{self.base_url}/models/{model_id}:generateContent?key={self.api_key}"

        for attempt in range(retries):
            try:
                async with httpx.AsyncClient(timeout=60) as http:
                    resp = await http.post(url, json=payload)

                    if resp.status_code == 429:
                        wait = 2 ** (attempt + 1)
                        logger.warning(f"Rate limited, waiting {wait}s...")
                        await asyncio.sleep(wait)
                        continue

                    resp.raise_for_status()
                    data = resp.json()

                text = data["candidates"][0]["content"]["parts"][0]["text"]
                # Clean potential markdown wrapping
                text = text.strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1]
                    text = text.rsplit("```", 1)[0]

                result = json.loads(text)

                # If Gemini returned a list (e.g. census rows), take the first item
                if isinstance(result, list):
                    if result:
                        result = result[0]
                    else:
                        result = {}

                # Ensure all schema keys are present
                for key in schema:
                    if key not in result:
                        result[key] = None

                return result

            except (httpx.HTTPStatusError, json.JSONDecodeError, KeyError) as e:
                if attempt < retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise RuntimeError(f"Gemini labeling failed after {retries} attempts: {e}")

        raise RuntimeError("Gemini labeling exhausted retries")
