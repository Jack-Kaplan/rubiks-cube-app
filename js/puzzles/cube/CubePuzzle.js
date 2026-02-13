import { PuzzleDefinition } from '../PuzzleDefinition.js';
import { worldToScreen } from '../../engine/math.js';
import { CubeTrefoilView } from './CubeTrefoilView.js';
import {
    COLORS, CUBIE_SIZE, FACE_DEFS, FACE_UV, FACE_INFO, FACE_AXIS,
    faceColorIndex
} from './CubeConstants.js';

function generateTestPattern(N, faceId) {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const cx = c.getContext('2d');
    const tile = size / N;
    for (let u = 0; u < N; u++) {
        for (let v = 0; v < N; v++) {
            cx.fillStyle = COLORS[faceId];
            cx.globalAlpha = 0.4 + 0.6 * ((u + v) / (2 * (N - 1) || 1));
            cx.fillRect(u * tile, v * tile, tile, tile);
            cx.globalAlpha = 1;
            cx.fillStyle = '#000';
            cx.font = `bold ${tile * 0.35}px sans-serif`;
            cx.textAlign = 'center';
            cx.textBaseline = 'middle';
            cx.fillText(`${u},${v}`, (u + 0.5) * tile, (v + 0.5) * tile);
        }
    }
    return c;
}

export class CubePuzzle extends PuzzleDefinition {

    get name() { return "Rubik's Cube"; }
    get id() { return 'cube'; }
    get colors() { return COLORS; }
    get faceCount() { return 6; }
    get faceDefs() { return FACE_DEFS; }
    get vertsPerFace() { return 4; }
    get moveAngle() { return Math.PI / 2; }

    get baseMoves() {
        return {
            'u': { axis: 1, side: -1, dir: -1 },
            'd': { axis: 1, side:  1, dir:  1 },
            'l': { axis: 0, side: -1, dir: -1 },
            'r': { axis: 0, side:  1, dir:  1 },
            'f': { axis: 2, side:  1, dir:  1 },
            'b': { axis: 2, side: -1, dir: -1 },
        };
    }

    get defaultConfig() {
        return { N: 3, borderWidth: 2, selectedDepth: 1, imageMode: false };
    }

    get configParams() {
        return [
            { key: 'N', label: 'Size', type: 'number', min: 1, max: 10, default: 3 },
            { key: 'borderWidth', label: 'Border', type: 'number', min: 1, max: 5, default: 2 },
            { key: 'imageMode', label: 'Images', type: 'checkbox', default: false },
        ];
    }

    onConfigChange(config) {
        config.half = (config.N - 1) / 2;
        config.spacing = Math.floor(310 / config.N);
        config.stickerRadius = Math.max(4, Math.min(16, Math.floor(48 / config.N)));
        config.borderWidth = Math.min(config.borderWidth, Math.ceil(config.N / 2));
        if (config.imageMode) {
            if (!this._faceImages) this._loadFaceImages(config.N);
        } else {
            this._faceImages = null;
        }
    }

    _loadFaceImages(N) {
        this._faceImages = new Array(6);
        for (let i = 0; i < 6; i++) this._faceImages[i] = generateTestPattern(N, i);
    }

    get faceImages() { return this._faceImages || null; }

    resolveMove(baseMove, reversed, config) {
        const layer = baseMove.side * (config.half - (config.selectedDepth - 1));
        const dir = reversed ? -baseMove.dir : baseMove.dir;
        return { axis: baseMove.axis, layer, dir };
    }

    generateScramble(config) {
        const moves = [];
        let lastAxis = -1;
        const numMoves = config.N * 7;
        for (let i = 0; i < numMoves; i++) {
            let axis;
            do { axis = Math.floor(Math.random() * 3); } while (axis === lastAxis);
            const layerIdx = Math.floor(Math.random() * config.N);
            const layer = layerIdx - config.half;
            moves.push({ axis, layer, dir: Math.random() < 0.5 ? 1 : -1 });
            lastAxis = axis;
        }
        return moves;
    }

    createPieces(config) {
        const { N, half, borderWidth } = config;
        const cubies = [];
        const S = CUBIE_SIZE;
        for (let xi = 0; xi < N; xi++) {
            for (let yi = 0; yi < N; yi++) {
                for (let zi = 0; zi < N; zi++) {
                    const coords = [xi, yi, zi];
                    let keep = false;
                    for (let a = 0; a < 3; a++) {
                        if (coords[a] !== 0 && coords[a] !== N - 1) continue;
                        const others = [0, 1, 2].filter(i => i !== a);
                        const d = Math.min(
                            coords[others[0]], N - 1 - coords[others[0]],
                            coords[others[1]], N - 1 - coords[others[1]]
                        );
                        if (d < borderWidth) { keep = true; break; }
                    }
                    if (!keep) continue;
                    const x = xi - half, y = yi - half, z = zi - half;
                    const corners = [];
                    for (let cx = -1; cx <= 1; cx += 2)
                        for (let cy = -1; cy <= 1; cy += 2)
                            for (let cz = -1; cz <= 1; cz += 2)
                                corners.push([x + cx * S, y + cy * S, z + cz * S]);
                    const stickers = new Array(6).fill(null);
                    for (let defIdx = 0; defIdx < FACE_DEFS.length; defIdx++) {
                        const def = FACE_DEFS[defIdx];
                        if ((def.dir === -1 && coords[def.axis] === 0) ||
                            (def.dir === 1 && coords[def.axis] === N - 1)) {
                            stickers[defIdx] = {
                                faceId: faceColorIndex(def.axis, def.dir),
                                u: coords[FACE_UV[defIdx][0]],
                                v: coords[FACE_UV[defIdx][1]],
                            };
                        }
                    }
                    cubies.push({ m: [x, y, z], p: corners, stickers });
                }
            }
        }
        return cubies;
    }

    applyRotation(pieces, move) {
        const { axis, layer, dir } = move;
        const [a, b] = [0, 1, 2].filter(i => i !== axis);
        for (const c of pieces) {
            if (Math.abs(c.m[axis] - layer) > 0.01) continue;
            const x = c.m[a], y = c.m[b];
            c.m[a] = -y * dir;
            c.m[b] = x * dir;
            for (const p of c.p) {
                const px = p[a], py = p[b];
                p[a] = -py * dir;
                p[b] = px * dir;
            }
        }
    }

    getStickerColor(piece, faceIndex, config) {
        const m = piece.m, p = piece.p;
        const { half } = config;
        if (faceIndex < 0 || faceIndex > 5) return null;
        const { axis: faceAxis, dir: faceDir } = FACE_INFO[faceIndex];
        if (Math.abs(m[faceAxis] - faceDir * half) > 0.01) return null;

        const extreme = faceDir > 0
            ? Math.max(...p.map(v => v[faceAxis]))
            : Math.min(...p.map(v => v[faceAxis]));
        const faceVerts = [];
        for (let i = 0; i < 8; i++)
            if (Math.abs(p[i][faceAxis] - extreme) < 0.1) faceVerts.push(i);
        if (faceVerts.length !== 4) return faceIndex;

        const cx = faceVerts.map(i => Math.floor(i / 4));
        if (cx.every(c => c === cx[0])) return cx[0] === 1 ? 3 : 2;
        const cy = faceVerts.map(i => Math.floor((i % 4) / 2));
        if (cy.every(c => c === cy[0])) return cy[0] === 1 ? 1 : 0;
        const cz = faceVerts.map(i => i % 2);
        if (cz.every(c => c === cz[0])) return cz[0] === 1 ? 4 : 5;
        return faceIndex;
    }

    getSpacing(config) {
        return config.spacing;
    }

    detectWorldFace(piece, faceVerts, config) {
        for (let ax = 0; ax < 3; ax++) {
            const v = faceVerts[0][ax];
            if (faceVerts.every(pt => Math.abs(pt[ax] - v) < 0.01)) {
                return faceColorIndex(ax, v > piece.m[ax] ? 1 : -1);
            }
        }
        return -1;
    }

    // ── 2D View ──────────────────────────────────────────────

    get has2DView() { return true; }

    create2DView(canvas) {
        return new CubeTrefoilView(canvas, this);
    }

    // ── Arrow-key move resolution ─────────────────────────────

    resolveArrowMove(piece, faceIndex, screenDir, viewYaw, viewPitch, config) {
        const m = piece.m;
        const faceAxis = FACE_AXIS[faceIndex];
        const tangentAxes = [0, 1, 2].filter(i => i !== faceAxis);

        let bestAxis = tangentAxes[0], bestDir = 1, bestDot = -Infinity;
        for (const rotAxis of tangentAxes) {
            const [a, b] = [0, 1, 2].filter(i => i !== rotAxis);
            const vel = [0, 0, 0];
            vel[a] = -m[b];
            vel[b] = m[a];
            const [sx, sy] = worldToScreen(vel[0], vel[1], vel[2], viewYaw, viewPitch);
            const dot = sx * screenDir[0] + sy * screenDir[1];
            if (Math.abs(dot) > bestDot) {
                bestDot = Math.abs(dot);
                bestAxis = rotAxis;
                bestDir = dot > 0 ? 1 : -1;
            }
        }
        return { axis: bestAxis, layer: m[bestAxis], dir: bestDir };
    }

    // ── Static accessors for external consumers ──────────────

    static get FACE_AXIS() { return FACE_AXIS; }
    static faceColorIndex(axis, dir) { return faceColorIndex(axis, dir); }
}
