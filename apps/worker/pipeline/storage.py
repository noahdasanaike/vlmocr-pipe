import os
import json
import sqlite3
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Find the data directory (same SQLite DB as the web app)
def _find_data_dir():
    # Walk up from worker dir to find the web app's data dir
    # Structure: ocr-saas/apps/worker/ and ocr-saas/apps/web/data/
    worker_dir = Path(__file__).resolve().parent.parent
    data_dir = worker_dir.parent / "web" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir

DATA_DIR = _find_data_dir()
DB_PATH = DATA_DIR / "ocr.db"
STORAGE_DIR = DATA_DIR / "storage"

class StorageClient:
    def __init__(self):
        STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    def _get_conn(self):
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def get_db(self):
        return self  # For compatibility

    async def download_image(self, storage_path: str) -> bytes:
        full_path = STORAGE_DIR / storage_path
        return full_path.read_bytes()

    def upload_file(self, path: str, data: bytes, content_type: str = ""):
        full_path = STORAGE_DIR / path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(data)

    def create_signed_url(self, path: str, expires_in: int = 3600) -> str:
        # For local, just return the storage path (worker reads files directly)
        return str(STORAGE_DIR / path)

    # DB operations
    def update_job(self, job_id: str, **kwargs):
        conn = self._get_conn()
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        values = list(kwargs.values()) + [job_id]
        conn.execute(f"UPDATE jobs SET {sets}, updated_at = datetime('now') WHERE id = ?", values)
        conn.commit()
        conn.close()

    def update_image(self, image_id: str, **kwargs):
        conn = self._get_conn()
        # JSON-encode dict values
        processed = {}
        for k, v in kwargs.items():
            if isinstance(v, dict):
                processed[k] = json.dumps(v)
            else:
                processed[k] = v
        sets = ", ".join(f"{k} = ?" for k in processed)
        values = list(processed.values()) + [image_id]
        conn.execute(f"UPDATE images SET {sets} WHERE id = ?", values)
        conn.commit()
        conn.close()

    def get_job(self, job_id: str) -> dict:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            conn.close()
            raise RuntimeError(f"Job {job_id} not found")
        job = dict(row)
        # Parse JSON fields
        job["extraction_schema"] = json.loads(job.get("extraction_schema") or "{}")
        # Join labeling_model (now from eval_models + eval_providers)
        if job.get("labeling_model_id"):
            lm = conn.execute("SELECT * FROM eval_models WHERE id = ?", (job["labeling_model_id"],)).fetchone()
            if lm:
                lm_dict = dict(lm)
                provider = conn.execute("SELECT * FROM eval_providers WHERE id = ?", (lm_dict["provider_id"],)).fetchone()
                lm_dict["provider"] = dict(provider) if provider else None
                job["labeling_model"] = lm_dict
            else:
                job["labeling_model"] = None
        else:
            job["labeling_model"] = None
        # Join finetune_model
        if job.get("finetune_model_id"):
            fm = conn.execute("SELECT * FROM finetune_models WHERE id = ?", (job["finetune_model_id"],)).fetchone()
            job["finetune_model"] = dict(fm) if fm else None
        else:
            job["finetune_model"] = None
        conn.close()
        return job

    def get_images(self, job_id: str, role: str | None = None) -> list[dict]:
        conn = self._get_conn()
        if role:
            rows = conn.execute("SELECT * FROM images WHERE job_id = ? AND role = ? ORDER BY created_at", (job_id, role)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM images WHERE job_id = ? ORDER BY created_at", (job_id,)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["gemini_label"] = json.loads(d["gemini_label"]) if d.get("gemini_label") else None
            d["predicted_result"] = json.loads(d["predicted_result"]) if d.get("predicted_result") else None
            result.append(d)
        conn.close()
        return result

    def get_setting(self, key: str) -> str | None:
        conn = self._get_conn()
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        conn.close()
        return row["value"] if row else None

    # Benchmark methods
    def get_benchmark_run(self, run_id: str) -> dict:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM benchmark_runs WHERE id = ?", (run_id,)).fetchone()
        if not row:
            conn.close()
            return None
        run = dict(row)
        ds = conn.execute("SELECT * FROM benchmark_datasets WHERE id = ?", (run["dataset_id"],)).fetchone()
        run["dataset"] = dict(ds) if ds else None
        conn.close()
        return run

    def get_run_models(self, run_id: str) -> list[dict]:
        conn = self._get_conn()
        rows = conn.execute("SELECT * FROM benchmark_run_models WHERE run_id = ? ORDER BY created_at", (run_id,)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            model = conn.execute("SELECT * FROM eval_models WHERE id = ?", (d["model_id"],)).fetchone()
            if model:
                md = dict(model)
                md["config"] = json.loads(md.get("config") or "{}")
                provider = conn.execute("SELECT * FROM eval_providers WHERE id = ?", (md["provider_id"],)).fetchone()
                md["provider"] = dict(provider) if provider else None
                d["model"] = md
            else:
                d["model"] = None
            result.append(d)
        conn.close()
        return result

    def get_benchmark_samples(self, dataset_id: str) -> list[dict]:
        conn = self._get_conn()
        rows = conn.execute("SELECT * FROM benchmark_samples WHERE dataset_id = ? ORDER BY created_at", (dataset_id,)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["metadata"] = json.loads(d.get("metadata") or "{}")
            result.append(d)
        conn.close()
        return result

    def insert_benchmark_result(self, run_model_id: str, sample_id: str, **kwargs) -> dict:
        import uuid
        conn = self._get_conn()
        result_id = str(uuid.uuid4())
        cols = ["id", "run_model_id", "sample_id"] + list(kwargs.keys())
        placeholders = ", ".join(["?"] * len(cols))
        col_str = ", ".join(cols)
        values = [result_id, run_model_id, sample_id] + list(kwargs.values())
        conn.execute(f"INSERT INTO benchmark_results ({col_str}) VALUES ({placeholders})", values)
        conn.commit()
        conn.close()
        return {"id": result_id, "run_model_id": run_model_id, "sample_id": sample_id, **kwargs}

    def update_run_model(self, run_model_id: str, **kwargs):
        conn = self._get_conn()
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        values = list(kwargs.values()) + [run_model_id]
        conn.execute(f"UPDATE benchmark_run_models SET {sets} WHERE id = ?", values)
        conn.commit()
        conn.close()

    def update_benchmark_run(self, run_id: str, **kwargs):
        conn = self._get_conn()
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        values = list(kwargs.values()) + [run_id]
        conn.execute(f"UPDATE benchmark_runs SET {sets}, updated_at = datetime('now') WHERE id = ?", values)
        conn.commit()
        conn.close()

    def claim_benchmark_run(self) -> dict | None:
        conn = self._get_conn()
        row = conn.execute("SELECT id, name FROM benchmark_runs WHERE status = 'pending' ORDER BY created_at LIMIT 1").fetchone()
        if not row:
            conn.close()
            return None
        run = dict(row)
        result = conn.execute("UPDATE benchmark_runs SET status = 'running', updated_at = datetime('now') WHERE id = ? AND status = 'pending'", (run["id"],))
        conn.commit()
        if result.rowcount == 0:
            conn.close()
            return None
        conn.close()
        return run

    def get_benchmark_results_for_run_model(self, run_model_id: str) -> list[dict]:
        conn = self._get_conn()
        rows = conn.execute("""
            SELECT br.*, bs.storage_path as sample_storage_path, bs.filename as sample_filename,
                   bs.ground_truth as sample_ground_truth, bs.metadata as sample_metadata
            FROM benchmark_results br
            JOIN benchmark_samples bs ON br.sample_id = bs.id
            WHERE br.run_model_id = ?
        """, (run_model_id,)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["sample"] = {
                "storage_path": d.pop("sample_storage_path"),
                "filename": d.pop("sample_filename"),
                "ground_truth": d.pop("sample_ground_truth"),
                "metadata": json.loads(d.pop("sample_metadata") or "{}"),
            }
            result.append(d)
        conn.close()
        return result
