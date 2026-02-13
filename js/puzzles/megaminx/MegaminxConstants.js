/**
 * Shared constants for the Megaminx puzzle (dodecahedron).
 */
const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = PHI - 1;

// ── 12 face colors ──────────────────────────────────────
export const COLORS = {
    0: '#FFFFFF',  1: '#FFD700',  2: '#CC0000',  3: '#FF6600',
    4: '#006400',  5: '#90EE90',  6: '#0000CD',  7: '#87CEEB',
    8: '#6A0DAD',  9: '#FF69B4',  10: '#808080', 11: '#DEB887',
};

// ── Vector helpers ──────────────────────────────────────
export const dot3 = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
export const cross3 = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const sub3 = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const add3 = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
export const scale3 = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
export const lerp3 = (a, b, t) => [a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1]), a[2]+t*(b[2]-a[2])];
export const norm3 = (a) => { const l = Math.sqrt(dot3(a, a)); return scale3(a, 1 / l); };

/** Intersect two coplanar 3D lines: P1+t*D1 and P2+s*D2. Returns point. */
export function lineIntersect(P1, D1, P2, D2, N) {
    const dP = sub3(P2, P1);
    const t = dot3(cross3(dP, D2), N) / dot3(cross3(D1, D2), N);
    return add3(P1, scale3(D1, t));
}

// ── 20 dodecahedron vertices (distance √3 from origin) ─
export const VERTS = [
    [ 1,  1,  1], [ 1,  1, -1], [ 1, -1,  1], [ 1, -1, -1],
    [-1,  1,  1], [-1,  1, -1], [-1, -1,  1], [-1, -1, -1],
    [0,  INV_PHI,  PHI], [0,  INV_PHI, -PHI],
    [0, -INV_PHI,  PHI], [0, -INV_PHI, -PHI],
    [ INV_PHI,  PHI, 0], [ INV_PHI, -PHI, 0],
    [-INV_PHI,  PHI, 0], [-INV_PHI, -PHI, 0],
    [ PHI, 0,  INV_PHI], [ PHI, 0, -INV_PHI],
    [-PHI, 0,  INV_PHI], [-PHI, 0, -INV_PHI],
];

// ── 12 face normals (icosahedron dual vertices, normalized) ─
const _NR = Math.sqrt(1 + PHI * PHI);
export const NORMALS = [
    [0,  PHI,  1], [0,  PHI, -1], [0, -PHI,  1], [0, -PHI, -1],
    [ PHI,  1, 0], [ PHI, -1, 0], [-PHI,  1, 0], [-PHI, -1, 0],
    [ 1, 0,  PHI], [ 1, 0, -PHI], [-1, 0,  PHI], [-1, 0, -PHI],
].map(v => v.map(c => c / _NR));

// ── Compute 12 pentagonal faces (CCW from outside) ──────
function computeFaces() {
    return NORMALS.map(normal => {
        const dots = VERTS.map((v, i) => ({ i, d: dot3(v, normal) }));
        dots.sort((a, b) => b.d - a.d);
        const top5 = dots.slice(0, 5);
        const center = scale3(top5.reduce((s, { i }) => add3(s, VERTS[i]), [0, 0, 0]), 0.2);
        // Tangent basis for CCW sort
        let ref = [1, 0, 0];
        if (Math.abs(dot3(normal, ref)) > 0.9) ref = [0, 1, 0];
        const u = norm3(cross3(normal, ref));
        const v = cross3(normal, u);
        const sorted = top5.map(({ i }) => {
            const rel = sub3(VERTS[i], center);
            return { i, angle: Math.atan2(dot3(rel, v), dot3(rel, u)) };
        });
        sorted.sort((a, b) => a.angle - b.angle);
        return sorted.map(x => x.i);
    });
}
export const FACES = computeFaces();

// ── Compute 30 edges ────────────────────────────────────
function computeEdges() {
    const map = {};
    for (let fi = 0; fi < 12; fi++) {
        const face = FACES[fi];
        for (let j = 0; j < 5; j++) {
            const a = face[j], b = face[(j + 1) % 5];
            const key = Math.min(a, b) + ',' + Math.max(a, b);
            if (!map[key]) map[key] = { verts: [a, b], faces: [], edgeInFace: {} };
            map[key].faces.push(fi);
            map[key].edgeInFace[fi] = j;
        }
    }
    return Object.values(map);
}
export const EDGES = computeEdges();

// ── Vertex → faces map (each vertex touches 3 faces) ───
function computeVertexFaces() {
    const m = Array.from({ length: 20 }, () => []);
    for (let fi = 0; fi < 12; fi++)
        for (const vi of FACES[fi])
            if (!m[vi].includes(fi)) m[vi].push(fi);
    return m;
}
export const VERTEX_FACES = computeVertexFaces();

// ── Rendering face definitions ──────────────────────────
// 0-2: sticker faces, 3: inner backing, 4-8: side walls
export const FACE_DEFS = [
    { idx: [0, 1, 2, 3, 4] },
    { idx: [5, 6, 7, 8, 9] },
    { idx: [10, 11, 12, 13, 14] },
    { idx: [15, 16, 17, 18, 19] },
    { idx: [20, 21, 22, 23, 24] },
    { idx: [25, 26, 27, 28, 29] },
    { idx: [30, 31, 32, 33, 34] },
    { idx: [35, 36, 37, 38, 39] },
    { idx: [40, 41, 42, 43, 44] },
];
export const FACE_COUNT = 9;
export const VERTS_PER_FACE = 5;

// ── Geometry parameters ─────────────────────────────────
export const CUT_DEPTH = 0.45;   // fraction of apothem for cut line inset
export const SHRINK = 0.98;      // shrink toward centroid for gap between pieces
export const THICKNESS = 0.35;   // depth of inner backing face (backing at 65%)
export const LAYER_THRESHOLD = 1.05; // dot product cutoff for isPieceInMove

/**
 * Compute sticker geometry for one dodecahedron face.
 * Returns { center, edges, corners } where:
 *   center = [5 points] (inner pentagon)
 *   edges  = [[4 points] × 5] (quad stickers along each outer edge)
 *   corners = [[4 points] × 5] (quad stickers at each vertex)
 */
export function computeFaceStickers(faceIdx) {
    const face = FACES[faceIdx];
    const V = face.map(i => VERTS[i]);
    const normal = NORMALS[faceIdx];
    const C = scale3(V.reduce((s, v) => add3(s, v), [0, 0, 0]), 0.2);

    // Cut lines: parallel to each edge, shifted inward by CUT_DEPTH
    const cutP = [], cutD = [];
    for (let k = 0; k < 5; k++) {
        const mid = lerp3(V[k], V[(k + 1) % 5], 0.5);
        cutP.push(lerp3(mid, C, CUT_DEPTH));
        cutD.push(sub3(V[(k + 1) % 5], V[k]));
    }

    // Inner pentagon: Q[k] = intersection of cut line k and cut line (k+1)
    const Q = [];
    for (let k = 0; k < 5; k++) {
        Q.push(lineIntersect(cutP[k], cutD[k], cutP[(k + 1) % 5], cutD[(k + 1) % 5], normal));
    }

    // Cut points on each outer edge
    // cutNear[j] = near V[j], from cut line (j-1)
    // cutFar[j]  = near V[j+1], from cut line (j+1)
    const edgeDir = [];
    for (let j = 0; j < 5; j++) edgeDir.push(sub3(V[(j + 1) % 5], V[j]));

    const cutNear = [], cutFar = [];
    for (let j = 0; j < 5; j++) {
        cutNear.push(lineIntersect(V[j], edgeDir[j], cutP[(j + 4) % 5], cutD[(j + 4) % 5], normal));
        cutFar.push(lineIntersect(V[j], edgeDir[j], cutP[(j + 1) % 5], cutD[(j + 1) % 5], normal));
    }

    // Center sticker: inner pentagon Q[0..4] (already CCW)
    const center = Q;

    // Edge sticker on edge j: quad [cutNear[j], cutFar[j], Q[j], Q[j-1]]  (CCW)
    const edges = [];
    for (let j = 0; j < 5; j++) {
        edges.push([cutNear[j], cutFar[j], Q[j], Q[(j + 4) % 5]]);
    }

    // Corner sticker at vertex k: quad [cutNear[k], Q[k-1], cutFar[k-1], V[k]]  (CCW)
    const corners = [];
    for (let k = 0; k < 5; k++) {
        corners.push([cutNear[k], Q[(k + 4) % 5], cutFar[(k + 4) % 5], V[k]]);
    }

    return { center, edges, corners };
}
