import { CubePuzzle } from '../puzzles/cube/CubePuzzle.js';
import { encodeFacelet } from '../solver/FaceletEncoder.js';
import { decodeMove } from '../solver/MoveDecoder.js';

const OPPOSITE = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' };

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

// Per-N concentric-ring color tables. Index k = ring distance from the
// face's nearest edge (0 = outermost). Each *column* across faces is a
// permutation of FACES (so each color appears exactly N² times across
// the cube), and each entry on rings 0..R-1 is a derangement of the face
// color (so faces show max distinct colors). Odd-N absolute center is
// overridden to face color in bullseye() — its table value is unused.
//
// Tables were found by parallel search against the dwalton76/kociemba
// pipeline (see scripts/find_bullseye_table.py). Odd-N col 0 = RFULBD
// (120° body-diagonal rotation); even-N col 0 = RUBLDF (180° edge axis).
// On odd N the 6 edge-axis derangements are pre-filtered because their
// T-edge parity coupling fails through to kociemba.
const RING_COLOR_BY_N = {
    3: {
        U: ['R', 'U', 'U', 'U', 'U', 'U'],
        R: ['B', 'R', 'R', 'R', 'R', 'R'],
        F: ['D', 'F', 'F', 'F', 'F', 'F'],
        D: ['L', 'D', 'D', 'D', 'D', 'D'],
        L: ['F', 'L', 'L', 'L', 'L', 'L'],
        B: ['U', 'B', 'B', 'B', 'B', 'B'],
    },
    4: {
        U: ['R', 'F', 'U', 'U', 'U', 'U'],
        R: ['U', 'D', 'R', 'R', 'R', 'R'],
        F: ['B', 'R', 'F', 'F', 'F', 'F'],
        D: ['L', 'B', 'D', 'D', 'D', 'D'],
        L: ['D', 'U', 'L', 'L', 'L', 'L'],
        B: ['F', 'L', 'B', 'B', 'B', 'B'],
    },
    5: {
        U: ['R', 'F', 'U', 'U', 'U', 'U'],
        R: ['F', 'U', 'R', 'R', 'R', 'R'],
        F: ['U', 'R', 'F', 'F', 'F', 'F'],
        D: ['L', 'B', 'D', 'D', 'D', 'D'],
        L: ['B', 'D', 'L', 'L', 'L', 'L'],
        B: ['D', 'L', 'B', 'B', 'B', 'B'],
    },
    6: {
        U: ['R', 'F', 'D', 'U', 'U', 'U'],
        R: ['U', 'D', 'F', 'R', 'R', 'R'],
        F: ['B', 'L', 'R', 'F', 'F', 'F'],
        D: ['L', 'B', 'U', 'D', 'D', 'D'],
        L: ['D', 'U', 'B', 'L', 'L', 'L'],
        B: ['F', 'R', 'L', 'B', 'B', 'B'],
    },
    7: {
        U: ['R', 'D', 'F', 'U', 'U', 'U'],
        R: ['F', 'U', 'L', 'R', 'R', 'R'],
        F: ['U', 'R', 'B', 'F', 'F', 'F'],
        D: ['L', 'B', 'U', 'D', 'D', 'D'],
        L: ['B', 'F', 'D', 'L', 'L', 'L'],
        B: ['D', 'L', 'R', 'B', 'B', 'B'],
    },
    8: {
        U: ['R', 'D', 'F', 'B', 'U', 'U'],
        R: ['U', 'F', 'D', 'L', 'R', 'R'],
        F: ['B', 'L', 'U', 'R', 'F', 'F'],
        D: ['L', 'B', 'R', 'U', 'D', 'D'],
        L: ['D', 'U', 'B', 'F', 'L', 'L'],
        B: ['F', 'R', 'L', 'D', 'B', 'B'],
    },
    9: {
        U: ['R', 'L', 'F', 'D', 'U', 'U'],
        R: ['F', 'B', 'U', 'L', 'R', 'R'],
        F: ['U', 'D', 'R', 'B', 'F', 'F'],
        D: ['L', 'U', 'B', 'F', 'D', 'D'],
        L: ['B', 'F', 'D', 'R', 'L', 'L'],
        B: ['D', 'R', 'L', 'U', 'B', 'B'],
    },
    10: {
        U: ['R', 'B', 'F', 'L', 'D', 'U'],
        R: ['U', 'L', 'D', 'F', 'B', 'R'],
        F: ['B', 'D', 'U', 'R', 'L', 'F'],
        D: ['L', 'F', 'R', 'B', 'U', 'D'],
        L: ['D', 'R', 'B', 'U', 'F', 'L'],
        B: ['F', 'U', 'L', 'D', 'R', 'B'],
    },
    11: {
        U: ['R', 'B', 'F', 'D', 'L', 'U'],
        R: ['F', 'D', 'U', 'L', 'B', 'R'],
        F: ['U', 'L', 'R', 'B', 'D', 'F'],
        D: ['L', 'F', 'B', 'R', 'U', 'D'],
        L: ['B', 'U', 'D', 'F', 'R', 'L'],
        B: ['D', 'R', 'L', 'U', 'F', 'B'],
    },
};

function bullseye(N) {
    const table = RING_COLOR_BY_N[N];
    if (!table) return null;
    const mid = (N - 1) / 2;
    const isOdd = N % 2 === 1;
    let out = '';
    for (const f of 'URFDLB') {
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                const ring = Math.min(r, N - 1 - r, c, N - 1 - c);
                let color = table[f][ring];
                if (isOdd && r === mid && c === mid) color = f;
                out += color;
            }
        }
    }
    return out;
}

// Single 2×2 opposite-color patch offset from center. Only verified on N=4.
function dots(N) {
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

const CUBE_IN_CUBE_ALG = "F L F U' R U F2 L2 U' L' B D' B' L2 U";
const PI_ALG = "R U2 R2 F R F' U2 R' F R F'";

const BULLSEYE_NS = new Set(Object.keys(RING_COLOR_BY_N).map(Number));
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
