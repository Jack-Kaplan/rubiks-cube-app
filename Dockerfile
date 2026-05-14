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
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

# FastAPI app code.
COPY backend/app ./app

# Frontend static files. Same image, same port — FastAPI mounts /app/static
# at "/" and serves index.html, css/, and js/ alongside the API routes.
COPY index.html ./static/index.html
COPY css ./static/css
COPY js ./static/js

# Optional: pre-warm lookup tables for big cubes (N=2, 4..7) so they're
# baked into the image instead of fetched at runtime. This adds ~hundreds
# of MB and several minutes to the build. Uncomment to enable.
COPY backend/warm_tables.py /tmp/warm_tables.py
# RUN python3 /tmp/warm_tables.py && rm /tmp/warm_tables.py

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
