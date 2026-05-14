import asyncio
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Job:
    job_id: str
    n: int
    state: str
    status: str = "pending"  # "pending" | "done" | "error"
    moves: Optional[list[str]] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None


class JobStore:
    """In-memory job registry. Single-process; do not run with multiple workers."""

    def __init__(self, ttl_seconds: float = 600.0):
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()
        self._ttl = ttl_seconds

    async def create(self, n: int, state: str) -> Job:
        async with self._lock:
            self._gc()
            job_id = secrets.token_urlsafe(12)
            job = Job(job_id=job_id, n=n, state=state)
            self._jobs[job_id] = job
            return job

    async def get(self, job_id: str) -> Optional[Job]:
        async with self._lock:
            return self._jobs.get(job_id)

    async def finish(self, job_id: str, moves: list[str]) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = "done"
            job.moves = moves
            job.finished_at = time.time()

    async def fail(self, job_id: str, error: str) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = "error"
            job.error = error
            job.finished_at = time.time()

    async def discard(self, job_id: str) -> None:
        async with self._lock:
            self._jobs.pop(job_id, None)

    def _gc(self) -> None:
        now = time.time()
        stale = [
            jid for jid, j in self._jobs.items()
            if j.finished_at is not None and (now - j.finished_at) > self._ttl
        ]
        for jid in stale:
            self._jobs.pop(jid, None)
