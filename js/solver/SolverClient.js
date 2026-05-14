/**
 * Async client for the cube solver backend.
 *
 * Two-step protocol:
 *   POST /solve     → returns { jobId, status: "pending" }
 *   GET  /solve/:id → polls; eventually returns { status: "done", moves } or
 *                     { status: "error", error }.
 *
 * Polls every `pollInterval` ms up to `maxWaitMs` total. Surfaces progress
 * through an optional `onTick({ elapsedMs })` callback so the UI can show a
 * spinner / elapsed-time display while big-cube solves grind.
 */

const DEFAULT_POLL_INTERVAL = 500;
const DEFAULT_MAX_WAIT_MS = 10 * 60 * 1000;

export class SolverClient {
    constructor(baseUrl) {
        // Strip trailing slash so we can concatenate paths uniformly.
        this.baseUrl = (baseUrl || '').replace(/\/$/, '');
    }

    /**
     * Submit a solve and poll until it finishes (or fails).
     * @param {number} N
     * @param {string} state - URFDLB facelet string of length 6*N*N
     * @param {object} opts
     * @param {(info: {elapsedMs: number}) => void} opts.onTick
     * @param {AbortSignal} opts.signal - abort the polling loop
     * @returns {Promise<string[]>} list of move notation tokens
     */
    async solve(N, state, opts = {}) {
        const {
            onTick,
            signal,
            pollInterval = DEFAULT_POLL_INTERVAL,
            maxWaitMs = DEFAULT_MAX_WAIT_MS,
        } = opts;

        const submitResp = await fetch(`${this.baseUrl}/solve`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ N, state }),
            signal,
        });
        if (!submitResp.ok) {
            throw new Error(`Solver POST failed: ${submitResp.status} ${submitResp.statusText}`);
        }
        const { jobId } = await submitResp.json();
        if (!jobId) throw new Error('Solver did not return a jobId');

        const started = Date.now();
        while (true) {
            const elapsedMs = Date.now() - started;
            if (elapsedMs > maxWaitMs) {
                throw new Error(`Solver timed out client-side after ${Math.round(elapsedMs / 1000)}s`);
            }
            if (onTick) onTick({ elapsedMs });
            await new Promise(r => setTimeout(r, pollInterval));
            if (signal?.aborted) throw new Error('aborted');

            const r = await fetch(`${this.baseUrl}/solve/${jobId}`, { signal });
            if (!r.ok) throw new Error(`Solver GET failed: ${r.status} ${r.statusText}`);
            const body = await r.json();
            if (body.status === 'done') return body.moves || [];
            if (body.status === 'error') throw new Error(body.error || 'solver error');
            // else: pending, keep polling.
        }
    }
}
