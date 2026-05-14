"""Best-effort warm-up of dwalton76 lookup tables for big cubes.

Solving an already-solved state returns early without touching the per-N
tables, so we generate a real scramble via the solver's own cube class and
then invoke the CLI. The CLI downloads any missing tables to disk and
keeps them cached for subsequent requests.

Used only at image-build time. Failures are tolerated; the runtime path
fetches tables on demand as a fallback.
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

# N=3 uses PyPI kociemba; no tables needed.
SIZES: list[tuple[int, Type]] = [
    (2, RubiksCube222),
    (4, RubiksCube444),
    (5, RubiksCube555),
    (6, RubiksCube666),
    (7, RubiksCube777),
]

random.seed(0)
moves = ["U", "R", "F", "D", "L", "B"]

for n, Cls in SIZES:
    solved = "".join(c * (n * n) for c in "URFDLB")
    cube = Cls(solved, "URFDLB")
    for _ in range(12):
        cube.rotate(random.choice(moves))
    state = cube.get_kociemba_string(all_squares=True)
    print(f"warming N={n}, state_len={len(state)}", flush=True)
    try:
        subprocess.run(
            ["python3", "rubiks-cube-solver.py", "--state", state],
            check=False,
            timeout=600,
            cwd="/opt/rubiks-cube-NxNxN-solver",
        )
    except subprocess.TimeoutExpired:
        print(f"warming N={n} timed out — runtime will fetch tables lazily", flush=True)
