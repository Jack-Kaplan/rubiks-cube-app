/**
 * Named target patterns. Each preset is a (N) → URFDLB facelet string
 * (or null if unsupported on that N). The state is fed straight into
 * `engine.goToState(target)`.
 *
 * Reachability constraint: the N=3 path uses kociemba, which only does
 * outer-face turns and cannot move centers. So bullseye/checkerboard/dots
 * — which all need center swaps on 3×3 — are restricted to N≥4 (where
 * dwalton76's reduction solver moves centers natively). The 3×3 presets
 * (cube-in-cube, pi) are derived by applying outer-turn-only canonical
 * algorithms to a fresh solved cube and encoding the result.
 */

import { CubePuzzle } from '../puzzles/cube/CubePuzzle.js';
import { encodeFacelet } from '../solver/FaceletEncoder.js';
import { decodeMove } from '../solver/MoveDecoder.js';

const OPPOSITE = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' };

/**
 * Apply a whitespace-separated move sequence to a fresh solved cube of
 * size N and return the resulting URFDLB facelet string. Tokens go
 * through `decodeMove`, which handles the engine's Y-axis convention.
 */
function applyAlg(N, alg) {
    const puzzle = new CubePuzzle();
    const cfg = { ...puzzle.defaultConfig, N };
    puzzle.onConfigChange(cfg);
    const pieces = puzzle.createPieces(cfg);
    for (const tok of alg.split(/\s+/).filter(Boolean)) {
        for (const m of decodeMove(tok, puzzle, cfg)) {
            puzzle.applyRotation(pieces, m);
        }
    }
    const enc = encodeFacelet(pieces, puzzle, cfg);
    return enc.ok ? enc.state : null;
}

// Concentric-ring color tables. Index k = ring distance from the face's
// nearest edge (0 = outermost, max = innermost). Each row is a permutation
// of the 6 face colors so the per-color totals across the whole cube come
// out to N² each — required for a valid cube state. Row 0 is the identity
// because corner/edge orientation constraints force the outer ring of each
// face to be the face's own color.
const RING_COLOR = {
    U: ['U', 'F', 'R', 'D', 'B', 'L'],
    R: ['R', 'U', 'F', 'L', 'D', 'B'],
    F: ['F', 'R', 'U', 'B', 'L', 'D'],
    D: ['D', 'B', 'L', 'U', 'F', 'R'],
    L: ['L', 'D', 'B', 'R', 'U', 'F'],
    B: ['B', 'L', 'D', 'F', 'R', 'U'],
};

function bullseye(N) {
    // Concentric rings of different colors. Constraints:
    //   - Outer ring (k=0) must be face color (corner/edge orientations
    //     can't show non-face colors on the outermost row/column).
    //   - On odd N, the single absolute-center sticker is geometrically
    //     fixed to the face color (it sits on the rotation axis).
    // So odd N gives max (floor((N−1)/2)) distinct ring colors per face;
    // even N can use one more, since there's no fixed absolute center.
    const mid = (N - 1) / 2;
    const isOdd = N % 2 === 1;
    let out = '';
    for (const f of 'URFDLB') {
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                const ring = Math.min(r, N - 1 - r, c, N - 1 - c);
                let color = RING_COLOR[f][ring];
                if (isOdd && r === mid && c === mid) color = f;
                out += color;
            }
        }
    }
    return out;
}

function dots(N) {
    // Single 2x2 patch offset from center, opposite color. Avoids the
    // absolute-center fixed sticker on odd N. Only verified reachable on N=4.
    const start = Math.floor((N - 2) / 2);
    const end = start + 2;
    let out = '';
    for (const f of 'URFDLB') {
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                const inDot = r >= start && r < end && c >= start && c < end;
                out += inDot ? OPPOSITE[f] : f;
            }
        }
    }
    return out;
}

// 3×3-only patterns: target state derived by applying a known
// outer-turn-only algorithm to solved.
const CUBE_IN_CUBE_ALG = "F L F U' R U F2 L2 U' L' B D' B' L2 U";
const PI_ALG = "R U2 R2 F R F' U2 R' F R F'";

// N ranges below are empirically verified against the running solver.
// Big-cube center orbits and parity constraints make some "obvious"
// pattern definitions unreachable. N=6 is the one big-cube gap; the
// 2x2 innermost centers on N=6 hit a center-orbit parity conflict with
// our chosen ring permutation and dwalton76 rejects with "we should
// not be here". Every other size N=4..11 (except 6) works.
const BULLSEYE_NS = new Set([4, 5, 7, 8, 9, 10, 11]);
const DOTS_NS    = new Set([4]);

export const PATTERNS = [
    {
        id: 'bullseye',
        label: 'Bullseye',
        supportsN: (N) => BULLSEYE_NS.has(N),
        target: (N) => (BULLSEYE_NS.has(N) ? bullseye(N) : null),
    },
    {
        id: 'dots',
        label: 'Dots',
        supportsN: (N) => DOTS_NS.has(N),
        target: (N) => (DOTS_NS.has(N) ? dots(N) : null),
    },
    {
        id: 'cube-in-cube',
        label: 'Cube in Cube',
        supportsN: (N) => N === 3,
        target: (N) => (N === 3 ? applyAlg(3, CUBE_IN_CUBE_ALG) : null),
    },
    {
        id: 'pi',
        label: 'Pi',
        supportsN: (N) => N === 3,
        target: (N) => (N === 3 ? applyAlg(3, PI_ALG) : null),
    },
];

export function getPattern(id) {
    return PATTERNS.find(p => p.id === id) || null;
}
