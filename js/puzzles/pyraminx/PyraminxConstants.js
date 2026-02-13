/**
 * Shared constants for the Pyraminx puzzle.
 */

// 4 face colors, indexed by parent face (opposite vertex i)
export const COLORS = {
    0: '#FF3B30',  // Red    (face opposite V0)
    1: '#00AA00',  // Green  (face opposite V1)
    2: '#0066CC',  // Blue   (face opposite V2)
    3: '#FFD700',  // Yellow (face opposite V3)
};

// Parent tetrahedron vertices (regular tet inscribed in a cube, centered at origin)
export const PARENT_VERTS = [
    [ 1,  1,  1],   // V0
    [ 1, -1, -1],   // V1
    [-1,  1, -1],   // V2
    [-1, -1,  1],   // V3
];

// Rotation axes: unit vectors through each vertex from origin
const R3 = 1 / Math.sqrt(3);
export const AXES = [
    [ R3,  R3,  R3],   // axis 0 (through V0)
    [ R3, -R3, -R3],   // axis 1 (through V1)
    [-R3,  R3, -R3],   // axis 2 (through V2)
    [-R3, -R3,  R3],   // axis 3 (through V3)
];

// Outward normals for each parent face (face i is opposite vertex i)
export const FACE_NORMALS = [
    [-R3, -R3, -R3],   // face 0 (opposite V0)
    [-R3,  R3,  R3],   // face 1 (opposite V1)
    [ R3, -R3,  R3],   // face 2 (opposite V2)
    [ R3,  R3, -R3],   // face 3 (opposite V3)
];

/**
 * Unified face definitions for all pieces (6 vertex slots, 8 triangular faces).
 *
 * Faces 0-3: outer-surface candidates (can carry stickers for parent face i)
 * Faces 4-7: interior-facing (toward vertex i, never stickered)
 *
 * For upright tets: slots 4,5 duplicate slots 2,3, causing faces 0,2,6,7
 * to degenerate to zero area and get auto-culled by backface check.
 * The 4 real tet faces map to face indices 1,3,4,5.
 *
 * For octahedral gap pieces: all 6 slots are distinct, all 8 faces real.
 */
export const FACE_DEFS = [
    { idx: [3, 4, 5], parentFace: 0 },
    { idx: [1, 5, 2], parentFace: 1 },
    { idx: [0, 2, 4], parentFace: 2 },
    { idx: [0, 3, 1], parentFace: 3 },
    { idx: [0, 1, 2], parentFace: -1 },
    { idx: [0, 4, 3], parentFace: -1 },
    { idx: [1, 3, 5], parentFace: -1 },
    { idx: [2, 5, 4], parentFace: -1 },
];

export const FACE_COUNT = 8;
export const VERTS_PER_FACE = 3;

/**
 * Sticker-slot mapping for upright tets.
 * Maps parent face index -> which stickers[] slot holds it.
 *   parentFace 0 -> stickers[1]  (face def 1 is the real tet face opp V0)
 *   parentFace 1 -> stickers[5]
 *   parentFace 2 -> stickers[3]
 *   parentFace 3 -> stickers[4]
 */
export const UPRIGHT_STICKER_SLOT = { 0: 1, 1: 5, 2: 3, 3: 4 };

/** Compute a 3D lattice point from barycentric coordinates (a,b,c,d) at size N. */
export function latticePoint(a, b, c, d, N) {
    const V = PARENT_VERTS;
    return [
        (a * V[0][0] + b * V[1][0] + c * V[2][0] + d * V[3][0]) / N,
        (a * V[0][1] + b * V[1][1] + c * V[2][1] + d * V[3][1]) / N,
        (a * V[0][2] + b * V[1][2] + c * V[2][2] + d * V[3][2]) / N,
    ];
}
