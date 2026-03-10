# vlmocr-pipe

Local, self-hosted pipeline for digitizing documents with vision language models. Upload document images, auto-label with any VLM, fine-tune an open-source model with LoRA, and run batch inference — all locally.

Companion software to [*Zero-Shot Digitization of Historical Documents with Vision Language Models*](https://www.dropbox.com/scl/fi/kjstgkkofqjs45jugxpcc/dasanaike_vlms.pdf?rlkey=ewkv46l5ghil61u3l66441k31&e=1&st=q5zd7410&dl=0) (Dasanaike 2026).

## What it does

1. **Upload** document images (drag-and-drop, ZIP, or cloud import)
2. **Auto-label** a subset using any VLM to generate training data
3. **Fine-tune** a small open-source VLM (LoRA) on your labeled data using your local GPU
4. **Batch inference** over the remaining images with the fine-tuned model
5. **Benchmark** 25+ VLMs across providers using [SocOCRBench](https://www.dropbox.com/scl/fi/kjstgkkofqjs45jugxpcc/dasanaike_vlms.pdf?rlkey=ewkv46l5ghil61u3l66441k31&e=1&st=q5zd7410&dl=0), spanning 6 world regions, 3 historical periods, and 4 document formats

## Architecture

- **Web UI**: Next.js app with SQLite (zero-config, no external database)
- **Worker**: Python process that polls the database and runs ML pipelines
- **Storage**: Local filesystem (`apps/web/data/storage/`)
- **Training**: PyTorch + PEFT (LoRA) + TRL, runs on your GPU

No cloud infrastructure required. No accounts, no billing, no authentication.

## Prerequisites

- [Node.js](https://nodejs.org) >= 18
- Python >= 3.10
- At least one API key for a supported provider (see [Configuration](#configuration))
- (Recommended) NVIDIA GPU with >= 8 GB VRAM for fine-tuning

## Quick start

```bash
git clone https://github.com/noahdasanaike/vlmocr-pipe.git
cd vlmocr-pipe
```

**Linux / macOS:**
```bash
chmod +x start.sh
./start.sh
```

**Windows:**
```
start.bat
```

This installs dependencies, creates data directories, and starts both services. Open [http://localhost:3000](http://localhost:3000).

### Manual start

If you prefer to start services separately:

```bash
# Terminal 1 — Web UI
cd apps/web
npm install
npm run dev

# Terminal 2 — Worker
cd apps/worker
pip install -r requirements.txt
python main.py
```

## Configuration

Go to **Settings** in the sidebar ([localhost:3000/settings](http://localhost:3000/settings)) to add API keys:

| Provider | Key | Used for |
|----------|-----|----------|
| Google AI Studio | `GEMINI_API_KEY` | Gemini models (labeling, benchmarking) |
| OpenRouter | `OPENROUTER_API_KEY` | GPT-5, Gemini 3, Claude, Qwen, Llama, etc. |
| DeepInfra | `DEEPINFRA_API_KEY` | olmOCR, DeepSeek-OCR, PaddleOCR, etc. |
| Novita | `NOVITA_API_KEY` | DeepSeek-OCR, ERNIE, Qwen models |
| DashScope | `DASHSCOPE_API_KEY` | Qwen models (direct from Alibaba) |
| Replicate | `REPLICATE_API_TOKEN` | dots.ocr |

Add at least one provider key to get started. Any model from any provider can be used for labeling, benchmarking, or inference.

Keys can alternatively be set in a `.env` file (copy `.env.example`).

## Project structure

```
vlmocr-pipe/
├── apps/
│   ├── web/                  # Next.js frontend + API
│   │   ├── src/
│   │   │   ├── app/          # Pages and API routes
│   │   │   ├── components/   # UI components (shadcn/ui)
│   │   │   └── lib/
│   │   │       ├── db/       # SQLite schema, seed data, wrapper
│   │   │       └── storage.ts # Local file storage helpers
│   │   └── data/             # SQLite DB + uploaded files (gitignored)
│   └── worker/               # Python ML worker
│       ├── main.py           # Entry point (polls DB for jobs)
│       ├── queue_consumer.py # Job queue polling
│       └── pipeline/
│           ├── labeler.py    # Gemini auto-labeling
│           ├── trainer.py    # LoRA fine-tuning (PyTorch + PEFT)
│           ├── inferencer.py # Local model inference
│           ├── orchestrator.py
│           ├── evaluator.py  # Multi-provider VLM calls
│           ├── metrics.py    # NES, CER, F1, SocOCRBench scoring
│           ├── benchmark_orchestrator.py
│           └── storage.py    # SQLite + filesystem access
├── start.sh                  # One-command launcher (Linux/macOS)
├── start.bat                 # One-command launcher (Windows)
└── .env.example
```

## Workflow

### Fine-tuning pipeline

1. Create a new job, select any VLM for labeling and a base model to fine-tune
2. Upload document images
3. Start the job — the worker will:
   - Label a subset of images using your chosen VLM (configurable ratio, default 30%)
   - Fine-tune the base model with LoRA on the labeled data
   - Run inference on remaining images with the fine-tuned model
4. Download results as JSON from the job page

### Benchmarking

1. Upload a benchmark dataset (images + ground truth)
2. Select models to evaluate
3. Run the benchmark — computes NES, CER, and F1 per sample
4. View aggregate scores, macro-averaged by region, period, and format (SocOCRBench methodology)

## Citation

If you use this software in academic work, please cite:

```bibtex
@article{dasanaike2026vlm,
  title={Zero-Shot Digitization of Historical Documents with Vision Language Models},
  author={Dasanaike, Noah},
  year={2026}
}
```

## License

MIT
