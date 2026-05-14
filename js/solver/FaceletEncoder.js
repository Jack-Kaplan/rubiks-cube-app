/**
 * Encode the engine's piece state into a URFDLB facelet string
 * (the format dwalton76/rubiks-cube-NxNxN-solver expects on --state).
 *
 * Engine coordinate system (from CubeConstants.js):
 *   axis 0 = X, -half = Left  / +half = Right
 *   axis 1 = Y, -half = Top   / +half = Bottom   (Y is inverted)
 *   axis 2 = Z, -half = Back  / +half = Front
 *
 * Engine face id → URFDLB letter:
 *   0 (Y- top, Yellow) → U
 *   1 (Y+ bot, Red)    → D
 *   2 (X- left, Green) → L
 *   3 (X+ right, Cyan) → R
 *   4 (Z+ front, Pink) → F
 *   5 (Z- back, Blue)  → B
 *
 * URFDLB reading order (Kociemba convention) per face:
 *   For each face, look at it from outside. Row 0 is the top of the reading
 *   frame; col 0 is the left. Faces are walked U, R, F, D, L, B; each face
 *   contributes N*N characters in row-major order.
 *
 *   Face | reading-up        | reading-right
 *   U    | toward Back (Z-)  | toward Right (X+)
 *   R    | toward Top  (Y-)  | toward Back  (Z-)
 *   F    | toward Top  (Y-)  | toward Right (X+)
 *   D    | toward Front(Z+)  | toward Right (X+)
 *   L    | toward Top  (Y-)  | toward Front (Z+)
 *   B    | toward Top  (Y-)  | toward Left  (X-)
 */

import { FACE_INFO } from '../puzzles/cube/CubeConstants.js';

// Engine face id (0..5) → URFDLB letter.
const ENGINE_TO_LETTER = ['U', 'D', 'L', 'R', 'F', 'B'];

// Per URFDLB face letter, how to walk its N*N grid in reading order.
// fixedAxis/fixedDir locks the face plane; rowAxis/colAxis with their signs
// determine the row-major traversal. Coord at index i along an axis with
// sign s and half h is:  s * (i - h).
const FACE_LAYOUT = {
    U: { engineFace: 0, fixedAxis: 1, fixedDir: -1, rowAxis: 2, rowSign: +1, colAxis: 0, colSign: +1 },
    R: { engineFace: 3, fixedAxis: 0, fixedDir: +1, rowAxis: 1, rowSign: +1, colAxis: 2, colSign: -1 },
    F: { engineFace: 4, fixedAxis: 2, fixedDir: +1, rowAxis: 1, rowSign: +1, colAxis: 0, colSign: +1 },
    D: { engineFace: 1, fixedAxis: 1, fixedDir: +1, rowAxis: 2, rowSign: -1, colAxis: 0, colSign: +1 },
    L: { engineFace: 2, fixedAxis: 0, fixedDir: -1, rowAxis: 1, rowSign: +1, colAxis: 2, colSign: +1 },
    B: { engineFace: 5, fixedAxis: 2, fixedDir: -1, rowAxis: 1, rowSign: +1, colAxis: 0, colSign: -1 },
};

const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];

function keyForCoord(coord) {
    return `${coord[0].toFixed(4)},${coord[1].toFixed(4)},${coord[2].toFixed(4)}`;
}

/**
 * Build a Map keyed by stringified piece position → piece.
 * Uses fixed-precision strings to avoid -0/0 float weirdness across rotations.
 */
function indexByPosition(pieces) {
    const map = new Map();
    for (const piece of pieces) map.set(keyForCoord(piece.m), piece);
    return map;
}

/**
 * Encode `pieces` to a URFDLB facelet string of length 6*N*N.
 * Returns null with a reason if the cube is incomplete (e.g., shell holes
 * from a non-solid border) — the solver requires every surface position
 * to be populated.
 */
export function encodeFacelet(pieces, puzzle, config) {
    const { N } = config;
    const half = (N - 1) / 2;
    const byPos = indexByPosition(pieces);

    const out = [];
    for (const letter of FACE_ORDER) {
        const L = FACE_LAYOUT[letter];
        const fixedCoord = L.fixedDir * half;
        for (let rowIdx = 0; rowIdx < N; rowIdx++) {
            const rowCoord = L.rowSign * (rowIdx - half);
            for (let colIdx = 0; colIdx < N; colIdx++) {
                const colCoord = L.colSign * (colIdx - half);
                const m = [0, 0, 0];
                m[L.fixedAxis] = fixedCoord;
                m[L.rowAxis]   = rowCoord;
                m[L.colAxis]   = colCoord;

                const piece = byPos.get(keyForCoord(m));
                if (!piece) {
                    return {
                        ok: false,
                        reason: `Cube has missing pieces (set border to its max for a solid cube). First missing position on face ${letter} at (${m.join(',')}).`,
                    };
                }
                const engineColor = puzzle.getStickerColor(piece, L.engineFace, config);
                if (engineColor == null || engineColor < 0 || engineColor > 5) {
                    return {
                        ok: false,
                        reason: `Could not read sticker color at face ${letter}, row ${rowIdx}, col ${colIdx}.`,
                    };
                }
                out.push(ENGINE_TO_LETTER[engineColor]);
            }
        }
    }
    return { ok: true, state: out.join('') };
}

// Re-exported so callers can sanity-check what the engine emitted without
// duplicating the URFDLB face-ordering knowledge.
export { FACE_ORDER, ENGINE_TO_LETTER, FACE_LAYOUT };
