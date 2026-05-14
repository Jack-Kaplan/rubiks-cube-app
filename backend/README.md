# Cube Solver Backend

Thin FastAPI service that wraps [dwalton76/rubiks-cube-NxNxN-solver](https://github.com/dwalton76/rubiks-cube-NxNxN-solver) and exposes an async solve API for the frontend.

## API

- `POST /solve` — body `{N: int, state: str}` (state is a URFDLB facelet string of length 6·N²). Returns `{jobId, status: "pending"}`.
- `GET /solve/{jobId}` — returns `{status: "pending"|"done"|"error", moves?: string[], error?: string}`. The entry is discarded after a terminal status is read.
- `GET /health` — liveness probe.

## Build & run

```bash
cd backend
docker compose build         # downloads the solver + warms N=2..7 lookup tables (~1 GB, slow first time)
docker compose up            # exposes the API on :8000
```

To bake N=8..11 tables into the image (significantly increases image size and build time), uncomment the second warm-up `RUN` in the [Dockerfile](Dockerfile).

Override allowed CORS origins with the `CORS_ORIGINS` env var (comma-separated, or `*`).

## Smoke test

```bash
N=3
STATE=$(python3 -c "print('U'*9+'R'*9+'F'*9+'D'*9+'L'*9+'B'*9)")
curl -s -X POST localhost:8000/solve -H 'content-type: application/json' \
  -d "{\"N\": $N, \"state\": \"$STATE\"}"
# → {"jobId":"...", "status":"pending"}

curl -s localhost:8000/solve/<jobId>
# → {"status":"done","moves":[]}    (solved state, no moves needed)
```
