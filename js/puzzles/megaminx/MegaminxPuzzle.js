import { PuzzleDefinition } from '../PuzzleDefinition.js';
import { rotatePointAroundAxis } from '../../engine/math.js';
import {
    COLORS, NORMALS, FACES, EDGES, VERTEX_FACES,
    FACE_DEFS, FACE_COUNT, VERTS_PER_FACE,
    SHRINK, THICKNESS, LAYER_THRESHOLD,
    dot3, sub3, add3, scale3, lerp3,
    computeFaceStickers,
} from './MegaminxConstants.js';

export class MegaminxPuzzle extends PuzzleDefinition {

    // ── Identity ──────────────────────────────────────────
    get name()         { return 'Megaminx'; }
    get id()           { return 'megaminx'; }
    get colors()       { return COLORS; }
    get faceCount()    { return FACE_COUNT; }
    get faceDefs()     { return FACE_DEFS; }
    get vertsPerFace() { return VERTS_PER_FACE; }
    get moveAngle()    { return (2 * Math.PI) / 5; }

    // ── Camera ────────────────────────────────────────────
    get defaultViewAngles() { return { yaw: 0.4, pitch: -0.5 }; }

    // ── Configuration ─────────────────────────────────────
    get defaultConfig() { return { selectedDepth: 1 }; }
    get configParams()  { return []; }
    onConfigChange(config) { config.spacing = 130; }

    // ── Moves ─────────────────────────────────────────────
    get baseMoves() {
        return {
            'u': { face: 0, dir: 1 },
            'b': { face: 1, dir: 1 },
            'r': { face: 4, dir: 1 },
            'l': { face: 6, dir: 1 },
            'f': { face: 8, dir: 1 },
            'd': { face: 3, dir: 1 },
            'n': { face: 2, dir: 1 },
            'j': { face: 5, dir: 1 },
            'h': { face: 7, dir: 1 },
            'g': { face: 9, dir: 1 },
            's': { face: 10, dir: 1 },
            'a': { face: 11, dir: 1 },
        };
    }

    resolveMove(baseMove, reversed, config) {
        return {
            face: baseMove.face,
            axis: NORMALS[baseMove.face],
            dir: reversed ? -baseMove.dir : baseMove.dir,
        };
    }

    // ── Piece Creation ────────────────────────────────────
    createPieces(config) {
        const pieces = [];
        const faceStickers = [];
        for (let fi = 0; fi < 12; fi++) faceStickers.push(computeFaceStickers(fi));

        // Helper: build a piece from its sticker face descriptions
        const makePiece = (stickerFaces) => {
            const allVerts = stickerFaces.flatMap(f => f.verts);
            const centroid = scale3(allVerts.reduce((s, v) => add3(s, v), [0, 0, 0]), 1 / allVerts.length);
            const p = new Array(45);
            const stickers = new Array(9).fill(null);

            // Sticker face slots (defs 0, 1, 2)
            for (let fi = 0; fi < stickerFaces.length && fi < 3; fi++) {
                const base = fi * 5;
                const verts = stickerFaces[fi].verts;
                for (let i = 0; i < 5; i++) {
                    const v = verts[Math.min(i, verts.length - 1)];
                    p[base + i] = lerp3(centroid, v, SHRINK);
                }
                stickers[fi] = { faceId: stickerFaces[fi].faceId };
            }

            // Inner backing face (reversed winding, scaled toward origin)
            const innerIdx = Math.min(stickerFaces.length, 3);
            const base = innerIdx * 5;
            const rev = [...stickerFaces[0].verts].reverse();
            for (let i = 0; i < 5; i++) {
                const v = rev[Math.min(i, rev.length - 1)];
                p[base + i] = scale3(lerp3(centroid, v, SHRINK), 1 - THICKNESS);
            }

            // Degenerate remaining slots
            for (let fi = innerIdx + 1; fi < 9; fi++) {
                const b = fi * 5;
                for (let i = 0; i < 5; i++) p[b + i] = [...centroid];
            }

            return { m: centroid, p, stickers };
        };

        // 12 center pieces
        for (let fi = 0; fi < 12; fi++) {
            pieces.push(makePiece([{ verts: faceStickers[fi].center, faceId: fi }]));
        }

        // 30 edge pieces
        for (const edge of EDGES) {
            const [f0, f1] = edge.faces;
            const e0 = edge.edgeInFace[f0];
            const e1 = edge.edgeInFace[f1];
            pieces.push(makePiece([
                { verts: faceStickers[f0].edges[e0], faceId: f0 },
                { verts: faceStickers[f1].edges[e1], faceId: f1 },
            ]));
        }

        // 20 corner pieces
        for (let vi = 0; vi < 20; vi++) {
            const faces = VERTEX_FACES[vi];
            if (faces.length !== 3) continue;
            const sf = faces.map(fi => {
                const idx = FACES[fi].indexOf(vi);
                return { verts: faceStickers[fi].corners[idx], faceId: fi };
            });
            pieces.push(makePiece(sf));
        }

        return pieces;
    }

    // ── Layer Detection ───────────────────────────────────
    isPieceInMove(piece, move) {
        return dot3(piece.m, move.axis) > LAYER_THRESHOLD;
    }

    // ── Rotation ──────────────────────────────────────────
    applyRotation(pieces, move) {
        const { axis, dir } = move;
        const angle = (2 * Math.PI / 5) * dir;
        for (const piece of pieces) {
            if (!this.isPieceInMove(piece, move)) continue;
            for (let i = 0; i < piece.p.length; i++) {
                piece.p[i] = rotatePointAroundAxis(piece.p[i], axis, angle);
            }
            piece.m = rotatePointAroundAxis(piece.m, axis, angle);
        }
    }

    // ── Color / Rendering ─────────────────────────────────
    getStickerColor(piece, faceIndex) {
        if (faceIndex < 0 || faceIndex >= FACE_COUNT) return null;
        const sticker = piece.stickers[faceIndex];
        return sticker ? sticker.faceId : null;
    }

    detectWorldFace(piece, faceVerts) {
        const [a, b, c] = faceVerts;
        const ab = sub3(b, a), ac = sub3(c, a);
        const nx = ab[1]*ac[2] - ab[2]*ac[1];
        const ny = ab[2]*ac[0] - ab[0]*ac[2];
        const nz = ab[0]*ac[1] - ab[1]*ac[0];
        let best = -1, bestDot = -Infinity;
        for (let i = 0; i < 12; i++) {
            const fn = NORMALS[i];
            const d = nx*fn[0] + ny*fn[1] + nz*fn[2];
            if (d > bestDot) { bestDot = d; best = i; }
        }
        return bestDot > 0.01 ? best : -1;
    }

    getSpacing(config) { return config.spacing || 130; }

    // ── Scramble ──────────────────────────────────────────
    generateScramble(config) {
        const moves = [];
        let lastFace = -1;
        for (let i = 0; i < 60; i++) {
            let face;
            do { face = Math.floor(Math.random() * 12); } while (face === lastFace);
            const dir = Math.random() < 0.5 ? 1 : -1;
            moves.push({ face, axis: NORMALS[face], dir });
            lastFace = face;
        }
        return moves;
    }

    // ── Piece Lookup ──────────────────────────────────────
    findPieceAt(pieces, m) {
        let best = null, bestDist = Infinity;
        for (const p of pieces) {
            const d = Math.hypot(p.m[0] - m[0], p.m[1] - m[1], p.m[2] - m[2]);
            if (d < bestDist) { bestDist = d; best = p; }
        }
        return bestDist < 0.5 ? best : null;
    }

    get has2DView() { return false; }
}
