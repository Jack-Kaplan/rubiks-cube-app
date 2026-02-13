import { rotatePoint, rotatePointAroundAxis, project, ease, pointInQuad, pointInConvexPolygon } from './math.js';

/**
 * Generic 3D renderer for any puzzle. Uses Canvas 2D with painter's algorithm.
 * Puzzle-agnostic: delegates face definitions, spacing, culling, and color
 * detection to the PuzzleDefinition interface.
 */
export class Renderer3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.W = canvas.width;
        this.H = canvas.height;
        this.CX = this.W / 2;
        this.CY = this.H / 2;
        this.viewYaw = 0.6;
        this.viewPitch = -0.7;
        this.lastRenderedFaces = [];
    }

    /**
     * Render all pieces of the puzzle in 3D.
     * @param {PuzzleDefinition} puzzle
     * @param {Array} pieces
     * @param {Object|null} move - Current animating move
     * @param {number} progress - Raw animation progress 0..1
     * @param {Object} config
     * @param {Object|null} selected - Current selection { faceIndex, m }
     */
    render(puzzle, pieces, move, progress, config, selected) {
        const ctx = this.ctx;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, this.W, this.H);

        const allFaces = [];
        const spacing = puzzle.getSpacing(config);
        const faceDefs = puzzle.faceDefs;
        const vertsPerFace = puzzle.vertsPerFace;
        const moveAngle = puzzle.moveAngle;

        for (const piece of pieces) {
            let verts = piece.p.map(p => [p[0] * spacing, p[1] * spacing, p[2] * spacing]);

            // Animate affected pieces
            if (move && puzzle.isPieceInMove(piece, move)) {
                const angle = ease(progress) * moveAngle * move.dir;
                if (Array.isArray(move.axis)) {
                    verts = verts.map(v => rotatePointAroundAxis(v, move.axis, angle));
                } else {
                    verts = verts.map(v => rotatePoint(v, move.axis, angle));
                }
            }

            const proj = verts.map(v => project(v[0], v[1], v[2], this.viewYaw, this.viewPitch, this.CX, this.CY));

            for (let defIdx = 0; defIdx < faceDefs.length; defIdx++) {
                const def = faceDefs[defIdx];
                const fv = def.idx.map(i => proj[i]);

                // Backface cull
                if (!puzzle.isFrontFacing(fv)) continue;

                const sticker = piece.stickers[defIdx];
                let color = puzzle.innerColor;
                let faceIndex = -1;
                if (sticker) {
                    color = puzzle.colors[sticker.faceId];
                    const facePs = def.idx.map(i => piece.p[i]);
                    faceIndex = puzzle.detectWorldFace(piece, facePs, config);
                }

                allFaces.push({
                    verts: fv,
                    color,
                    depth: fv.reduce((sum, v) => sum + v.z, 0) / vertsPerFace,
                    piece,
                    faceIndex,
                    sticker,
                });
            }
        }

        // Painter's algorithm: draw far faces first
        allFaces.sort((a, b) => a.depth - b.depth);
        this.lastRenderedFaces = allFaces;

        for (const f of allFaces) {
            // Check for image mode (cube-specific optimization)
            if (puzzle.faceImages && f.sticker && puzzle.faceImages[f.sticker.faceId]) {
                this._drawImageTile(ctx, puzzle.faceImages[f.sticker.faceId], f.sticker, f.verts, config);
            } else {
                ctx.beginPath();
                ctx.moveTo(f.verts[0].x, f.verts[0].y);
                for (let i = 1; i < vertsPerFace; i++) ctx.lineTo(f.verts[i].x, f.verts[i].y);
                ctx.closePath();
                ctx.fillStyle = f.color;
                ctx.fill();
            }
            // Stroke edges
            ctx.beginPath();
            ctx.moveTo(f.verts[0].x, f.verts[0].y);
            for (let i = 1; i < vertsPerFace; i++) ctx.lineTo(f.verts[i].x, f.verts[i].y);
            ctx.closePath();
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Highlight selected face
        if (selected) {
            const selPiece = puzzle.findPieceAt(pieces, selected.m);
            if (selPiece) {
                const hit = allFaces.find(f => f.piece === selPiece && f.faceIndex === selected.faceIndex);
                if (hit) {
                    ctx.beginPath();
                    ctx.moveTo(hit.verts[0].x, hit.verts[0].y);
                    for (let i = 1; i < vertsPerFace; i++) ctx.lineTo(hit.verts[i].x, hit.verts[i].y);
                    ctx.closePath();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 4;
                    ctx.stroke();
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
        }
    }

    /**
     * Hit-test: given canvas coords, find which sticker face was clicked.
     * @returns {{ piece, faceIndex, faceAxis }|null}
     */
    hitTest(px, py, faceAxisLookup) {
        for (let i = this.lastRenderedFaces.length - 1; i >= 0; i--) {
            const f = this.lastRenderedFaces[i];
            if (f.faceIndex < 0) continue;
            if (pointInConvexPolygon(px, py, f.verts)) {
                const faceAxis = faceAxisLookup ? faceAxisLookup[f.faceIndex] : 0;
                return { faceIndex: f.faceIndex, faceAxis, m: [...f.piece.m], from: '3d' };
            }
        }
        return null;
    }

    _drawImageTile(ctx, img, sticker, verts, config) {
        const N = config.N || 3;
        const [v0, v1, v2, v3] = verts;
        const tileW = img.width / N, tileH = img.height / N;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(v0.x, v0.y);
        ctx.lineTo(v1.x, v1.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.lineTo(v3.x, v3.y);
        ctx.closePath();
        ctx.clip();
        ctx.setTransform(
            v1.x - v0.x, v1.y - v0.y,
            v3.x - v0.x, v3.y - v0.y,
            v0.x, v0.y
        );
        ctx.drawImage(img,
            sticker.u * tileW, sticker.v * tileH, tileW, tileH,
            0, 0, 1, 1
        );
        ctx.restore();
    }
}
