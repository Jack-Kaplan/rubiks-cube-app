import { PuzzleDefinition } from '../PuzzleDefinition.js';
import { rotatePointAroundAxis } from '../../engine/math.js';
import {
    COLORS, AXES, FACE_NORMALS,
    FACE_DEFS, FACE_COUNT, VERTS_PER_FACE,
    UPRIGHT_STICKER_SLOT, latticePoint,
} from './PyraminxConstants.js';

export class PyraminxPuzzle extends PuzzleDefinition {

    // ── Identity ──────────────────────────────────────────
    get name()         { return 'Pyraminx'; }
    get id()           { return 'pyraminx'; }
    get colors()       { return COLORS; }
    get faceCount()    { return FACE_COUNT; }
    get faceDefs()     { return FACE_DEFS; }
    get vertsPerFace() { return VERTS_PER_FACE; }
    get moveAngle()    { return (2 * Math.PI) / 3; }

    // ── Configuration ─────────────────────────────────────
    get defaultConfig() {
        return { N: 3, selectedDepth: 1 };
    }

    get configParams() {
        return [
            { key: 'N', label: 'Size', type: 'number', min: 2, max: 8, default: 3 },
        ];
    }

    onConfigChange(config) {
        config.spacing = 140;
    }

    // ── Moves ─────────────────────────────────────────────
    get baseMoves() {
        return {
            'u': { vertex: 0, depth: 0, dir: 1 },   // U tip
            'l': { vertex: 1, depth: 0, dir: 1 },   // L tip
            'r': { vertex: 2, depth: 0, dir: 1 },   // R tip
            'b': { vertex: 3, depth: 0, dir: 1 },   // B tip
            'i': { vertex: 0, depth: -1, dir: 1 },  // U layer
            'j': { vertex: 1, depth: -1, dir: 1 },  // L layer
            'k': { vertex: 2, depth: -1, dir: 1 },  // R layer
            'o': { vertex: 3, depth: -1, dir: 1 },  // B layer
        };
    }

    resolveMove(baseMove, reversed, config) {
        const depth = baseMove.depth === -1
            ? Math.min(config.selectedDepth || 1, config.N - 1)
            : baseMove.depth;
        const dir = reversed ? -baseMove.dir : baseMove.dir;
        return {
            vertex: baseMove.vertex,
            axis: AXES[baseMove.vertex],
            depth,
            dir,
        };
    }

    // ── Piece Creation ────────────────────────────────────
    createPieces(config) {
        const N = config.N;
        const pieces = [];
        const SHRINK = 0.90;

        // Upright tetrahedra: (a,b,c,d) with a+b+c+d = N-1
        for (let a = 0; a <= N - 1; a++)
            for (let b = 0; b <= N - 1 - a; b++)
                for (let c = 0; c <= N - 1 - a - b; c++) {
                    const d = N - 1 - a - b - c;
                    const bary = [a, b, c, d];

                    // 4 tetrahedron vertices
                    const v0 = latticePoint(a + 1, b, c, d, N);
                    const v1 = latticePoint(a, b + 1, c, d, N);
                    const v2 = latticePoint(a, b, c + 1, d, N);
                    const v3 = latticePoint(a, b, c, d + 1, N);

                    // Center
                    const m = [
                        (v0[0] + v1[0] + v2[0] + v3[0]) / 4,
                        (v0[1] + v1[1] + v2[1] + v3[1]) / 4,
                        (v0[2] + v1[2] + v2[2] + v3[2]) / 4,
                    ];

                    // Shrink toward center for visual gaps
                    const shrunk = [v0, v1, v2, v3].map(v => [
                        m[0] + (v[0] - m[0]) * SHRINK,
                        m[1] + (v[1] - m[1]) * SHRINK,
                        m[2] + (v[2] - m[2]) * SHRINK,
                    ]);

                    // 6-slot layout: p[4] = p[2], p[5] = p[3] (degenerate duplicates)
                    const p = [
                        shrunk[0], shrunk[1], shrunk[2], shrunk[3],
                        [...shrunk[2]], [...shrunk[3]],
                    ];

                    // Stickers: upright tet face → sticker slot mapping
                    const stickers = new Array(FACE_COUNT).fill(null);
                    if (a === 0) stickers[UPRIGHT_STICKER_SLOT[0]] = { faceId: 0 };
                    if (b === 0) stickers[UPRIGHT_STICKER_SLOT[1]] = { faceId: 1 };
                    if (c === 0) stickers[UPRIGHT_STICKER_SLOT[2]] = { faceId: 2 };
                    if (d === 0) stickers[UPRIGHT_STICKER_SLOT[3]] = { faceId: 3 };

                    pieces.push({ m, p, stickers, bary, barySum: N - 1, isGap: false });
                }

        // Octahedral gap pieces: (a,b,c,d) with a+b+c+d = N-2
        if (N >= 2) {
            for (let a = 0; a <= N - 2; a++)
                for (let b = 0; b <= N - 2 - a; b++)
                    for (let c = 0; c <= N - 2 - a - b; c++) {
                        const d = N - 2 - a - b - c;
                        const bary = [a, b, c, d];

                        // 6 octahedron vertices (midpoints of surrounding tet edges)
                        const o01 = latticePoint(a + 1, b + 1, c, d, N);
                        const o02 = latticePoint(a + 1, b, c + 1, d, N);
                        const o03 = latticePoint(a + 1, b, c, d + 1, N);
                        const o12 = latticePoint(a, b + 1, c + 1, d, N);
                        const o13 = latticePoint(a, b + 1, c, d + 1, N);
                        const o23 = latticePoint(a, b, c + 1, d + 1, N);

                        const raw = [o01, o02, o03, o12, o13, o23];

                        // Center
                        const m = [0, 1, 2].map(i =>
                            raw.reduce((s, v) => s + v[i], 0) / 6
                        );

                        // Shrink toward center
                        const p = raw.map(v => [
                            m[0] + (v[0] - m[0]) * SHRINK,
                            m[1] + (v[1] - m[1]) * SHRINK,
                            m[2] + (v[2] - m[2]) * SHRINK,
                        ]);

                        // Stickers: face i gets sticker if bary[i] === 0
                        const stickers = new Array(FACE_COUNT).fill(null);
                        if (a === 0) stickers[0] = { faceId: 0 };
                        if (b === 0) stickers[1] = { faceId: 1 };
                        if (c === 0) stickers[2] = { faceId: 2 };
                        if (d === 0) stickers[3] = { faceId: 3 };

                        pieces.push({ m, p, stickers, bary, barySum: N - 2, isGap: true });
                    }
        }

        return pieces;
    }

    // ── Layer Selection ───────────────────────────────────
    isPieceInMove(piece, move) {
        const effectiveLayer = piece.barySum - piece.bary[move.vertex]
                             + (piece.isGap ? 1 : 0);
        return effectiveLayer <= move.depth;
    }

    // ── Rotation Application ──────────────────────────────
    applyRotation(pieces, move) {
        const { vertex, axis, dir } = move;
        const angle = (2 * Math.PI / 3) * dir;
        const others = [0, 1, 2, 3].filter(i => i !== vertex);

        for (const piece of pieces) {
            if (!this.isPieceInMove(piece, move)) continue;

            // Rotate all 3D positions
            for (let i = 0; i < piece.p.length; i++) {
                piece.p[i] = rotatePointAroundAxis(piece.p[i], axis, angle);
            }
            piece.m = rotatePointAroundAxis(piece.m, axis, angle);

            // Cycle barycentric coords for the 3 non-vertex indices
            const old = [...piece.bary];
            if (dir === 1) {
                // +120°: V1->V2->V3->V1 (for vertex 0)
                piece.bary[others[0]] = old[others[2]];
                piece.bary[others[1]] = old[others[0]];
                piece.bary[others[2]] = old[others[1]];
            } else {
                // -120°: reverse cycle
                piece.bary[others[0]] = old[others[1]];
                piece.bary[others[1]] = old[others[2]];
                piece.bary[others[2]] = old[others[0]];
            }
        }
    }

    // ── Color Detection ───────────────────────────────────
    getStickerColor(piece, faceIndex) {
        if (faceIndex < 0 || faceIndex >= FACE_COUNT) return null;
        const sticker = piece.stickers[faceIndex];
        return sticker ? sticker.faceId : null;
    }

    detectWorldFace(piece, faceVerts) {
        // Compute face normal via cross product
        const [a, b, c] = faceVerts;
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const nx = ab[1] * ac[2] - ab[2] * ac[1];
        const ny = ab[2] * ac[0] - ab[0] * ac[2];
        const nz = ab[0] * ac[1] - ab[1] * ac[0];

        // Dot with each parent face normal, find best match
        let best = -1, bestDot = -Infinity;
        for (let i = 0; i < 4; i++) {
            const fn = FACE_NORMALS[i];
            const dot = nx * fn[0] + ny * fn[1] + nz * fn[2];
            if (dot > bestDot) { bestDot = dot; best = i; }
        }
        return bestDot > 0.1 ? best : -1;
    }

    // ── Rendering ─────────────────────────────────────────
    getSpacing(config) { return config.spacing; }

    // ── Scramble ──────────────────────────────────────────
    generateScramble(config) {
        const moves = [];
        let lastVertex = -1;
        const N = config.N;
        const numMoves = N * 10;
        for (let i = 0; i < numMoves; i++) {
            let vertex;
            do { vertex = Math.floor(Math.random() * 4); } while (vertex === lastVertex);
            // depth 0..N-2 (depth N-1 rotates the whole puzzle, which is useless)
            const depth = Math.floor(Math.random() * (N - 1));
            const dir = Math.random() < 0.5 ? 1 : -1;
            moves.push({ vertex, axis: AXES[vertex], depth, dir });
            lastVertex = vertex;
        }
        return moves;
    }

    get has2DView() { return false; }
}
