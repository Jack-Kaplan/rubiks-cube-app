#!/bin/bash
# Leave the lookup-table tarball at /opt/lookup-tables.tar.gz (entrypoint.sh
# extracts at first container start). Two modes:
#   1. TABLES_TARBALL_URL set → fetch the prebuilt tarball as-is.
#   2. Empty → fall back to per-file S3 fetch, then re-tar.

set -euo pipefail

SOLVER_DIR=/opt/rubiks-cube-NxNxN-solver
CACHE="${SOLVER_DIR}/lookup-tables"
TARBALL=/opt/lookup-tables.tar.gz
TARBALL_URL="${TABLES_TARBALL_URL:-}"
BUCKET="${TABLES_BUCKET_URL:-https://rubiks-cube-lookup-tables.s3.amazonaws.com}"

if [ -n "${TARBALL_URL}" ]; then
    echo "prefetch: fetching tarball from ${TARBALL_URL}"
    wget -q --tries=3 --timeout=120 -O "${TARBALL}" "${TARBALL_URL}"
    [ -s "${TARBALL}" ] || { echo "prefetch: empty download from ${TARBALL_URL}"; exit 1; }
    echo "prefetch: saved $(du -sh "${TARBALL}" | cut -f1) tarball to ${TARBALL}"
    exit 0
fi

mkdir -p "${CACHE}"
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

# Companion .bin / .state_index files share the .txt basename; derive
# rather than grep (some are only referenced indirectly).
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

# Re-archive into the same path mode 1 produces; entrypoint.sh expects
# a leading `lookup-tables/` directory.
echo "prefetch: archiving cache into ${TARBALL}"
tar -czf "${TARBALL}" -C "${SOLVER_DIR}" lookup-tables
rm -rf "${CACHE}"
echo "prefetch: tarball is $(du -sh "${TARBALL}" | cut -f1)"
