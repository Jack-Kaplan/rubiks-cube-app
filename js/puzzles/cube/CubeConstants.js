/**
 * Shared constants for the Rubik's Cube puzzle.
 * Extracted to avoid circular dependency between CubePuzzle and CubeTrefoilView.
 */
import { PIECE_GAP } from '../PuzzleDefinition.js';

export const COLORS = {
    0: '#ffd500', // Yellow (Top, Y-)
    1: '#f2f0ea', // White  (Bottom, Y+)
    2: '#18a83a', // Green  (Left, X-)
    3: '#0057d9', // Blue   (Right, X+)
    4: '#e3261e', // Red    (Front, Z+)
    5: '#ff7a00', // Orange (Back, Z-)
};

export const CUBIE_SIZE = 0.5 * PIECE_GAP;

// 8 corners: 0(-,-,-) 1(-,-,+) 2(-,+,-) 3(-,+,+) 4(+,-,-) 5(+,-,+) 6(+,+,-) 7(+,+,+)
// Winding: outward normals via (v1-v0)x(v2-v0)
export const FACE_DEFS = [
    { idx: [0, 4, 5, 1], axis: 1, dir: -1 }, // Y- top
    { idx: [2, 3, 7, 6], axis: 1, dir:  1 }, // Y+ bottom
    { idx: [0, 1, 3, 2], axis: 0, dir: -1 }, // X- left
    { idx: [4, 6, 7, 5], axis: 0, dir:  1 }, // X+ right
    { idx: [1, 5, 7, 3], axis: 2, dir:  1 }, // Z+ front
    { idx: [0, 2, 6, 4], axis: 2, dir: -1 }, // Z- back
];

// Maps FACE_DEFS index → [uAxis, vAxis] in 0-indexed grid coords (xi,yi,zi)
export const FACE_UV = [
    [0, 2], // defIdx 0 (Y- top):   u=xi, v=zi
    [2, 0], // defIdx 1 (Y+ bot):   u=zi, v=xi
    [2, 1], // defIdx 2 (X- left):  u=zi, v=yi
    [1, 2], // defIdx 3 (X+ right): u=yi, v=zi
    [0, 1], // defIdx 4 (Z+ front): u=xi, v=yi
    [1, 0], // defIdx 5 (Z- back):  u=yi, v=xi
];

// Face info: face index → { axis, dir }
export const FACE_INFO = [
    { axis: 1, dir: -1 }, // 0: Yellow (Top, Y-)
    { axis: 1, dir:  1 }, // 1: White  (Bottom, Y+)
    { axis: 0, dir: -1 }, // 2: Green  (Left, X-)
    { axis: 0, dir:  1 }, // 3: Blue   (Right, X+)
    { axis: 2, dir:  1 }, // 4: Red    (Front, Z+)
    { axis: 2, dir: -1 }, // 5: Orange (Back, Z-)
];

// Face axis lookup: face index → its axis
export const FACE_AXIS = [1, 1, 0, 0, 2, 2];

// Inner faces (closer to canvas center at intersection points in trefoil)
export const INNER_FACES = new Set([0, 3, 4]);

export function faceColorIndex(axis, dir) {
    if (axis === 1) return dir > 0 ? 1 : 0;
    if (axis === 0) return dir > 0 ? 3 : 2;
    return dir > 0 ? 4 : 5;
}
