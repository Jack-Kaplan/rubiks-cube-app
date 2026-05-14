#!/bin/bash
# Pull every lookup-table file referenced in the dwalton76 solver source
# directly from S3 and decompress in place. Run once at image build time so
# the deployed container makes no external network calls.
#
# Coverage strategy:
#   1. grep every explicit filename mention in the solver source — catches
#      .txt, .bin, .state_index, .pt-state, .pt-state-perfect-hash,
#      .perfect-hash extensions.
#   2. for every .txt found, ALSO try its .bin and .state_index companions
#      since the solver auto-derives those names at runtime (they're not
#      always written as literals in the source).
# Combined this matches what running the solver against many scrambles
# would have lazily downloaded — but in seconds instead of 18 minutes.

set -euo pipefail

SOLVER_DIR=/opt/rubiks-cube-NxNxN-solver
BUCKET="https://rubiks-cube-lookup-tables.s3.amazonaws.com"
CACHE="${SOLVER_DIR}/lookup-tables"

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
