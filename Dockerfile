# Pinned to a specific digest so security updates / Debian base bumps to
# python:3.11-slim don't silently change our build. Update deliberately
# by repulling the tag and replacing the digest below.
FROM python:3.11-slim@sha256:9a7765b36773a37061455b332f18e265e7f58f6fea9c419a550d2a8b0e9db834

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        git build-essential make gcc libffi-dev ca-certificates \
        wget \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

# Clone the NxN solver pinned to a specific commit. Keep this in lock-step
# with prefetch_tables.sh — table filenames are scraped from the solver
# source, so an upstream code change could rename/remove tables. The
# current digest is the last commit on master as of 2023-08-07. To bump:
#   git ls-remote https://github.com/dwalton76/rubiks-cube-NxNxN-solver HEAD
# and replace the SHA below, then rebuild from the prefetch step.
#
# We bypass `make init` (which fails on modern pip due to the project's
# setup.py lacking PEP 660 support) and instead:
#   1. compile the C ida_search_via_graph binary directly with gcc, and
#   2. add the repo to PYTHONPATH so `python3 rubiks-cube-solver.py`
#      imports the `rubikscubennnsolver` package without installation.
ARG SOLVER_SHA=c776db79314db3d98cc3dd99685ca85766656937
RUN git clone https://github.com/dwalton76/rubiks-cube-NxNxN-solver.git \
    && cd rubiks-cube-NxNxN-solver \
    && git checkout "${SOLVER_SHA}" \
    && git -c advice.detachedHead=false log -1 --format='solver pinned at %h %cd %s' --date=short
WORKDIR /opt/rubiks-cube-NxNxN-solver
RUN gcc -O3 -o ida_search_via_graph \
        rubikscubennnsolver/ida_search_core.c \
        rubikscubennnsolver/rotate_xxx.c \
        rubikscubennnsolver/ida_search_666.c \
        rubikscubennnsolver/ida_search_777.c \
        rubikscubennnsolver/ida_search_via_graph.c \
        -lm

ENV PYTHONPATH="/opt/rubiks-cube-NxNxN-solver:${PYTHONPATH}" \
    PATH="/opt/rubiks-cube-NxNxN-solver:${PATH}"

WORKDIR /app

# --- Slow, rarely-invalidated layers go first so day-to-day code edits
#     never trigger a re-prefetch of the ~11 GB lookup-table cache. The
#     order below is important; Docker's layer cache is content-addressed,
#     so anything below an edited line gets rebuilt.

# Python deps. Invalidates only when requirements.txt changes.
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

# Bake every dwalton76 lookup table into the image. Default source is a
# self-hosted single-tarball mirror — one HTTP request, ~3 GB on the
# wire, no dependency on the upstream S3 bucket.
#
# Override TABLES_TARBALL_URL="" (empty) to fall back to per-file fetch
# from dwalton76's public S3 bucket — kept as an emergency bootstrap
# path if the mirror is ever down. The deployed image makes no external
# calls either way; this arg only affects where the build pulls from.
ARG TABLES_TARBALL_URL="https://assets.jack-kaplan.com/projects/rubiks-cube/lookup-tables.tar.gz"
ARG TABLES_BUCKET_URL="https://rubiks-cube-lookup-tables.s3.amazonaws.com"
COPY backend/prefetch_tables.sh /tmp/prefetch_tables.sh
RUN TABLES_TARBALL_URL="${TABLES_TARBALL_URL}" \
    TABLES_BUCKET_URL="${TABLES_BUCKET_URL}" \
    bash /tmp/prefetch_tables.sh \
    && rm /tmp/prefetch_tables.sh

# --- Fast, frequently-edited layers go LAST. Changes here rebuild in
#     seconds because nothing below is invalidated.

# FastAPI app code.
COPY backend/app ./app

# Frontend static files served by FastAPI at "/".
COPY index.html ./static/index.html
COPY css        ./static/css
COPY js         ./static/js

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
