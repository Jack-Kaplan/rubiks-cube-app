# Base image pinned by digest — bump deliberately, not silently.
FROM python:3.11-slim@sha256:9a7765b36773a37061455b332f18e265e7f58f6fea9c419a550d2a8b0e9db834

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        git build-essential make gcc libffi-dev ca-certificates \
        wget \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

# SOLVER_SHA: last commit on dwalton76 master as of 2023-08-07. To bump:
#   git ls-remote https://github.com/dwalton76/rubiks-cube-NxNxN-solver HEAD
# Then rebuild from the prefetch step — table filenames are scraped from
# the solver source, so an upstream rename can drop tables silently.
#
# `make init` is bypassed (its setup.py lacks PEP 660 so it fails on
# modern pip); we gcc the C binary directly and use PYTHONPATH instead.
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

# Layer order matters: slow/rare layers above, fast/frequent below.
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

# Bake the lookup-table tarball (~3 GB) into the image; entrypoint.sh
# extracts it into the named volume on first container start. Override
# TABLES_TARBALL_URL="" to fall back to per-file S3 fetch.
ARG TABLES_TARBALL_URL="https://assets.jack-kaplan.com/projects/rubiks-cube/lookup-tables.tar.gz"
ARG TABLES_BUCKET_URL="https://rubiks-cube-lookup-tables.s3.amazonaws.com"
COPY backend/prefetch_tables.sh /tmp/prefetch_tables.sh
RUN TABLES_TARBALL_URL="${TABLES_TARBALL_URL}" \
    TABLES_BUCKET_URL="${TABLES_BUCKET_URL}" \
    bash /tmp/prefetch_tables.sh \
    && rm /tmp/prefetch_tables.sh

COPY backend/app ./app
COPY index.html ./static/index.html
COPY css        ./static/css
COPY js         ./static/js

COPY backend/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
