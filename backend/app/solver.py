# N=3 uses kociemba directly — dwalton76's 3x3 path on current master is
# broken (generates parity errors its bundled kociemba can't solve, even
# on states its own RubiksCube333 produced). N≠3 shells out to dwalton76.

import asyncio
import os
import re
import shlex

import kociemba

SOLVER_BIN = os.environ.get(
    "SOLVER_BIN", "/opt/rubiks-cube-NxNxN-solver/rubiks-cube-solver.py"
)

DEFAULT_TIMEOUTS = {
    2: 30, 3: 30, 4: 60, 5: 90, 6: 180,
    7: 240, 8: 300, 9: 360, 10: 480, 11: 600,
}

_SOLUTION_LINE = re.compile(r"^\s*solution[:\s]+(.+)$", re.IGNORECASE)

# dwalton76 colorizes stderr unconditionally; strip before surfacing.
_ANSI = re.compile(r"\x1b\[[0-9;]*[mK]")


def _strip_ansi(s: str) -> str:
    return _ANSI.sub("", s)


# Signatures emitted when handed an invalid cube state (corner/edge
# orientation, permutation parity, or center-orbit violations). Each
# arises from a different reduction step; we translate any of them to
# one friendly message instead of dumping the stack trace.
_UNREACHABLE_PATTERNS = (
    re.compile(r"not found in lookup-tables/"),
    re.compile(r"we should not be here", re.IGNORECASE),
    re.compile(r"parity error made kociemba barf"),
    re.compile(r"Probably cubestring is invalid"),
)


def _friendly_dwalton76_error(stderr: str, n: int) -> str | None:
    plain = _strip_ansi(stderr)
    for pat in _UNREACHABLE_PATTERNS:
        if pat.search(plain):
            return (
                f"Cube state appears invalid or unreachable on N={n}. "
                "If you painted this by hand, some configurations are "
                "physically impossible — parity, edge/corner orientation, "
                "or center-orbit constraints. Try a real scramble or a "
                "reachable target."
            )
    return None


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
    counts = {f: state.count(f) for f in "URFDLB"}
    if any(c != n * n for c in counts.values()):
        raise SolverError(f"Face color counts {counts} are not all {n * n}")


async def run_solve(n: int, state: str) -> list[str]:
    validate_state(n, state)
    # kociemba returns a 13-move no-op on solved input; short-circuit.
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
        friendly = _friendly_dwalton76_error(stderr, n)
        if friendly:
            raise SolverError(friendly)
        raise SolverError(
            f"Solver exited with code {proc.returncode}\n"
            f"cmd: {shlex.join(cmd[:1])} --state <{len(state)} chars>\n"
            f"stderr (tail): {_strip_ansi(stderr)[-2000:]}"
        )

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
