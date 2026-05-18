#!/usr/bin/env python3
"""
Offline exhaustive search for bullseye RING_COLOR tables that solve via
the backend's solver on every cube size N=3..11.

Constraints enforced per candidate:
  1. col 0 (outermost ring per face) is a derangement of FACES
     (col0[face] != face — "outer ring is never the face's own color").
  2. col 0 is a face permutation induced by a 3D cube rotation, the only
     setting where the corner color triple at each cube corner is three
     mutually-non-opposite faces (a real corner piece). 14 candidates
     satisfy both (1) and (2): 8 body-diagonal rotations + 6 edge-axis
     180° rotations.
  3. Within the R = floor(N/2) rings actually used on the face, each
     row is Latin (every row position shows a distinct color → "as many
     colors as possible per face").
  4. Each column is a permutation of FACES (color balance — every color
     appears exactly N² times across the cube).
  5. The bullseye state is solvable: kociemba for N=3, dwalton76 for N≥4.

Enumeration is streamed: per N, walk every (col 0, col 1, …, col_{R-1})
Latin-rectangle completion, build the target facelet string, dedup by
target, submit to the appropriate solver. First success wins; the search
moves on to the next N. Failures are bucketed by stderr fingerprint so
exhaustion records show which parity walls fired.

Designed as a single overnight invocation inside the `cube-solver:latest`
Docker image (where SOLVER_BIN and the kociemba python package both
live). One launch, no babysitting.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import itertools
import json
import os
import re
import subprocess
import sys
import time
from typing import Iterator

FACES = ["U", "R", "F", "D", "L", "B"]
OPPOSITE = {"U": "D", "D": "U", "L": "R", "R": "L", "F": "B", "B": "F"}
OPPOSITE_VEC = [OPPOSITE[f] for f in FACES]  # ['D','L','B','U','R','F']

SOLVER_BIN = os.environ.get(
    "SOLVER_BIN", "/opt/rubiks-cube-NxNxN-solver/rubiks-cube-solver.py"
)
SOLUTION_RE = re.compile(r"^\s*solution[:\s]+(.+)$", re.IGNORECASE)


# ----- ring-permutation enumeration ----------------------------------------

def effective_rings(N: int) -> int:
    """Number of rings whose table value influences the target string.
    On odd N the innermost ring contains only the absolute-center
    sticker, which is overridden to face color regardless of the table —
    so it contributes nothing to the search space. For both parities
    this works out to floor(N/2).
    """
    return N // 2


def is_cube_rotation(perm: list[str]) -> bool:
    """A face permutation is induced by a proper 3D rotation iff it
    preserves antipodal pairs AND has det = +1 as a 3×3 signed-permutation
    matrix (axis permutation composed with axis-direction flips).

    det = sign(axis_perm) × (-1)^flip_count must equal +1.

    The pair-preserving subgroup of S6 has order 48 (S3 × Z2³); the
    rotation subgroup is the index-2 subset where det = +1.
    """
    idx = {f: i for i, f in enumerate(FACES)}
    pairs = [("U", "D"), ("R", "L"), ("F", "B")]
    pair_of = {}
    for i, (a, b) in enumerate(pairs):
        pair_of[a] = (i, 0)  # "positive" axis end
        pair_of[b] = (i, 1)  # "negative" axis end

    # Pair preservation
    for a, b in pairs:
        if OPPOSITE[perm[idx[a]]] != perm[idx[b]]:
            return False

    # Build axis permutation (which pair does each pair map to) and
    # count axis flips (mapping to the negative end of the target pair).
    axis_perm = []
    flip_count = 0
    for a, _ in pairs:
        pa = perm[idx[a]]
        target_pair, end = pair_of[pa]
        axis_perm.append(target_pair)
        if end == 1:
            flip_count += 1

    inversions = 0
    for i in range(3):
        for j in range(i + 1, 3):
            if axis_perm[i] > axis_perm[j]:
                inversions += 1
    sign = 1 if inversions % 2 == 0 else -1
    flip_factor = 1 if flip_count % 2 == 0 else -1
    return sign * flip_factor == 1


def ranked_column0(require_derangement: bool = True,
                   only_rotations: bool = True) -> list[tuple[int, list[str]]]:
    """All column-0 (outer ring) permutations, ranked by contrast desc.

    only_rotations=True restricts to the 24 elements of the cube rotation
    group — the only col0 values for which the bullseye state has valid
    corner color triples (corners need 3 mutually-non-opposite faces).
    require_derangement=True additionally excludes col0[i] == FACES[i].
    """
    out: list[tuple[int, list[str]]] = []
    for perm in itertools.permutations(FACES):
        if require_derangement and any(perm[i] == FACES[i] for i in range(6)):
            continue
        if only_rotations and not is_cube_rotation(list(perm)):
            continue
        contrast = sum(1 for i in range(6) if perm[i] == OPPOSITE_VEC[i])
        out.append((contrast, list(perm)))
    out.sort(key=lambda x: -x[0])
    return out


# ----- 3×3 invariant pre-filter --------------------------------------------
#
# For each candidate col 0 (which is a cube rotation), compute the bullseye
# state's induced corner+edge permutation/orientation and check the
# standard 3×3 invariants:
#
#   - corner sign × edge sign = +1 (parity coupling)
#   - corner orientation sum ≡ 0 (mod 3)
#   - edge orientation sum ≡ 0 (mod 2)
#
# These are σ-only — they depend only on col 0, not on inner rings. So
# rejecting σ here saves the entire inner-ring enumeration for σ values
# that can't possibly work.
#
# Important caveat: these are STRICTLY 3×3 invariants. They directly bind
# on N=3 (kociemba) and on odd N≥5 (where T-edges — the single piece in
# the middle of each cube-edge — function exactly like 3×3 edges). On
# even N, dwalton76's reduction has wing pieces that can absorb a parity
# flip during edge pairing, so σ values that fail the 3×3 edge sign
# constraint can still produce reachable states on even N. So we apply
# the pre-filter on N=3 and odd N≥5; we leave it off for even N (the
# search empirically finds them fast anyway).

CORNERS = {
    "URF": ("U", "R", "F"),  # canonical CW-from-outside sticker order
    "UFL": ("U", "F", "L"),
    "ULB": ("U", "L", "B"),
    "UBR": ("U", "B", "R"),
    "DFR": ("D", "F", "R"),
    "DLF": ("D", "L", "F"),
    "DBL": ("D", "B", "L"),
    "DRB": ("D", "R", "B"),
}
_CORNER_BY_SET = {frozenset(t): name for name, t in CORNERS.items()}

EDGES = {
    "UR": ("U", "R"),
    "UL": ("U", "L"),
    "UF": ("U", "F"),
    "UB": ("U", "B"),
    "DR": ("D", "R"),
    "DL": ("D", "L"),
    "DF": ("D", "F"),
    "DB": ("D", "B"),
    "FR": ("F", "R"),
    "FL": ("F", "L"),
    "BR": ("B", "R"),
    "BL": ("B", "L"),
}
_EDGE_BY_SET = {frozenset(t): name for name, t in EDGES.items()}


def _perm_sign(perm: dict[str, str]) -> int:
    """+1 for even, -1 for odd permutation."""
    visited = set()
    sign = 1
    for n in perm:
        if n in visited:
            continue
        cycle_len = 0
        cur = n
        while cur not in visited:
            visited.add(cur)
            cur = perm[cur]
            cycle_len += 1
        if cycle_len % 2 == 0:
            sign = -sign
    return sign


def passes_3x3_invariants(sigma_list: list[str]) -> bool:
    """True iff the bullseye state with col 0 = σ (and centers/inner
    rings ignored) satisfies the standard 3×3 cube-group invariants."""
    sigma = {FACES[i]: sigma_list[i] for i in range(6)}

    # Corners
    corner_perm: dict[str, str] = {}
    corner_orient_sum = 0
    for pos_name, pos_dirs in CORNERS.items():
        colors_at_pos = tuple(sigma[d] for d in pos_dirs)
        cs = frozenset(colors_at_pos)
        if cs not in _CORNER_BY_SET:
            return False  # invalid corner color triple (shouldn't happen for rotation σ)
        piece_name = _CORNER_BY_SET[cs]
        piece_dirs = CORNERS[piece_name]
        for r in range(3):
            if all(colors_at_pos[j] == piece_dirs[(j - r) % 3] for j in range(3)):
                break
        else:
            return False  # chirality wall — would need a mirror flip
        corner_perm[piece_name] = pos_name
        corner_orient_sum = (corner_orient_sum + r) % 3
    if corner_orient_sum != 0:
        return False
    csign = _perm_sign(corner_perm)

    # Edges
    edge_perm: dict[str, str] = {}
    edge_orient_sum = 0
    for pos_name, pos_dirs in EDGES.items():
        colors_at_pos = tuple(sigma[d] for d in pos_dirs)
        cs = frozenset(colors_at_pos)
        if cs not in _EDGE_BY_SET:
            return False
        piece_name = _EDGE_BY_SET[cs]
        piece_dirs = EDGES[piece_name]
        if colors_at_pos == piece_dirs:
            r = 0
        elif colors_at_pos == (piece_dirs[1], piece_dirs[0]):
            r = 1
        else:
            return False
        edge_perm[piece_name] = pos_name
        edge_orient_sum = (edge_orient_sum + r) % 2
    if edge_orient_sum != 0:
        return False
    esign = _perm_sign(edge_perm)

    # Parity coupling
    return csign * esign == 1


def _applies_strict_invariants(N: int) -> bool:
    """The 3×3 invariants bind directly only when there's a single edge
    piece per cube-edge that the solver can't trade away: N=3, or odd
    N≥5 (where T-edges sit in the middle of each cube-edge). On even N
    the wing pieces can swap to absorb a 3×3 parity flip during the
    reduction phase, so the σ-only invariants don't bind."""
    return N == 3 or (N >= 5 and N % 2 == 1)


def complete_columns(col0: list[str], R: int) -> Iterator[list[list[str]]]:
    """Yield every Latin-rectangle completion of a 6×R grid given
    column 0 = col0. Each yield is the full rectangle as a list of
    R columns (each column = list of 6 colors)."""
    cols: list[list[str | None]] = [col0[:]] + [[None] * 6 for _ in range(R - 1)]

    def fill_col(j):
        if j == R:
            yield [c[:] for c in cols]
            return
        yield from permute_col(j, 0, set())

    def permute_col(j, row_idx, used):
        if row_idx == 6:
            yield from fill_col(j + 1)
            return
        for c in FACES:
            if c in used:
                continue
            # Row already has this color in some prior column?
            dup = False
            for k in range(j):
                if cols[k][row_idx] == c:
                    dup = True
                    break
            if dup:
                continue
            cols[j][row_idx] = c
            used.add(c)
            yield from permute_col(j, row_idx + 1, used)
            used.remove(c)
            cols[j][row_idx] = None

    yield from fill_col(1)


def ranked_candidates(N: int, require_derangement: bool = True,
                      limit: int | None = None,
                      contrasts: set[int] | None = None,
                      only_rotations: bool = True,
                      fixed_col0: list[str] | None = None) -> Iterator[dict]:
    """Stream {table, contrast} dicts for size N, ranked by contrast desc.

    only_rotations=True (default) limits col0 to the 24 cube rotations,
    which are the only valid outer-ring color assignments (others give
    corners with opposite-face stickers, which aren't real pieces).

    If `contrasts` is given, only column-0 permutations with one of those
    contrast values are emitted.
    """
    R = effective_rings(N)
    yielded = 0
    if fixed_col0 is not None:
        col0_iter = [(sum(1 for i in range(6) if fixed_col0[i] == OPPOSITE_VEC[i]),
                      list(fixed_col0))]
    else:
        col0_iter = ranked_column0(require_derangement, only_rotations)
    # 3×3-invariant pre-filter: on N values where the σ-only invariants
    # bind (N=3 and odd N≥5), reject col 0 values that fail corner or
    # edge parity/orientation up-front. Saves walking millions of inner-
    # ring completions for σ values that can't produce reachable states.
    strict = _applies_strict_invariants(N)
    skipped = 0
    for contrast, col0 in col0_iter:
        if contrasts is not None and contrast not in contrasts:
            continue
        if strict and not passes_3x3_invariants(col0):
            skipped += 1
            continue
        for rect in complete_columns(col0, R):
            table = {}
            for i, f in enumerate(FACES):
                row = [rect[j][i] for j in range(R)]
                row.extend([f] * (6 - R))
                table[f] = row
            yield {"table": table, "contrast": contrast}
            yielded += 1
            if limit is not None and yielded >= limit:
                return


def bullseye_target(N: int, table: dict[str, list[str]]) -> str:
    """URFDLB facelet string for the bullseye pattern with this ring
    table. Forces face color on the absolute center for odd N."""
    mid = (N - 1) // 2
    is_odd = N % 2 == 1
    out = []
    for f in "URFDLB":
        for r in range(N):
            for c in range(N):
                ring = min(r, N - 1 - r, c, N - 1 - c)
                color = table[f][ring]
                if is_odd and r == mid and c == mid:
                    color = f
                out.append(color)
    return "".join(out)


# ----- solver invocation ---------------------------------------------------

def try_solve(N: int, target: str, timeout: float) -> tuple[bool, str]:
    """Dispatch to the appropriate solver for this N and return
    (ok, info). On success `info` is the move sequence; on failure it's
    a truncated error fingerprint suitable for bucketing.
    """
    if N == 3:
        return _try_solve_kociemba(target)
    return _try_solve_dwalton76(target, timeout)


def _try_solve_kociemba(target: str) -> tuple[bool, str]:
    """In-process kociemba. Fast (ms-scale) on 3×3; raises on
    unreachable states. Imports lazily so non-N=3 runs don't pay the
    table-load cost (and so missing kociemba doesn't break N≥4 runs)."""
    try:
        import kociemba
    except ImportError as e:
        return (False, f"kociemba import failed: {e}")
    try:
        raw = kociemba.solve(target)
    except Exception as e:  # noqa: BLE001 — kociemba raises bare Exception
        return (False, f"kociemba: {type(e).__name__}: {str(e)[:200]}")
    raw = (raw or "").strip()
    return (True, raw)


def _try_solve_dwalton76(target: str, timeout: float) -> tuple[bool, str]:
    """Subprocess to the dwalton76 binary."""
    cwd = os.path.dirname(SOLVER_BIN)
    cmd = ["python3", os.path.basename(SOLVER_BIN), "--state", target]
    try:
        p = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return (False, f"timeout after {timeout}s")
    if p.returncode != 0:
        tail = p.stderr.strip().splitlines()
        last = tail[-1] if tail else ""
        return (False, f"exit={p.returncode} last={last[:200]}")
    for line in reversed(p.stdout.splitlines()):
        m = SOLUTION_RE.match(line)
        if m:
            return (True, m.group(1).strip())
    return (False, "no Solution: line in stdout")


# ----- per-N search --------------------------------------------------------

def search_n(N: int, max_candidates: int, parallelism: int,
             per_attempt_timeout: float,
             max_per_n_seconds: float,
             allow_face_outer: bool = False,
             contrasts: set[int] | None = None,
             only_rotations: bool = True,
             fixed_col0: list[str] | None = None) -> dict:
    """Stream ranked, deduped candidates through a process pool;
    first success wins. Stops when the candidate iterator is exhausted,
    when `max_candidates` is hit, or when `max_per_n_seconds` elapses
    (whichever comes first)."""
    strict = _applies_strict_invariants(N)
    if strict and only_rotations and fixed_col0 is None:
        kept = [s for _, s in ranked_column0(not allow_face_outer, only_rotations)
                if passes_3x3_invariants(s)]
        all_count = len(ranked_column0(not allow_face_outer, only_rotations))
        print(f"[N={N}] starting search (max_candidates={max_candidates}, "
              f"par={parallelism}, attempt_timeout={per_attempt_timeout}s, "
              f"budget={max_per_n_seconds}s, "
              f"σ pre-filter: {len(kept)}/{all_count} pass 3×3 invariants, "
              f"allow_face_outer={allow_face_outer})", flush=True)
    else:
        print(f"[N={N}] starting search (max_candidates={max_candidates}, "
              f"par={parallelism}, attempt_timeout={per_attempt_timeout}s, "
              f"budget={max_per_n_seconds}s, "
              f"strict_invariants={strict}, "
              f"allow_face_outer={allow_face_outer})", flush=True)

    cands_iter = ranked_candidates(
        N,
        require_derangement=not allow_face_outer,
        contrasts=contrasts,
        only_rotations=only_rotations,
        fixed_col0=fixed_col0,
    )
    seen_targets: set[str] = set()

    def enumerated_unique():
        """Yield (idx, cand, target_str) for distinct N-targets, in rank order."""
        idx = 0
        for cand in cands_iter:
            tgt = bullseye_target(N, cand["table"])
            if tgt in seen_targets:
                continue
            seen_targets.add(tgt)
            yield (idx, cand, tgt)
            idx += 1
            if idx >= max_candidates:
                return

    started = time.time()
    attempted = 0
    last_progress = started
    failure_buckets: dict[str, int] = {}
    pending_iter = iter(enumerated_unique())
    enumerator_done = False
    budget_exhausted = False

    with cf.ProcessPoolExecutor(max_workers=parallelism) as ex:
        in_flight: dict[cf.Future, tuple[int, dict, str]] = {}

        def submit_next():
            nonlocal enumerator_done
            if enumerator_done:
                return False
            try:
                idx, cand, tgt = next(pending_iter)
            except StopIteration:
                enumerator_done = True
                return False
            fut = ex.submit(try_solve, N, tgt, per_attempt_timeout)
            in_flight[fut] = (idx, cand, tgt)
            return True

        for _ in range(parallelism):
            if not submit_next():
                break

        while in_flight:
            if time.time() - started > max_per_n_seconds:
                budget_exhausted = True
                break
            done, _pending = cf.wait(in_flight.keys(),
                                     return_when=cf.FIRST_COMPLETED,
                                     timeout=15.0)
            if not done:
                # Periodic wake to re-check the time budget even if all
                # workers are slow.
                continue
            for fut in done:
                idx, cand, tgt = in_flight.pop(fut)
                attempted += 1
                ok, info = fut.result()
                elapsed = time.time() - started
                if ok:
                    print(f"[N={N}] SUCCESS idx={idx} contrast={cand['contrast']} "
                          f"after {elapsed:.1f}s ({attempted} attempts)",
                          flush=True)
                    ex.shutdown(wait=False, cancel_futures=True)
                    return {
                        "N": N,
                        "table": cand["table"],
                        "effective_rings": effective_rings(N),
                        "contrast": cand["contrast"],
                        "target_state": tgt,
                        "solution_moves": info,
                        "candidate_index": idx,
                        "attempts": attempted,
                        "elapsed_sec": round(elapsed, 1),
                    }
                key = info[:80]
                failure_buckets[key] = failure_buckets.get(key, 0) + 1
                now = time.time()
                if now - last_progress > 15:
                    last_progress = now
                    top = sorted(failure_buckets.items(), key=lambda x: -x[1])[:3]
                    print(f"[N={N}] {attempted} attempts "
                          f"({elapsed:.0f}s elapsed, "
                          f"budget {max_per_n_seconds - elapsed:.0f}s left), "
                          f"top fails: {top}", flush=True)
                submit_next()

        if budget_exhausted:
            # Cancel pending work so the next N can start with full
            # parallelism.
            ex.shutdown(wait=False, cancel_futures=True)

    total_elapsed = round(time.time() - started, 1)
    reason = ("BUDGET_EXHAUSTED" if budget_exhausted
              else ("EXHAUSTED" if enumerator_done else "MAX_CANDIDATES"))
    print(f"[N={N}] {reason} after {attempted} attempts ({total_elapsed}s)",
          flush=True)
    return {
        "N": N,
        "error": reason,
        "attempts": attempted,
        "elapsed_sec": total_elapsed,
        "failure_buckets": dict(
            sorted(failure_buckets.items(), key=lambda x: -x[1])[:10]
        ),
    }


# ----- entry point ---------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ns", default="3,4,5,6,7,8,9,10,11",
                    help="comma-separated cube sizes to search")
    ap.add_argument("--max-candidates", type=int, default=500,
                    help="cap on candidates per N before giving up "
                         "(ignored when --exhaustive is set)")
    ap.add_argument("--exhaustive", action="store_true",
                    help="walk every Latin-rectangle completion for every "
                         "derangement-rotation col 0 until the iterator is "
                         "empty or the per-N time budget runs out")
    ap.add_argument("--max-per-n-seconds", type=float, default=14400,
                    help="time budget per N before moving on to the next "
                         "(default 4 hours; bounds total wall-clock)")
    ap.add_argument("--parallelism", type=int, default=24)
    ap.add_argument("--per-attempt-timeout", type=float, default=900,
                    help="kill an individual solver call after this many "
                         "seconds (only applies to dwalton76; kociemba is "
                         "in-process and not bounded)")
    ap.add_argument("--allow-face-outer", action="store_true",
                    help="also explore tables where the outer ring contains "
                         "the face's own color (relaxes the 'outer ring "
                         "must be a derangement' constraint)")
    ap.add_argument("--contrasts", default="",
                    help="comma-separated contrast values to restrict to "
                         "(e.g. '4,2'); empty = all reachable")
    ap.add_argument("--any-col0", action="store_true",
                    help="don't restrict col0 to the 24 cube rotations "
                         "(diagnostic only — non-rotation col 0 values give "
                         "invalid corner color triples and always fail)")
    ap.add_argument("--fix-col0", default="",
                    help="6-char URFDLB sequence to pin col0 to, e.g. "
                         "'URFDLB' for identity")
    ap.add_argument("--output", default="/dev/stdout")
    args = ap.parse_args()

    Ns = [int(x) for x in args.ns.split(",") if x]
    contrasts = {int(x) for x in args.contrasts.split(",") if x} or None
    fixed_col0 = list(args.fix_col0) if args.fix_col0 else None
    if fixed_col0 is not None and (len(fixed_col0) != 6 or
                                   set(fixed_col0) != set(FACES)):
        raise SystemExit("--fix-col0 must be a 6-char permutation of URFDLB")

    # In --exhaustive mode let the enumerator run to exhaustion; the time
    # budget is the real bound on per-N runtime.
    max_candidates = 10**18 if args.exhaustive else args.max_candidates

    results: dict[str, dict] = {}
    total_start = time.time()
    for N in Ns:
        results[str(N)] = search_n(
            N,
            max_candidates=max_candidates,
            parallelism=args.parallelism,
            per_attempt_timeout=args.per_attempt_timeout,
            max_per_n_seconds=args.max_per_n_seconds,
            allow_face_outer=args.allow_face_outer,
            contrasts=contrasts,
            only_rotations=not args.any_col0,
            fixed_col0=fixed_col0,
        )
        if args.output != "/dev/stdout":
            with open(args.output, "w") as f:
                json.dump(results, f, indent=2)

    if args.output == "/dev/stdout":
        json.dump(results, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        with open(args.output, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nresults written to {args.output} "
              f"(total {time.time() - total_start:.1f}s)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
