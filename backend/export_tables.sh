#!/bin/bash
# One-time export: pull the lookup-tables cache out of a built cube-solver
# image and write it to a single tarball you can host yourself (NAS, internal
# nginx, etc.). Once on your NAS, point future builds at it via:
#
#   docker compose build --build-arg TABLES_TARBALL_URL=http://nas.local/lookup-tables.tar.gz
#
# Usage:
#   ./backend/export_tables.sh                       → ./lookup-tables.tar.gz
#   ./backend/export_tables.sh /path/to/output.tgz   → custom output path

set -euo pipefail

OUT="${1:-./lookup-tables.tar.gz}"
IMAGE="${IMAGE:-cube-solver:latest}"

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
    echo "image ${IMAGE} not found locally; build it first or set IMAGE=..." >&2
    exit 1
fi

echo "exporting lookup-tables/ from ${IMAGE} → ${OUT}"
# Stream tar from inside a one-shot container so we don't materialize a
# layer copy on the host. -C means "relative to /opt/...solver/" so the
# tarball contains `lookup-tables/...` at the root — same shape the
# prefetch script expects.
docker run --rm "${IMAGE}" \
    tar -cz -C /opt/rubiks-cube-NxNxN-solver lookup-tables > "${OUT}"

size=$(du -sh "${OUT}" | cut -f1)
sha=$(sha256sum "${OUT}" | cut -d' ' -f1)
echo
echo "exported ${size} → ${OUT}"
echo "sha256:  ${sha}"
echo
echo "next steps:"
echo "  1. copy ${OUT} to your NAS"
echo "  2. expose it via HTTP (any static file server)"
echo "  3. build future images with:"
echo "       docker compose build --build-arg TABLES_TARBALL_URL=http://<host>/$(basename "${OUT}")"
