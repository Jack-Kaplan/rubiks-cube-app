#!/bin/bash
# Extract the in-image tarball into the lookup-tables volume on first
# boot (~3 min); sentinel skips it on every subsequent start.

set -euo pipefail

SOLVER_DIR=/opt/rubiks-cube-NxNxN-solver
TABLES_DIR="${SOLVER_DIR}/lookup-tables"
SENTINEL="${TABLES_DIR}/.populated"
TARBALL=/opt/lookup-tables.tar.gz

if [ ! -f "${SENTINEL}" ]; then
    echo "entrypoint: lookup-tables volume empty, extracting ${TARBALL}..."
    mkdir -p "${TABLES_DIR}"
    # Tarball contains a leading `lookup-tables/` directory; extract one
    # level up so contents land at ${TABLES_DIR}.
    tar -xzf "${TARBALL}" -C "${SOLVER_DIR}"
    touch "${SENTINEL}"
    echo "entrypoint: extraction complete ($(ls "${TABLES_DIR}" | wc -l) files)."
fi

exec "$@"
