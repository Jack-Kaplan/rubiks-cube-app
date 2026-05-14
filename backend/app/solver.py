"""Cube solver dispatch.

N=3:    uses the PyPI `kociemba` package directly (the dwalton76 solver's
        3x3 path is broken in current master — it generates parity-error
        states that its bundled Kociemba implementation cannot solve, even
        for cubes its own RubiksCube333 class produced).
N!=3:   shells out to `rubiks-cube-solver.py --state <facelet>` from the
        dwalton76/rubiks-cube-NxNxN-solver repo and parses the "Solution:"
        line from stdout.

Both paths return a list of standard-notation move tokens.
"""

import asyncio
import os
import re
import shlex

import kociemba

# Default CLI location matches what the Dockerfile installs.
SOLVER_BIN = os.environ.get(
    "SOLVER_BIN", "/opt/rubiks-cube-NxNxN-solver/rubiks-cube-solver.py"
)

# Per-N timeouts (seconds). Big cubes legitimately take a long time.
DEFAULT_TIMEOUTS = {
    2: 30, 3: 30, 4: 60, 5: 90, 6: 180,
    7: 240, 8: 300, 9: 360, 10: 480, 11: 600,
}

# The solver prints its move sequence on a line that looks like:
#   "Solution: U R' Uw 3Fw' ..."
# Older builds use "solution" lowercase; match both.
_SOLUTION_LINE = re.compile(r"^\s*solution[:\s]+(.+)$", re.IGNORECASE)


class SolverError(RuntimeError):
    pass


def validate_state(n: int, state: str) -> None:
    expected_len = 6 * n * n
    if len(state) != expected_len:
        raise SolverError(
            f"State length {len(state)} does not match expected {expected_len} for N={n}"
        )
    if not all(c in "URFDLB" for c in state):
        raise SolverError("State must contain only U/R/F/D/L/B characters")
    # Each face color must appear exactly N^2 times.
    counts = {f: state.count(f) for f in "URFDLB"}
    if any(c != n * n for c in counts.values()):
        raise SolverError(f"Face color counts {counts} are not all {n * n}")


async def run_solve(n: int, state: str) -> list[str]:
    validate_state(n, state)
    # Short-circuit: kociemba doesn't recognize an already-solved state and
    # will return a 13-move no-op; skip that explicitly so the user doesn't
    # see pointless animation when "Go" is pressed on a solved cube.
    solved = "".join(c * (n * n) for c in "URFDLB")
    if state == solved:
        return []
    if n == 3:
        return await _solve_kociemba(state)
    return await _solve_dwalton76(n, state)


async def _solve_kociemba(state: str) -> list[str]:
    try:
        raw = await asyncio.to_thread(kociemba.solve, state)
    except Exception as e:  # noqa: BLE001
        raise SolverError(f"kociemba rejected the state: {e}") from e
    raw = (raw or "").strip()
    return raw.split() if raw else []


async def _solve_dwalton76(n: int, state: str) -> list[str]:
    timeout = DEFAULT_TIMEOUTS.get(n, 600)
    # Always invoke via python3 to avoid shebang issues across environments.
    # CWD must be the solver repo dir — its `www_header` does a relative
    # shutil.copy("www/solution.js", ...) call that fails otherwise.
    cmd = ["python3", os.path.basename(SOLVER_BIN), "--state", state]
    cwd = os.path.dirname(SOLVER_BIN)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )
    except FileNotFoundError as e:
        raise SolverError(f"Solver binary not found at {SOLVER_BIN}") from e

    try:
        stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise SolverError(f"Solver timed out after {timeout}s for N={n}")

    stdout = stdout_b.decode("utf-8", "replace")
    stderr = stderr_b.decode("utf-8", "replace")

    if proc.returncode != 0:
        raise SolverError(
            f"Solver exited with code {proc.returncode}\n"
            f"cmd: {shlex.join(cmd[:1])} --state <{len(state)} chars>\n"
            f"stderr (tail): {stderr[-2000:]}"
        )

    # Scan from the bottom — the final solution line is what we want.
    for line in reversed(stdout.splitlines()):
        m = _SOLUTION_LINE.match(line)
        if m:
            raw = m.group(1).strip()
            if not raw:
                return []
            return raw.split()

    raise SolverError(
        "Could not find 'Solution:' line in solver output. "
        f"stdout (tail): {stdout[-2000:]}"
    )
