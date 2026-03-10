"""
Multi-provider VLM evaluator for benchmark runs.

Adapted from vlms/scripts/run_openrouter_benchmark.py.
Key changes:
  - Accepts image_bytes instead of file paths
  - API keys from env vars or DB settings
  - Async HTTP via httpx
  - Retry with exponential backoff
"""
import asyncio
import base64
import json
import logging
import os
import re
import time

import httpx

logger = logging.getLogger(__name__)

# ── Timeouts ─────────────────────────────────────────────────────────
TIMEOUT_SECONDS = 600
TIMEOUT_THINKING = 600

# ── Per-provider concurrency limits ──────────────────────────────────
_provider_semaphores: dict[str, asyncio.Semaphore] = {}


def _get_semaphore(provider_slug: str) -> asyncio.Semaphore:
    if provider_slug not in _provider_semaphores:
        _provider_semaphores[provider_slug] = asyncio.Semaphore(5)
    return _provider_semaphores[provider_slug]


# ── Image encoding ───────────────────────────────────────────────────

def _encode_image_bytes(image_bytes: bytes, filename: str = "") -> str:
    """Base64 encode image bytes and return data URI."""
    ext = os.path.splitext(filename)[1].lower() if filename else ""
    mime = "image/png" if ext == ".png" else "image/jpeg"
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:{mime};base64,{b64}"


# ── HTML → markdown table conversion ────────────────────────────────

def html_table_to_markdown(html: str) -> str:
    """Convert an HTML table to markdown table format."""
    from html.parser import HTMLParser

    class TableParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.rows: list[list[str]] = []
            self.current_row: list[str] = []
            self.current_cell = ""
            self.in_cell = False

        def handle_starttag(self, tag, attrs):
            if tag == "tr":
                self.current_row = []
            elif tag in ("td", "th"):
                self.current_cell = ""
                self.in_cell = True

        def handle_endtag(self, tag):
            if tag in ("td", "th"):
                self.in_cell = False
                self.current_row.append(self.current_cell.strip())
            elif tag == "tr":
                if self.current_row:
                    self.rows.append(self.current_row)

        def handle_data(self, data):
            if self.in_cell:
                self.current_cell += data

    parser = TableParser()
    parser.feed(html)
    if not parser.rows:
        return re.sub(r'<[^>]+>', ' ', html).strip()
    lines = []
    for i, row in enumerate(parser.rows):
        lines.append("| " + " | ".join(row) + " |")
        if i == 0:
            lines.append("| " + " | ".join(["---"] * len(row)) + " |")
    return "\n".join(lines)


def parse_dots_ocr_output(raw_output: str) -> str:
    """Parse dots.ocr JSON output, converting HTML tables to markdown."""
    try:
        items = json.loads(raw_output) if isinstance(raw_output, str) else raw_output
    except (json.JSONDecodeError, TypeError):
        return raw_output if isinstance(raw_output, str) else str(raw_output)
    if not isinstance(items, list):
        return str(items) if not isinstance(items, str) else items
    parts = []
    for item in items:
        text = item.get("text", "")
        if not text:
            continue
        if "<table" in text:
            parts.append(html_table_to_markdown(text))
        else:
            parts.append(text)
    return "\n\n".join(parts)


# ── Provider API key helpers ─────────────────────────────────────────

def _get_api_key(provider_slug: str) -> str:
    """Get API key for a provider from environment variables or DB settings."""
    env_map = {
        "openrouter": "OPENROUTER_API_KEY",
        "deepinfra": "DEEPINFRA_API_KEY",
        "novita": "NOVITA_API_KEY",
        "dashscope": "DASHSCOPE_API_KEY",
        "replicate": "REPLICATE_API_TOKEN",
        "google": "GEMINI_API_KEY",
    }
    var = env_map.get(provider_slug, f"{provider_slug.upper()}_API_KEY")
    # Check env first, then DB settings
    key = os.environ.get(var, "")
    if not key:
        try:
            from pipeline.storage import StorageClient
            storage = StorageClient()
            key = storage.get_setting(var) or ""
        except Exception:
            pass
    if not key:
        raise RuntimeError(f"Missing API key: {var}. Set it in Settings or as an environment variable.")
    return key


# ── Core API call ────────────────────────────────────────────────────

async def call_model(
    image_bytes: bytes,
    filename: str,
    prompt: str,
    model_api_id: str,
    provider_slug: str,
    provider_base_url: str,
    config: dict | None = None,
    max_tokens: int = 512,
    retries: int = 5,
) -> tuple[str, float]:
    """Call a VLM API and return (predicted_text, latency_seconds).

    Dispatches to the appropriate provider backend with model-specific
    content formatting and reasoning/thinking control.
    """
    config = config or {}
    reasoning_effort = config.get("reasoning_effort", "low")
    thinking = config.get("thinking", False)
    data_uri = _encode_image_bytes(image_bytes, filename)

    # ── Build content based on model-specific requirements ───────
    if "olmOCR" in model_api_id or "olmocr" in model_api_id.lower():
        olmocr_prompt = (
            "Attached is one page of a document that you must process. "
            "Just return the plain text representation of this document as if you were reading it naturally. "
            "Convert equations to LateX and tables to HTML."
        )
        content = [
            {"type": "image_url", "image_url": {"url": data_uri}},
            {"type": "text", "text": olmocr_prompt},
        ]
    elif "HunyuanOCR" in model_api_id:
        content = [{"type": "image_url", "image_url": {"url": data_uri}}]
    else:
        content = [
            {"type": "image_url", "image_url": {"url": data_uri}},
            {"type": "text", "text": prompt},
        ]

    messages = [{"role": "user", "content": content}]

    # Nemotron: disable thinking
    if "nemotron" in model_api_id.lower():
        messages.insert(0, {"role": "system", "content": "/no_think"})

    payload: dict = {
        "model": model_api_id,
        "max_tokens": max_tokens,
        "messages": messages,
    }

    # ── Provider-specific payload adjustments ────────────────────
    api_key = _get_api_key(provider_slug)
    url = provider_base_url

    if provider_slug == "openrouter":
        # Reasoning effort
        if "gemini-3" in model_api_id and "image-preview" not in model_api_id:
            payload["reasoning"] = {"effort": reasoning_effort}
        elif "gpt-5" in model_api_id or "o3" in model_api_id or "o4" in model_api_id:
            payload["reasoning_effort"] = reasoning_effort

        # Qwen3.5 thinking control
        if "qwen3.5" in model_api_id:
            if thinking:
                payload["max_tokens"] = 32768
            else:
                payload["max_tokens"] = 16384
                payload["transforms"] = ["no-thinking"]

        # Thinking models need higher token limits
        if reasoning_effort == "high":
            payload["max_tokens"] = 64000
        elif "gemini-3" in model_api_id and "image-preview" not in model_api_id:
            payload["max_tokens"] = max(max_tokens * 16, 8192)

    elif provider_slug == "deepinfra":
        pass  # defaults work

    elif provider_slug == "novita":
        payload["max_tokens"] = 4096
        if "qwen3.5" in model_api_id:
            if thinking:
                payload["max_tokens"] = 32768
            else:
                payload["chat_template_kwargs"] = {"enable_thinking": False}
                payload["max_tokens"] = 16384

    elif provider_slug == "dashscope":
        if "qwen-vl-ocr" in model_api_id:
            for item in content:
                if item.get("type") == "image_url":
                    item["min_pixels"] = 3072
                    item["max_pixels"] = 8388608
            payload["max_tokens"] = 4096
        elif "qwen3.5" in model_api_id:
            if thinking:
                payload["max_tokens"] = 32768
                payload["enable_thinking"] = True
            else:
                payload["enable_thinking"] = False
                payload["max_tokens"] = 16384

    elif provider_slug == "google":
        pass  # Gemini's OpenAI-compatible endpoint works with standard payloads

    elif provider_slug == "replicate":
        return await _call_replicate(model_api_id, image_bytes, filename, api_key, retries)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    timeout = TIMEOUT_THINKING if reasoning_effort == "high" else TIMEOUT_SECONDS

    # ── Retry loop ───────────────────────────────────────────────
    sem = _get_semaphore(provider_slug)
    async with sem:
        t0 = time.time()
        for attempt in range(retries):
            try:
                async with httpx.AsyncClient(timeout=timeout) as http:
                    resp = await http.post(url, headers=headers, json=payload)

                if resp.status_code in (429, 500, 502, 503) and attempt < retries - 1:
                    wait = min(10 * (2 ** attempt), 120)
                    logger.warning(f"[{resp.status_code}] retry in {wait}s for {model_api_id}")
                    await asyncio.sleep(wait)
                    continue

                resp.raise_for_status()
                break

            except httpx.ReadTimeout:
                if attempt < retries - 1:
                    wait = min(10 * (2 ** attempt), 120)
                    logger.warning(f"Timeout, retry in {wait}s for {model_api_id}")
                    await asyncio.sleep(wait)
                    continue
                raise

        elapsed = time.time() - t0
        data = resp.json()

        if "error" in data:
            raise RuntimeError(data["error"].get("message", str(data["error"])))

        text = data["choices"][0]["message"]["content"].strip()

        # dots.ocr outputs JSON with HTML tables
        if "dots.ocr" in model_api_id or "dots-ocr" in model_api_id:
            text = parse_dots_ocr_output(text)

        return text, elapsed


async def _call_replicate(
    model_id: str,
    image_bytes: bytes,
    filename: str,
    api_token: str,
    retries: int = 5,
) -> tuple[str, float]:
    """Call Replicate API with image bytes. Returns (text, latency)."""
    t0 = time.time()
    data_uri = _encode_image_bytes(image_bytes, filename)

    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as http:
                # Create prediction
                resp = await http.post(
                    "https://api.replicate.com/v1/predictions",
                    headers={
                        "Authorization": f"Bearer {api_token}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "version": model_id.split(":")[-1] if ":" in model_id else model_id,
                        "input": {"image": data_uri},
                    },
                )
                resp.raise_for_status()
                prediction = resp.json()

                # Poll for completion
                poll_url = prediction["urls"]["get"]
                while prediction["status"] not in ("succeeded", "failed", "canceled"):
                    await asyncio.sleep(2)
                    poll_resp = await http.get(
                        poll_url,
                        headers={"Authorization": f"Bearer {api_token}"},
                    )
                    poll_resp.raise_for_status()
                    prediction = poll_resp.json()

                if prediction["status"] != "succeeded":
                    raise RuntimeError(f"Replicate prediction failed: {prediction.get('error')}")

                elapsed = time.time() - t0
                output = prediction["output"]
                text = parse_dots_ocr_output(output)
                return text, elapsed

        except Exception as e:
            if attempt < retries - 1 and ("timeout" in str(e).lower() or "429" in str(e)):
                wait = min(5 * (2 ** attempt), 60)
                logger.warning(f"Replicate retry in {wait}s: {e}")
                await asyncio.sleep(wait)
                continue
            raise
    # Should not reach here
    raise RuntimeError("Replicate retries exhausted")
