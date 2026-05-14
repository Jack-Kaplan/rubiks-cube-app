#!/bin/bash
# Populate /opt/rubiks-cube-NxNxN-solver/lookup-tables/ so the running
# container makes no external network calls. Run once at image build time.
#
# Two modes, picked at build time:
#
#   1. Tarball mirror (preferred when you have your own storage):
#      export the cache once from a known-good image (see
#      ./export_tables.sh), drop the resulting .tar.gz on any HTTP-serving
#      box (NAS, internal nginx, `python3 -m http.server`, etc.), and pass
#      the URL via TABLES_TARBALL_URL. Single request, single untar.
#
#   2. S3 per-file mirror (default fallback):
#      grep every lookup-table filename from the dwalton76 solver source
#      and pull each .gz from the public S3 bucket. Used on a fresh build
#      when no local mirror is configured.
#
# Either way, total layer size is ~11 GB and prefetch time is a few minutes.

set -euo pipefail

SOLVER_DIR=/opt/rubiks-cube-NxNxN-solver
CACHE="${SOLVER_DIR}/lookup-tables"
TARBALL_URL="${TABLES_TARBALL_URL:-}"
BUCKET="${TABLES_BUCKET_URL:-https://rubiks-cube-lookup-tables.s3.amazonaws.com}"

mkdir -p "${CACHE}"

# --- Mode 1: tarball mirror ---------------------------------------------
if [ -n "${TARBALL_URL}" ]; then
    echo "prefetch: fetching tarball from ${TARBALL_URL}"
    tmp=$(mktemp /tmp/lookup-tables.XXXXXX.tar.gz)
    trap 'rm -f "${tmp}"' EXIT
    wget -q --tries=3 --timeout=120 -O "${tmp}" "${TARBALL_URL}"
    [ -s "${tmp}" ] || { echo "prefetch: empty download from ${TARBALL_URL}"; exit 1; }
    echo "prefetch: extracting $(du -sh "${tmp}" | cut -f1) tarball"
    # The tarball was built with `tar -cz -C ${SOLVER_DIR} lookup-tables`,
    # so it contains a leading `lookup-tables/` directory.
    tar -xzf "${tmp}" -C "${SOLVER_DIR}"
    echo "prefetch: cache now $(du -sh "${CACHE}" | cut -f1) ($(ls "${CACHE}" | wc -l) files)"
    exit 0
fi

# --- Mode 2: S3 per-file fallback ---------------------------------------
cd "${CACHE}"

mapfile -t TXT_FILES < <(
    grep -rho -E 'lookup-table-[0-9]+x[0-9]+x[0-9]+[a-zA-Z0-9_.-]*\.txt' \
        "${SOLVER_DIR}/rubikscubennnsolver/" --include='*.py' \
        | sort -u
)
mapfile -t OTHER_FILES < <(
    grep -rho -E \
        'lookup-table-[0-9]+x[0-9]+x[0-9]+[a-zA-Z0-9_.-]*\.(bin|state_index|pt-state(-perfect-hash)?|perfect-hash)' \
        "${SOLVER_DIR}/rubikscubennnsolver/" --include='*.py' \
        | sort -u
)

# Derive .bin / .state_index from every .txt name, then merge + dedupe.
CANDIDATES=()
for t in "${TXT_FILES[@]:-}"; do
    [ -n "${t}" ] || continue
    CANDIDATES+=("${t}")
    CANDIDATES+=("${t%.txt}.bin")
    CANDIDATES+=("${t%.txt}.state_index")
done
for f in "${OTHER_FILES[@]:-}"; do
    [ -n "${f}" ] || continue
    CANDIDATES+=("${f}")
done
mapfile -t FILES < <(printf "%s\n" "${CANDIDATES[@]}" | sort -u)

echo "prefetch: ${#FILES[@]} candidate filenames"

got=0
missing=0
already=0

for f in "${FILES[@]}"; do
    [ -n "${f}" ] || continue
    if [ -f "${f}" ]; then
        already=$((already + 1))
        continue
    fi
    url="${BUCKET}/${f}.gz"
    if wget -q --tries=2 --timeout=30 "${url}" -O "${f}.gz" 2>/dev/null && [ -s "${f}.gz" ]; then
        if gunzip -f "${f}.gz" 2>/dev/null; then
            got=$((got + 1))
        else
            rm -f "${f}.gz"
            missing=$((missing + 1))
        fi
    else
        rm -f "${f}.gz" 2>/dev/null || true
        missing=$((missing + 1))
    fi
done

echo "prefetch: ${got} downloaded, ${already} already present, ${missing} skipped (not on S3 or unused)"
echo "prefetch: cache now $(du -sh "${CACHE}" | cut -f1)"
# dev marker 1778785794
