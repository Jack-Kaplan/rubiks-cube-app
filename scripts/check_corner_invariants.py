#!/usr/bin/env python3
"""
Standalone analysis: for each of the 14 derangement cube rotations σ,
compute the bullseye state's corner permutation, corner orientations,
edge permutation, and edge orientations, then report whether the
standard 3×3 invariants hold:

  - Corner permutation sign × edge permutation sign = +1 (parity coupling).
  - Corner orientation sum ≡ 0 (mod 3).
  - Edge orientation sum ≡ 0 (mod 2).

All three are necessary for the state to be reachable by face turns from
a solved cube. (For N ≥ 4 they're necessary but not sufficient — big
cubes add wing-orbit and center-orbit invariants.)

This is host-only, no docker — pure permutation arithmetic.
"""
from __future__ import annotations

import itertools

FACES = ["U", "R", "F", "D", "L", "B"]
OPPOSITE = {"U": "D", "D": "U", "L": "R", "R": "L", "F": "B", "B": "F"}
OPPOSITE_VEC = [OPPOSITE[f] for f in FACES]

# Canonical CW-from-outside sticker order for each corner piece, and the
# matching direction order at each corner position. U-corners read CW
# starting from U as viewed from outside the U face; D-corners read CW
# starting from D as viewed from outside the D face. This is the
# Singmaster convention; it makes "orient + face_turn_orient ≡ 0 mod 3"
# the standard invariant.
CORNERS = {
    "URF": ("U", "R", "F"),
    "UFL": ("U", "F", "L"),
    "ULB": ("U", "L", "B"),
    "UBR": ("U", "B", "R"),
    "DFR": ("D", "F", "R"),
    "DLF": ("D", "L", "F"),
    "DBL": ("D", "B", "L"),
    "DRB": ("D", "R", "B"),
}
# Lookup: {frozenset of 3 face labels} -> canonical name
CORNER_BY_SET = {frozenset(t): name for name, t in CORNERS.items()}


def is_cube_rotation(perm_list: list[str]) -> bool:
    """Same det-=-+1 test as find_bullseye_table."""
    idx = {f: i for i, f in enumerate(FACES)}
    pairs = [("U", "D"), ("R", "L"), ("F", "B")]
    pair_of = {p[0]: (i, 0) for i, p in enumerate(pairs)}
    pair_of.update({p[1]: (i, 1) for i, p in enumerate(pairs)})
    for a, b in pairs:
        if OPPOSITE[perm_list[idx[a]]] != perm_list[idx[b]]:
            return False
    axis_perm = []
    flip_count = 0
    for a, _ in pairs:
        pa = perm_list[idx[a]]
        target_pair, end = pair_of[pa]
        axis_perm.append(target_pair)
        if end == 1:
            flip_count += 1
    inv = sum(1 for i in range(3) for j in range(i + 1, 3)
              if axis_perm[i] > axis_perm[j])
    sign = -1 if inv % 2 else 1
    flip = -1 if flip_count % 2 else 1
    return sign * flip == 1


def derangement_rotations() -> list[tuple[int, list[str]]]:
    """The 14 derangement cube rotations, ranked by contrast desc."""
    out = []
    for perm in itertools.permutations(FACES):
        if any(perm[i] == FACES[i] for i in range(6)):
            continue
        if not is_cube_rotation(list(perm)):
            continue
        contrast = sum(1 for i in range(6) if perm[i] == OPPOSITE_VEC[i])
        out.append((contrast, list(perm)))
    out.sort(key=lambda x: -x[0])
    return out


def bullseye_corner_state(sigma_list: list[str]):
    """Compute corner permutation and orientation for the bullseye state
    induced by face permutation σ.

    Returns (perm_dict, orient_dict, perm_sign, orient_sum_mod3, ok)
    where `ok` is False if the state requires a mirror placement (which
    face turns can't produce — the antipode permutation is the classic
    example).
    """
    sigma = {FACES[i]: sigma_list[i] for i in range(6)}

    perm: dict[str, str] = {}
    orient: dict[str, int] = {}

    for pos_name, pos_dirs in CORNERS.items():
        colors_at_pos = tuple(sigma[d] for d in pos_dirs)
        piece_name = CORNER_BY_SET[frozenset(colors_at_pos)]
        piece_dirs = CORNERS[piece_name]
        # Find r ∈ {0,1,2} such that for all j: colors_at_pos[j] == piece_dirs[(j - r) mod 3]
        for r in range(3):
            if all(colors_at_pos[j] == piece_dirs[(j - r) % 3] for j in range(3)):
                break
        else:
            # No proper rotation works — would need a mirror flip. The cube's
            # rotation group can't produce this; it's the chirality wall.
            return None, None, None, None, False
        perm[piece_name] = pos_name
        orient[piece_name] = r

    names = list(CORNERS.keys())
    visited = set()
    sign = 1
    for n in names:
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

    orient_sum = sum(orient.values()) % 3
    return perm, orient, sign, orient_sum, True


# Canonical (primary, secondary) sticker order for each edge piece, and
# the matching direction order at each edge position. Primary = U or D
# for U/D edges; F or B for middle-slice edges (these are the standard
# "good orientation" axes used by Kociemba).
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
EDGE_BY_SET = {frozenset(t): name for name, t in EDGES.items()}


def bullseye_edge_state(sigma_list: list[str]):
    """Same idea as corners but for the 12 edges. Edges have orient 0
    or 1 (flipped/not), invariant sum ≡ 0 (mod 2)."""
    sigma = {FACES[i]: sigma_list[i] for i in range(6)}

    perm: dict[str, str] = {}
    orient: dict[str, int] = {}

    for pos_name, pos_dirs in EDGES.items():
        colors_at_pos = tuple(sigma[d] for d in pos_dirs)
        piece_name = EDGE_BY_SET[frozenset(colors_at_pos)]
        piece_dirs = EDGES[piece_name]
        # r ∈ {0, 1}: orient 0 if primary on primary, 1 if swapped.
        if colors_at_pos == piece_dirs:
            r = 0
        elif colors_at_pos == (piece_dirs[1], piece_dirs[0]):
            r = 1
        else:
            return None, None, None, None, False
        perm[piece_name] = pos_name
        orient[piece_name] = r

    names = list(EDGES.keys())
    visited = set()
    sign = 1
    for n in names:
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

    orient_sum = sum(orient.values()) % 2
    return perm, orient, sign, orient_sum, True


def kind_of_rotation(sigma_list: list[str]) -> str:
    """Categorize σ as identity, face-90/180, body-diag, or edge-180."""
    # Count fixed faces.
    fixed = sum(1 for i, f in enumerate(FACES) if sigma_list[i] == f)
    if fixed == 6:
        return "identity"
    if fixed == 2:
        # Face rotation (axis through 2 opposite faces).
        # 90° vs 180° distinguishable by whether σ² == id on the moved 4 faces.
        sig = sigma_list
        sig2 = [sig[FACES.index(sig[i])] for i in range(6)]
        if sig2 == FACES:
            return "face_180"
        return "face_90"
    if fixed == 0:
        # Derangement: 180° edge-axis (involution) or 120° body diagonal.
        sig = sigma_list
        sig2 = [sig[FACES.index(sig[i])] for i in range(6)]
        if sig2 == FACES:
            return "edge_180"
        return "body_120"
    return f"unknown(fixed={fixed})"


def report_sigma(sig: list[str], contrast):
    sig_str = "".join(sig)
    c = bullseye_corner_state(sig)
    e = bullseye_edge_state(sig)
    kind = kind_of_rotation(sig)
    if not c[4]:
        c_summary = "CHIRALITY"
    else:
        c_summary = f"sign={c[2]:+d} osum={c[3]}"
    if not e[4]:
        e_summary = "CHIRALITY"
    else:
        e_summary = f"sign={e[2]:+d} osum={e[3]}"
    corners_ok = c[4] and c[2] == 1 and c[3] == 0
    edges_ok = e[4] and e[2] == 1 and e[3] == 0
    # Parity coupling: corner sign × edge sign must equal +1.
    if c[4] and e[4]:
        couple_ok = (c[2] * e[2]) == 1
        couple = "OK" if couple_ok else "FAIL"
    else:
        couple = "-"
    reachable_3x3 = corners_ok and edges_ok and couple == "OK"
    print(f"{sig_str:8}  {str(contrast):>4}  {kind:10}  "
          f"corners[{c_summary:14}] edges[{e_summary:14}]  "
          f"couple={couple:4}  3x3_reachable={reachable_3x3}")
    return reachable_3x3


def main():
    rots = derangement_rotations()
    print("14 derangement cube rotations (the search space):")
    print(f"{'σ':8}  {'cont':>4}  {'kind':10}  "
          f"{'corners':36}  {'edges':36}")
    print("-" * 120)
    counts = {"ok": 0, "fail": 0}
    for contrast, sig in rots:
        ok = report_sigma(sig, contrast)
        counts["ok" if ok else "fail"] += 1
    print()
    print(f"Summary: {counts['ok']}/14 are 3×3-reachable on corner+edge invariants.")
    print()
    print("Reference (not in the search space — col 0 not a rotation):")
    print(f"{'σ':8}  {'cont':>4}  {'kind':10}  "
          f"{'corners':36}  {'edges':36}")
    print("-" * 120)
    report_sigma(OPPOSITE_VEC, "anti")


if __name__ == "__main__":
    main()
