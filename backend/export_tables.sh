#!/bin/bash
# Export the lookup-tables cache from a built image to a single tarball
# for hosting yourself:
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
# -C makes the tarball contain `lookup-tables/...` at root — the shape
# the prefetch script and entrypoint expect.
docker run --rm "${IMAGE}" \
    tar -cz -C /opt/rubiks-cube-NxNxN-solver lookup-tables > "${OUT}"

size=$(du -sh "${OUT}" | cut -f1)
sha=$(sha256sum "${OUT}" | cut -d' ' -f1)
echo
echo "exported ${size} → ${OUT}"
echo "sha256:  ${sha}"
