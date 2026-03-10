import asyncio
import logging

from pipeline.storage import StorageClient
from pipeline.orchestrator import PipelineOrchestrator
from pipeline.benchmark_orchestrator import BenchmarkOrchestrator

logger = logging.getLogger(__name__)

POLL_INTERVAL = 5  # seconds


class QueueConsumer:
    def __init__(self):
        self.storage = StorageClient()
        self.orchestrator = PipelineOrchestrator()
        self.benchmark_orchestrator = BenchmarkOrchestrator()

    async def run(self):
        logger.info("Queue consumer starting (DB polling mode)...")

        while True:
            try:
                # Check for pending fine-tuning jobs
                job = self._claim_next_job()
                if job is not None:
                    job_id = job["id"]
                    logger.info(f"Picked up job: {job_id} ({job['name']})")
                    try:
                        await self.orchestrator.run(job_id)
                    except Exception as e:
                        logger.error(f"Job {job_id} failed: {e}", exc_info=True)
                        await self.orchestrator.update_job_status(
                            job_id, "failed", error_message=str(e)
                        )
                    continue

                # Check for pending benchmark runs
                bench_run = self.storage.claim_benchmark_run()
                if bench_run is not None:
                    run_id = bench_run["id"]
                    logger.info(f"Picked up benchmark run: {run_id} ({bench_run['name']})")
                    try:
                        await self.benchmark_orchestrator.run(run_id)
                    except Exception as e:
                        logger.error(f"Benchmark run {run_id} failed: {e}", exc_info=True)
                        self.storage.update_benchmark_run(
                            run_id, status="failed", error_message=str(e)[:500]
                        )
                    continue

                # Nothing to do — sleep
                await asyncio.sleep(POLL_INTERVAL)

            except Exception as e:
                logger.error(f"Queue consumer error: {e}", exc_info=True)
                await asyncio.sleep(POLL_INTERVAL)

    def _claim_next_job(self) -> dict | None:
        """Atomically claim the oldest pending job by updating its status."""
        conn = self.storage._get_conn()

        # Find oldest pending job
        row = conn.execute(
            "SELECT id, name, mode FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1"
        ).fetchone()

        if not row:
            conn.close()
            return None

        job = dict(row)

        # Set initial status based on mode
        initial_status = "inferring" if job.get("mode") == "inference_only" else "labeling"

        # Claim it by setting status (only if still pending)
        result = conn.execute(
            "UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'",
            (initial_status, job["id"]),
        )
        conn.commit()

        if result.rowcount == 0:
            conn.close()
            return None  # Someone else claimed it

        conn.close()
        return job
