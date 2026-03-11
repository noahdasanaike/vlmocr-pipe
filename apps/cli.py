#!/usr/bin/env python3
"""
vlmocr-pipe CLI — manage jobs, models, settings, and benchmarks from the command line.

Usage:
    python apps/cli.py status
    python apps/cli.py jobs list
    python apps/cli.py jobs show <id>
    python apps/cli.py jobs create --name <name> --images <dir> --model <model_id> [--schema <json>] [--mode full|inference_only] [--ratio 0.3]
    python apps/cli.py jobs start <id>
    python apps/cli.py jobs results <id> [--format csv|json]
    python apps/cli.py jobs delete <id>
    python apps/cli.py models list [--type eval|finetune]
    python apps/cli.py providers list
    python apps/cli.py settings list
    python apps/cli.py settings set <key> <value>
    python apps/cli.py settings delete <key>
    python apps/cli.py benchmarks list
    python apps/cli.py benchmarks show <id>
    python apps/cli.py db info
"""
import argparse
import json
import os
import shutil
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Resolve paths
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "web" / "data"
DB_PATH = DATA_DIR / "ocr.db"
STORAGE_DIR = DATA_DIR / "storage"
SCHEMA_PATH = SCRIPT_DIR / "web" / "src" / "lib" / "db" / "schema.sql"
SEED_PATH = SCRIPT_DIR / "web" / "src" / "lib" / "db" / "seed.sql"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp", ".bmp"}


def get_db() -> sqlite3.Connection:
    """Open the shared SQLite database, initializing schema if needed."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    # Initialize schema + seed if tables don't exist
    try:
        conn.execute("SELECT 1 FROM jobs LIMIT 1")
    except sqlite3.OperationalError:
        schema = SCHEMA_PATH.read_text()
        conn.executescript(schema)
        seed = SEED_PATH.read_text()
        conn.executescript(seed)
    return conn


def fmt_time(ts: str | None) -> str:
    if not ts:
        return "-"
    return ts.replace("T", " ")[:19]


def truncate(s: str, n: int = 40) -> str:
    if not s:
        return ""
    return s[:n] + "..." if len(s) > n else s


# ── Commands ──────────────────────────────────────────────────────────


def cmd_status(args):
    conn = get_db()
    jobs = conn.execute("SELECT status, COUNT(*) as cnt FROM jobs GROUP BY status").fetchall()
    benchmarks = conn.execute("SELECT status, COUNT(*) as cnt FROM benchmark_runs GROUP BY status").fetchall()
    models = conn.execute("SELECT COUNT(*) as cnt FROM saved_models").fetchone()
    settings = conn.execute("SELECT COUNT(*) as cnt FROM settings").fetchone()
    eval_models = conn.execute("SELECT COUNT(*) as cnt FROM eval_models").fetchone()
    datasets = conn.execute("SELECT COUNT(*) as cnt FROM benchmark_datasets").fetchone()

    print("=== vlmocr-pipe status ===\n")
    print(f"Database: {DB_PATH}")
    print(f"Storage:  {STORAGE_DIR}\n")

    print("Jobs:")
    if jobs:
        for row in jobs:
            print(f"  {row['status']:>12}: {row['cnt']}")
    else:
        print("  (none)")

    print(f"\nBenchmark runs:")
    if benchmarks:
        for row in benchmarks:
            print(f"  {row['status']:>12}: {row['cnt']}")
    else:
        print("  (none)")

    print(f"\nSaved models:    {models['cnt']}")
    print(f"Eval models:     {eval_models['cnt']}")
    print(f"Datasets:        {datasets['cnt']}")
    print(f"Settings:        {settings['cnt']}")


def cmd_jobs_list(args):
    conn = get_db()
    jobs = conn.execute(
        "SELECT id, name, mode, status, total_images, labeled_count, inferred_count, created_at FROM jobs ORDER BY created_at DESC"
    ).fetchall()

    if not jobs:
        print("No jobs found.")
        return

    print(f"{'ID':>8}  {'Status':>10}  {'Mode':>14}  {'Images':>6}  {'Label':>5}  {'Infer':>5}  {'Created':>19}  Name")
    print("-" * 110)
    for j in jobs:
        jid = j["id"][:8]
        print(
            f"{jid:>8}  {j['status']:>10}  {j['mode']:>14}  {j['total_images']:>6}  "
            f"{j['labeled_count']:>5}  {j['inferred_count']:>5}  {fmt_time(j['created_at']):>19}  {truncate(j['name'], 30)}"
        )


def cmd_jobs_show(args):
    conn = get_db()
    job = conn.execute("SELECT * FROM jobs WHERE id = ? OR id LIKE ?", (args.id, args.id + "%")).fetchone()
    if not job:
        print(f"Job not found: {args.id}")
        sys.exit(1)

    j = dict(job)
    print(f"=== Job: {j['name']} ===\n")
    print(f"ID:             {j['id']}")
    print(f"Status:         {j['status']}")
    print(f"Mode:           {j['mode']}")
    print(f"Total images:   {j['total_images']}")
    print(f"Labeled:        {j['labeled_count']} / {j['label_images']}")
    print(f"Inferred:       {j['inferred_count']} / {j['infer_images']}")
    print(f"Label ratio:    {j['label_ratio']}")
    print(f"Created:        {fmt_time(j['created_at'])}")
    print(f"Started:        {fmt_time(j['started_at'])}")
    print(f"Completed:      {fmt_time(j['completed_at'])}")

    if j.get("error_message"):
        print(f"Error:          {j['error_message']}")

    schema = json.loads(j.get("extraction_schema") or "{}")
    if schema:
        print(f"\nExtraction schema:")
        for k, v in schema.items():
            print(f"  {k}: {v}")

    # Labeling model
    if j.get("labeling_model_id"):
        lm = conn.execute(
            "SELECT m.name, p.name as provider_name FROM eval_models m JOIN eval_providers p ON m.provider_id = p.id WHERE m.id = ?",
            (j["labeling_model_id"],)
        ).fetchone()
        if lm:
            print(f"\nLabeling model: {lm['name']} ({lm['provider_name']})")

    # Eval model (inference_only)
    if j.get("eval_model_api_id"):
        print(f"\nEval model:     {j['eval_model_api_id']} ({j['eval_model_provider_slug']})")

    # Model config
    mc = j.get("model_config")
    if mc:
        try:
            cfg = json.loads(mc) if isinstance(mc, str) else mc
            if cfg:
                print(f"Model config:   {json.dumps(cfg)}")
        except (json.JSONDecodeError, TypeError):
            pass

    # Finetune model
    if j.get("finetune_model_id"):
        fm = conn.execute("SELECT name, hf_repo FROM finetune_models WHERE id = ?", (j["finetune_model_id"],)).fetchone()
        if fm:
            print(f"Finetune model: {fm['name']} ({fm['hf_repo']})")

    # Image breakdown
    images = conn.execute(
        "SELECT role, label_status, infer_status, COUNT(*) as cnt FROM images WHERE job_id = ? GROUP BY role, label_status, infer_status",
        (j["id"],)
    ).fetchall()
    if images:
        print(f"\nImages:")
        for img in images:
            print(f"  {img['role']:>14} | label={img['label_status']:>8} infer={img['infer_status']:>8} | {img['cnt']}")


def cmd_jobs_create(args):
    conn = get_db()

    # Parse schema
    schema = {}
    if args.schema:
        try:
            schema = json.loads(args.schema)
        except json.JSONDecodeError:
            print(f"Invalid JSON schema: {args.schema}")
            sys.exit(1)

    # Validate model
    mode = args.mode or "full"
    model_id = args.model
    if mode == "inference_only":
        # model should be an eval model
        model = conn.execute(
            "SELECT m.*, p.slug as provider_slug, p.base_url as provider_base_url FROM eval_models m JOIN eval_providers p ON m.provider_id = p.id WHERE m.id = ? OR m.name LIKE ?",
            (model_id, f"%{model_id}%")
        ).fetchone()
        if not model:
            print(f"Eval model not found: {model_id}")
            print("Run: python apps/cli.py models list")
            sys.exit(1)
        model = dict(model)
    else:
        # Need both labeling model and finetune model
        if not args.finetune_model:
            print("Full mode requires --finetune-model. Run: python apps/cli.py models list --type finetune")
            sys.exit(1)
        labeling_model = conn.execute(
            "SELECT m.*, p.slug as provider_slug, p.base_url as provider_base_url FROM eval_models m JOIN eval_providers p ON m.provider_id = p.id WHERE m.id = ? OR m.name LIKE ?",
            (model_id, f"%{model_id}%")
        ).fetchone()
        if not labeling_model:
            print(f"Labeling model not found: {model_id}")
            sys.exit(1)
        finetune_model = conn.execute(
            "SELECT * FROM finetune_models WHERE id = ? OR name LIKE ?",
            (args.finetune_model, f"%{args.finetune_model}%")
        ).fetchone()
        if not finetune_model:
            print(f"Finetune model not found: {args.finetune_model}")
            sys.exit(1)

    # Collect images
    img_dir = Path(args.images)
    if not img_dir.is_dir():
        print(f"Not a directory: {args.images}")
        sys.exit(1)

    image_files = sorted(
        f for f in img_dir.iterdir()
        if f.is_file() and f.suffix.lower() in IMAGE_EXTS
    )
    if not image_files:
        print(f"No image files found in {img_dir}")
        sys.exit(1)

    # Create job
    job_id = str(uuid.uuid4())
    ratio = args.ratio or 0.3

    if mode == "inference_only":
        conn.execute(
            """INSERT INTO jobs (id, name, mode, extraction_schema, label_ratio,
               eval_model_id, eval_model_api_id, eval_model_provider_slug, eval_model_provider_base_url,
               status, created_at, updated_at)
               VALUES (?, ?, 'inference_only', ?, 0, ?, ?, ?, ?, 'uploading', datetime('now'), datetime('now'))""",
            (job_id, args.name, json.dumps(schema),
             model["id"], model["api_model_id"], model["provider_slug"], model["provider_base_url"])
        )
    else:
        conn.execute(
            """INSERT INTO jobs (id, name, mode, labeling_model_id, finetune_model_id,
               label_ratio, extraction_schema,
               status, created_at, updated_at)
               VALUES (?, ?, 'full', ?, ?, ?, ?, 'uploading', datetime('now'), datetime('now'))""",
            (job_id, args.name, labeling_model["id"], finetune_model["id"], ratio, json.dumps(schema))
        )
    conn.commit()

    # Copy images to storage
    job_storage = STORAGE_DIR / "jobs" / job_id / "images"
    job_storage.mkdir(parents=True, exist_ok=True)

    is_inference_only = mode == "inference_only"
    label_count = 0 if is_inference_only else max(1, int(len(image_files) * ratio))

    for i, f in enumerate(image_files):
        safe_name = f.name.replace(" ", "_")[:200]
        storage_path = f"jobs/{job_id}/images/{i}_{safe_name}"
        dest = STORAGE_DIR / storage_path
        shutil.copy2(str(f), str(dest))

        role = "infer_target" if is_inference_only else ("label_source" if i < label_count else "infer_target")
        conn.execute(
            "INSERT INTO images (id, job_id, storage_path, filename, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
            (str(uuid.uuid4()), job_id, storage_path, f.name, role)
        )

    conn.commit()

    print(f"Created job: {job_id[:8]}...")
    print(f"  Name:   {args.name}")
    print(f"  Mode:   {mode}")
    print(f"  Images: {len(image_files)} ({label_count} label, {len(image_files) - label_count} infer)")
    if schema:
        print(f"  Schema: {json.dumps(schema)}")
    print(f"\nRun 'python apps/cli.py jobs start {job_id[:8]}' to begin processing.")


def cmd_jobs_start(args):
    conn = get_db()
    job = conn.execute("SELECT * FROM jobs WHERE id = ? OR id LIKE ?", (args.id, args.id + "%")).fetchone()
    if not job:
        print(f"Job not found: {args.id}")
        sys.exit(1)

    job = dict(job)
    startable = ["uploading", "pending", "failed", "cancelled"]
    if job["status"] not in startable:
        print(f"Cannot start job in '{job['status']}' state (must be: {', '.join(startable)})")
        sys.exit(1)

    total = conn.execute("SELECT COUNT(*) as cnt FROM images WHERE job_id = ?", (job["id"],)).fetchone()["cnt"]
    if total == 0:
        print("No images in job. Add images first.")
        sys.exit(1)

    is_inference_only = job["mode"] == "inference_only"
    label_count = 0 if is_inference_only else max(1, int(total * (job["label_ratio"] or 0.3)))

    conn.execute(
        """UPDATE jobs SET status = 'pending', total_images = ?, label_images = ?, infer_images = ?,
           started_at = datetime('now'), updated_at = datetime('now'), error_message = NULL WHERE id = ?""",
        (total, label_count, total - label_count, job["id"])
    )
    conn.commit()
    print(f"Job {job['id'][:8]} queued (status -> pending). Worker will pick it up automatically.")


def cmd_jobs_results(args):
    conn = get_db()
    job = conn.execute("SELECT * FROM jobs WHERE id = ? OR id LIKE ?", (args.id, args.id + "%")).fetchone()
    if not job:
        print(f"Job not found: {args.id}")
        sys.exit(1)

    job = dict(job)
    schema = json.loads(job.get("extraction_schema") or "{}")
    images = conn.execute(
        "SELECT * FROM images WHERE job_id = ? ORDER BY created_at", (job["id"],)
    ).fetchall()

    results = []
    for img in images:
        predicted = json.loads(img["predicted_result"]) if img["predicted_result"] else None
        gemini = json.loads(img["gemini_label"]) if img["gemini_label"] else None
        data = predicted or gemini
        if data:
            results.append({
                "filename": img["filename"],
                "source": "label" if img["role"] == "label_source" else "model",
                **data,
            })

    if not results:
        print("No results yet.")
        return

    fmt = args.format or "json"
    if fmt == "csv":
        fields = list(schema.keys()) if schema else [k for k in results[0].keys() if k not in ("filename", "source")]
        header = ["filename", "source"] + fields
        print(",".join(header))
        for r in results:
            row = []
            for f in header:
                val = str(r.get(f, ""))
                row.append(f'"{val}"' if "," in val else val)
            print(",".join(row))
    else:
        print(json.dumps(results, indent=2, ensure_ascii=False))


def cmd_jobs_delete(args):
    conn = get_db()
    job = conn.execute("SELECT * FROM jobs WHERE id = ? OR id LIKE ?", (args.id, args.id + "%")).fetchone()
    if not job:
        print(f"Job not found: {args.id}")
        sys.exit(1)

    job = dict(job)
    active = ["labeling", "training", "inferring"]
    if job["status"] in active:
        print(f"Cannot delete job in '{job['status']}' state. Pause or cancel first.")
        sys.exit(1)

    # Delete storage
    job_dir = STORAGE_DIR / "jobs" / job["id"]
    if job_dir.exists():
        shutil.rmtree(str(job_dir))

    conn.execute("DELETE FROM images WHERE job_id = ?", (job["id"],))
    conn.execute("DELETE FROM jobs WHERE id = ?", (job["id"],))
    conn.commit()
    print(f"Deleted job {job['id'][:8]} ({job['name']})")


def cmd_models_list(args):
    conn = get_db()
    model_type = args.type or "eval"

    if model_type == "finetune":
        models = conn.execute("SELECT * FROM finetune_models WHERE is_active = 1 ORDER BY name").fetchall()
        print(f"{'ID':>4}  {'Name':<30}  HF Repo")
        print("-" * 80)
        for m in models:
            print(f"{m['id']:>4}  {m['name']:<30}  {m['hf_repo']}")
    else:
        models = conn.execute(
            "SELECT m.id, m.name, m.api_model_id, m.cost_per_image_credits, p.name as provider FROM eval_models m "
            "JOIN eval_providers p ON m.provider_id = p.id WHERE m.is_active = 1 ORDER BY p.name, m.name"
        ).fetchall()
        print(f"{'ID':>4}  {'Provider':<18}  {'Name':<25}  {'Cost':>4}  API Model ID")
        print("-" * 110)
        for m in models:
            print(f"{m['id']:>4}  {m['provider']:<18}  {m['name']:<25}  {m['cost_per_image_credits']:>4.1f}  {m['api_model_id']}")


def cmd_providers_list(args):
    conn = get_db()
    providers = conn.execute("SELECT * FROM eval_providers WHERE is_active = 1 ORDER BY name").fetchall()
    print(f"{'ID':>4}  {'Slug':<12}  {'Name':<20}  Base URL")
    print("-" * 100)
    for p in providers:
        print(f"{p['id']:>4}  {p['slug']:<12}  {p['name']:<20}  {p['base_url']}")


def cmd_settings_list(args):
    conn = get_db()
    settings = conn.execute("SELECT * FROM settings ORDER BY key").fetchall()
    if not settings:
        print("No settings configured.")
        return
    print(f"{'Key':<30}  {'Value':<40}  Updated")
    print("-" * 90)
    for s in settings:
        val = s["value"]
        # Mask secrets
        if any(k in s["key"].lower() for k in ("key", "token", "secret")):
            if len(val) > 8:
                val = val[:4] + "****" + val[-4:]
            else:
                val = "****"
        print(f"{s['key']:<30}  {truncate(val, 40):<40}  {fmt_time(s['updated_at'])}")


def cmd_settings_set(args):
    conn = get_db()
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) "
        "ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')",
        (args.key, args.value, args.value)
    )
    conn.commit()
    print(f"Set {args.key}")


def cmd_settings_delete(args):
    conn = get_db()
    result = conn.execute("DELETE FROM settings WHERE key = ?", (args.key,))
    conn.commit()
    if result.rowcount:
        print(f"Deleted {args.key}")
    else:
        print(f"Setting not found: {args.key}")


def cmd_benchmarks_list(args):
    conn = get_db()
    runs = conn.execute(
        "SELECT br.*, bd.name as dataset_name FROM benchmark_runs br "
        "LEFT JOIN benchmark_datasets bd ON br.dataset_id = bd.id "
        "ORDER BY br.created_at DESC"
    ).fetchall()
    if not runs:
        print("No benchmark runs.")
        return
    print(f"{'ID':>8}  {'Status':>10}  {'Samples':>7}  {'Done':>4}  {'Created':>19}  {'Dataset':<20}  Name")
    print("-" * 110)
    for r in runs:
        print(
            f"{r['id'][:8]:>8}  {r['status']:>10}  {r['total_samples']:>7}  {r['completed_samples']:>4}  "
            f"{fmt_time(r['created_at']):>19}  {truncate(r['dataset_name'] or '-', 20):<20}  {truncate(r['name'], 25)}"
        )


def cmd_benchmarks_show(args):
    conn = get_db()
    run = conn.execute("SELECT * FROM benchmark_runs WHERE id = ? OR id LIKE ?", (args.id, args.id + "%")).fetchone()
    if not run:
        print(f"Benchmark run not found: {args.id}")
        sys.exit(1)

    run = dict(run)
    print(f"=== Benchmark: {run['name']} ===\n")
    print(f"ID:        {run['id']}")
    print(f"Status:    {run['status']}")
    print(f"Samples:   {run['completed_samples']} / {run['total_samples']}")
    print(f"Created:   {fmt_time(run['created_at'])}")
    print(f"Completed: {fmt_time(run['completed_at'])}")
    if run.get("error_message"):
        print(f"Error:     {run['error_message']}")

    # Show model results
    run_models = conn.execute(
        "SELECT rm.*, m.name as model_name, p.name as provider_name "
        "FROM benchmark_run_models rm "
        "JOIN eval_models m ON rm.model_id = m.id "
        "JOIN eval_providers p ON m.provider_id = p.id "
        "WHERE rm.run_id = ? ORDER BY rm.sococrbench_score DESC NULLS LAST",
        (run["id"],)
    ).fetchall()

    if run_models:
        print(f"\n{'Model':<25}  {'Provider':<15}  {'Status':>8}  {'NES':>6}  {'CER':>6}  {'F1':>6}  {'SocOCR':>6}  {'ms':>6}")
        print("-" * 110)
        for rm in run_models:
            nes = f"{rm['avg_nes']:.3f}" if rm["avg_nes"] is not None else "-"
            cer = f"{rm['avg_cer']:.3f}" if rm["avg_cer"] is not None else "-"
            f1 = f"{rm['avg_f1']:.3f}" if rm["avg_f1"] is not None else "-"
            soc = f"{rm['sococrbench_score']:.3f}" if rm["sococrbench_score"] is not None else "-"
            lat = f"{rm['avg_latency_ms']:.0f}" if rm["avg_latency_ms"] is not None else "-"
            print(
                f"{truncate(rm['model_name'], 25):<25}  {rm['provider_name']:<15}  {rm['status']:>8}  "
                f"{nes:>6}  {cer:>6}  {f1:>6}  {soc:>6}  {lat:>6}"
            )


def cmd_db_info(args):
    conn = get_db()
    print(f"Database: {DB_PATH}")
    print(f"Size:     {DB_PATH.stat().st_size / 1024:.1f} KB" if DB_PATH.exists() else "Size:     (not created)")
    print(f"Storage:  {STORAGE_DIR}\n")

    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    print(f"{'Table':<25}  Rows")
    print("-" * 35)
    for t in tables:
        count = conn.execute(f"SELECT COUNT(*) as cnt FROM [{t['name']}]").fetchone()["cnt"]
        print(f"{t['name']:<25}  {count}")


# ── Argument parser ───────────────────────────────────────────────────


def build_parser():
    parser = argparse.ArgumentParser(
        prog="vlmocr",
        description="vlmocr-pipe CLI — manage OCR jobs, models, and benchmarks",
    )
    sub = parser.add_subparsers(dest="command", help="Command")

    # status
    sub.add_parser("status", help="Show system status")

    # jobs
    jobs_p = sub.add_parser("jobs", help="Manage jobs")
    jobs_sub = jobs_p.add_subparsers(dest="jobs_command")

    jobs_sub.add_parser("list", help="List all jobs")

    show_p = jobs_sub.add_parser("show", help="Show job details")
    show_p.add_argument("id", help="Job ID (prefix match)")

    create_p = jobs_sub.add_parser("create", help="Create a new job")
    create_p.add_argument("--name", required=True, help="Job name")
    create_p.add_argument("--images", required=True, help="Directory with images")
    create_p.add_argument("--model", required=True, help="Eval model ID or name substring (for labeling or inference)")
    create_p.add_argument("--finetune-model", help="Finetune model ID (required for full mode)")
    create_p.add_argument("--schema", help="Extraction schema as JSON string")
    create_p.add_argument("--mode", choices=["full", "inference_only"], default="inference_only")
    create_p.add_argument("--ratio", type=float, default=0.3, help="Label ratio (default 0.3)")

    start_p = jobs_sub.add_parser("start", help="Start a pending job")
    start_p.add_argument("id", help="Job ID (prefix match)")

    results_p = jobs_sub.add_parser("results", help="Export job results")
    results_p.add_argument("id", help="Job ID (prefix match)")
    results_p.add_argument("--format", choices=["json", "csv"], default="json")

    delete_p = jobs_sub.add_parser("delete", help="Delete a job and its data")
    delete_p.add_argument("id", help="Job ID (prefix match)")

    # models
    models_p = sub.add_parser("models", help="List available models")
    models_sub = models_p.add_subparsers(dest="models_command")
    ml = models_sub.add_parser("list", help="List models")
    ml.add_argument("--type", choices=["eval", "finetune"], default="eval")

    # providers
    prov_p = sub.add_parser("providers", help="List providers")
    prov_sub = prov_p.add_subparsers(dest="providers_command")
    prov_sub.add_parser("list", help="List providers")

    # settings
    settings_p = sub.add_parser("settings", help="Manage settings")
    settings_sub = settings_p.add_subparsers(dest="settings_command")
    settings_sub.add_parser("list", help="List all settings")

    set_p = settings_sub.add_parser("set", help="Set a setting")
    set_p.add_argument("key", help="Setting key (e.g. OPENROUTER_API_KEY)")
    set_p.add_argument("value", help="Setting value")

    del_p = settings_sub.add_parser("delete", help="Delete a setting")
    del_p.add_argument("key", help="Setting key")

    # benchmarks
    bench_p = sub.add_parser("benchmarks", help="Manage benchmarks")
    bench_sub = bench_p.add_subparsers(dest="benchmarks_command")
    bench_sub.add_parser("list", help="List benchmark runs")
    bench_show = bench_sub.add_parser("show", help="Show benchmark details")
    bench_show.add_argument("id", help="Benchmark run ID (prefix match)")

    # db
    db_p = sub.add_parser("db", help="Database info")
    db_sub = db_p.add_subparsers(dest="db_command")
    db_sub.add_parser("info", help="Show database info")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    dispatch = {
        "status": cmd_status,
        "db": lambda a: cmd_db_info(a) if getattr(a, "db_command", None) == "info" else print("Usage: vlmocr db info"),
    }

    if args.command == "jobs":
        sub_dispatch = {
            "list": cmd_jobs_list,
            "show": cmd_jobs_show,
            "create": cmd_jobs_create,
            "start": cmd_jobs_start,
            "results": cmd_jobs_results,
            "delete": cmd_jobs_delete,
        }
        cmd = getattr(args, "jobs_command", None)
        if cmd in sub_dispatch:
            sub_dispatch[cmd](args)
        else:
            print("Usage: vlmocr jobs {list|show|create|start|results|delete}")

    elif args.command == "models":
        cmd = getattr(args, "models_command", None)
        if cmd == "list":
            cmd_models_list(args)
        else:
            print("Usage: vlmocr models list [--type eval|finetune]")

    elif args.command == "providers":
        cmd = getattr(args, "providers_command", None)
        if cmd == "list":
            cmd_providers_list(args)
        else:
            print("Usage: vlmocr providers list")

    elif args.command == "settings":
        sub_dispatch = {
            "list": cmd_settings_list,
            "set": cmd_settings_set,
            "delete": cmd_settings_delete,
        }
        cmd = getattr(args, "settings_command", None)
        if cmd in sub_dispatch:
            sub_dispatch[cmd](args)
        else:
            print("Usage: vlmocr settings {list|set|delete}")

    elif args.command == "benchmarks":
        sub_dispatch = {
            "list": cmd_benchmarks_list,
            "show": cmd_benchmarks_show,
        }
        cmd = getattr(args, "benchmarks_command", None)
        if cmd in sub_dispatch:
            sub_dispatch[cmd](args)
        else:
            print("Usage: vlmocr benchmarks {list|show}")

    elif args.command in dispatch:
        dispatch[args.command](args)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
