import asyncio
import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .jobs import JobStore
from .solver import SolverError, run_solve

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("solver")

app = FastAPI(title="Rubik's Cube Solver", version="0.1.0")

# CORS is only relevant if someone hosts the frontend somewhere else;
# in the default single-image deployment, the page and API share an origin.
origins_env = os.environ.get("CORS_ORIGINS", "*")
origins = [o.strip() for o in origins_env.split(",")] if origins_env != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

store = JobStore()


class SolveRequest(BaseModel):
    N: int = Field(ge=2, le=11)
    state: str


class SolveSubmit(BaseModel):
    jobId: str
    status: str


class SolveStatus(BaseModel):
    status: str
    moves: list[str] | None = None
    error: str | None = None


async def _worker(job_id: str, n: int, state: str) -> None:
    try:
        moves = await run_solve(n, state)
        await store.finish(job_id, moves)
        log.info("job %s done: N=%d, %d moves", job_id, n, len(moves))
    except SolverError as e:
        await store.fail(job_id, str(e))
        log.warning("job %s failed: %s", job_id, e)
    except Exception as e:  # noqa: BLE001
        await store.fail(job_id, f"internal error: {e}")
        log.exception("job %s crashed", job_id)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/solve", response_model=SolveSubmit)
async def submit_solve(req: SolveRequest) -> SolveSubmit:
    job = await store.create(req.N, req.state)
    asyncio.create_task(_worker(job.job_id, req.N, req.state))
    return SolveSubmit(jobId=job.job_id, status=job.status)


@app.get("/solve/{job_id}", response_model=SolveStatus)
async def get_solve(job_id: str) -> SolveStatus:
    job = await store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job id")
    resp = SolveStatus(status=job.status, moves=job.moves, error=job.error)
    # Drop the entry once a terminal result is delivered, so the in-memory
    # store doesn't grow unbounded.
    if job.status in ("done", "error"):
        await store.discard(job_id)
    return resp


# Serve the frontend from /. Mounted AFTER the API routes so /health and
# /solve are matched first. `html=True` makes "/" return index.html.
STATIC_DIR = os.environ.get("STATIC_DIR", "/app/static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
else:
    log.warning("static dir %s does not exist; frontend not served", STATIC_DIR)
