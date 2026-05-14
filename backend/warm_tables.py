"""Backstop warm-up: solve several diverse scrambles per N so any lookup
tables the prefetch script missed (e.g., generated dynamically from string
formatting) get downloaded and cached during the image build.

`prefetch_tables.sh` runs first to bulk-download everything visible in the
solver source; this script catches the rest by actually exercising the
reduction phases for each size.

All failures are tolerated — they're caught by the prefetch script or, in
the worst case, the runtime fallback. After the image is sealed and pushed
the goal is zero external network calls.
"""

import random
import subprocess
import sys
from typing import Type

sys.path.insert(0, "/opt/rubiks-cube-NxNxN-solver")

from rubikscubennnsolver.RubiksCube222 import RubiksCube222
from rubikscubennnsolver.RubiksCube444 import RubiksCube444
from rubikscubennnsolver.RubiksCube555 import RubiksCube555
from rubikscubennnsolver.RubiksCube666 import RubiksCube666
from rubikscubennnsolver.RubiksCube777 import RubiksCube777

# N=3 uses PyPI kociemba; no tables needed. N=8..11 reduce to N≤7 internally.
SIZES: list[tuple[int, Type]] = [
    (2, RubiksCube222),
    (4, RubiksCube444),
    (5, RubiksCube555),
    (6, RubiksCube666),
    (7, RubiksCube777),
]

# Multiple scramble lengths exercise different phases. Short scrambles hit
# the cheap "phase 1" tables; longer ones force the solver through phases
# 2-6 and the various edge-pairing endgames. Diverse seeds make sure we
# hit edge orbits that a single canonical scramble would skip.
SCRAMBLE_LENGTHS = [8, 25, 60]
SEEDS = [0, 1, 7, 42]
moves = ["U", "R", "F", "D", "L", "B"]

solver_path = "rubiks-cube-solver.py"
cwd = "/opt/rubiks-cube-NxNxN-solver"

for n, Cls in SIZES:
    for seed in SEEDS:
        random.seed(seed)
        for length in SCRAMBLE_LENGTHS:
            solved = "".join(c * (n * n) for c in "URFDLB")
            cube = Cls(solved, "URFDLB")
            for _ in range(length):
                cube.rotate(random.choice(moves))
            state = cube.get_kociemba_string(all_squares=True)
            print(f"warm N={n} seed={seed} len={length}", flush=True)
            try:
                subprocess.run(
                    ["python3", solver_path, "--state", state],
                    check=False,
                    timeout=900,
                    cwd=cwd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except subprocess.TimeoutExpired:
                print(f"  timeout — moving on", flush=True)
