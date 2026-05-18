// Encode engine state → URFDLB facelet string (Kociemba convention).
//
// Engine face id → URFDLB letter:
//   0 (Y- top) U   1 (Y+ bot) D   2 (X- left) L
//   3 (X+ right) R 4 (Z+ front) F 5 (Z- back) B
//
// Note: engine Y axis is inverted (-Y is up).

import { FACE_INFO } from '../puzzles/cube/CubeConstants.js';

const ENGINE_TO_LETTER = ['U', 'D', 'L', 'R', 'F', 'B'];

// Per face, how to walk its N×N grid in row-major reading order.
// fixedAxis/fixedDir locks the face plane; rowAxis/rowSign + colAxis/colSign
// drive the traversal. Coord at index i with sign s and half h: s*(i-h).
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

// Fixed-precision string keys avoid -0/0 float weirdness across rotations.
function indexByPosition(pieces) {
    const map = new Map();
    for (const piece of pieces) map.set(keyForCoord(piece.m), piece);
    return map;
}

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

export { FACE_ORDER, ENGINE_TO_LETTER, FACE_LAYOUT };
