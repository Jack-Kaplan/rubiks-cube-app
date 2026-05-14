FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        git build-essential make gcc libffi-dev ca-certificates \
        wget \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

# Clone the NxN solver. We bypass `make init` (which fails on modern pip
# due to the project's setup.py lacking PEP 660 support) and instead:
#   1. compile the C ida_search_via_graph binary directly with gcc, and
#   2. add the repo to PYTHONPATH so `python3 rubiks-cube-solver.py`
#      imports the `rubikscubennnsolver` package without installation.
RUN git clone --depth 1 https://github.com/dwalton76/rubiks-cube-NxNxN-solver.git
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

# Bake every dwalton76 lookup table into the image. ~3 min on a cold build.
# Invalidates only when prefetch_tables.sh itself changes (or the solver
# repo is re-cloned at the top of this Dockerfile).
COPY backend/prefetch_tables.sh /tmp/prefetch_tables.sh
RUN bash /tmp/prefetch_tables.sh && rm /tmp/prefetch_tables.sh

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
