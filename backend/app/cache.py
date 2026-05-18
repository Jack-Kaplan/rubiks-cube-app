"""Persistent SQLite cache of (N, state) → moves.

The solver is fully deterministic per (N, state) and the bigger cube
sizes cost real CPU (~10s on N=11), so once we've solved a state we
keep the answer. The cache lives on a docker named volume so it
survives container restarts; only a `docker compose down -v` nukes it.

Designed for the single-worker uvicorn setup the rest of the backend
assumes (see jobs.py). WAL mode is enabled so future multi-worker
deployments would still be safe, but we don't depend on that today.

All public functions are synchronous; callers wrap them in
`asyncio.to_thread(...)` to keep the event loop unblocked (the existing
solver dispatch uses the same pattern for kociemba.solve).
"""
from __future__ import annotations

import logging
import sqlite3
import time
from typing import Optional

log = logging.getLogger("solver.cache")


def init_cache(path: str) -> Optional[sqlite3.Connection]:
    """Open or create the cache DB at `path`. On any failure (missing
    directory, permission denied, corrupt file), log a warning and
    return None — the rest of the backend treats a None connection as
    "caching disabled" and continues to work normally.
    """
    try:
        # check_same_thread=False so we can hand the connection out to
        # asyncio.to_thread workers running on the default thread pool.
        # SQLite serializes its own writes; the WAL mode + immediate
        # transactions handle concurrent reads safely.
        conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS solutions ("
            "  n INTEGER NOT NULL,"
            "  state TEXT NOT NULL,"
            "  moves TEXT NOT NULL,"
            "  created_at INTEGER NOT NULL,"
            "  PRIMARY KEY (n, state)"
            ")"
        )
        log.info("cache: opened %s", path)
        return conn
    except sqlite3.Error as e:
        log.warning("cache: disabled — could not open %s (%s)", path, e)
        return None


def cache_get(conn: Optional[sqlite3.Connection], n: int, state: str) -> Optional[list[str]]:
    """Return cached moves for (n, state), or None on miss or if the
    cache is disabled."""
    if conn is None:
        return None
    try:
        row = conn.execute(
            "SELECT moves FROM solutions WHERE n = ? AND state = ?",
            (n, state),
        ).fetchone()
    except sqlite3.Error as e:
        log.warning("cache: get failed (%s)", e)
        return None
    if row is None:
        return None
    raw = row[0]
    return raw.split() if raw else []


def cache_put(conn: Optional[sqlite3.Connection], n: int, state: str,
              moves: list[str]) -> None:
    """Insert or replace the cache entry for (n, state). Silently
    no-ops if the cache is disabled or the write fails — caching is
    best-effort, not a correctness requirement."""
    if conn is None:
        return
    try:
        conn.execute(
            "INSERT OR REPLACE INTO solutions(n, state, moves, created_at) "
            "VALUES (?, ?, ?, ?)",
            (n, state, " ".join(moves), int(time.time())),
        )
    except sqlite3.Error as e:
        log.warning("cache: put failed (%s)", e)
