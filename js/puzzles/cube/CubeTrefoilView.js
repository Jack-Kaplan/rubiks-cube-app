import { ease } from '../../engine/math.js';
import { FACE_AXIS, FACE_INFO, INNER_FACES, faceColorIndex } from './CubeConstants.js';

/**
 * 2D Trefoil (Jagarikin-style) view for the Rubik's Cube.
 * 3-circle Venn diagram: one ring set per rotation axis.
 * Each ring set has N concentric rings; stickers sit at circle-circle intersections.
 */
export class CubeTrefoilView {
    constructor(canvas, puzzle) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.CX = canvas.width / 2;
        this.CY = canvas.height / 2;
        this.puzzle = puzzle;

        this.centerDist = 136;
        this.ringSetAngles = [30, 270, 150];
        this.innerFaces = INNER_FACES;
        this.faceAxis = FACE_AXIS;
        this.ringRadii = [];
        this.lastRenderedStickers = [];
    }

    updateScaling(config) {
        const { N } = config;
        const ringSpacing = 90 / N;
        const minR = 210 - ringSpacing * (N - 1) / 2;
        this.ringRadii = Array.from({ length: N }, (_, i) => minR + i * ringSpacing);
    }

    ringSetCenter(axis) {
        const ang = this.ringSetAngles[axis] * Math.PI / 180;
        return {
            x: this.CX + this.centerDist * Math.cos(ang),
            y: this.CY + this.centerDist * Math.sin(ang)
        };
    }

    circleIntersection(cx1, cy1, r1, cx2, cy2, r2, pickInner) {
        const dx = cx2 - cx1, dy = cy2 - cy1;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.001) return { x: cx1, y: cy1 };
        const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
        const px = cx1 + a * dx / d, py = cy1 + a * dy / d;
        const ox = h * dy / d, oy = h * dx / d;
        const p1 = { x: px + ox, y: py - oy };
        const p2 = { x: px - ox, y: py + oy };
        const d1 = (p1.x - this.CX) ** 2 + (p1.y - this.CY) ** 2;
        const d2 = (p2.x - this.CX) ** 2 + (p2.y - this.CY) ** 2;
        return pickInner ? (d1 < d2 ? p1 : p2) : (d1 < d2 ? p2 : p1);
    }

    stickerTo2D(faceIndex, cubieM, config) {
        const faceAx = this.faceAxis[faceIndex];
        const otherAxes = [0, 1, 2].filter(a => a !== faceAx);
        const [rsA, rsB] = otherAxes;
        const ringA = Math.round(cubieM[rsA] + config.half);
        const ringB = Math.round(cubieM[rsB] + config.half);
        const cA = this.ringSetCenter(rsA);
        const cB = this.ringSetCenter(rsB);
        return this.circleIntersection(
            cA.x, cA.y, this.ringRadii[ringA],
            cB.x, cB.y, this.ringRadii[ringB],
            this.innerFaces.has(faceIndex)
        );
    }

    render(pieces, move, progress, config) {
        const W2 = this.canvas.width, H2 = this.canvas.height;
        const ctx2 = this.ctx;
        ctx2.fillStyle = '#fff';
        ctx2.fillRect(0, 0, W2, H2);

        // Guide circles
        ctx2.strokeStyle = '#ddd';
        ctx2.lineWidth = 1;
        for (let axis = 0; axis < 3; axis++) {
            const c = this.ringSetCenter(axis);
            for (const r of this.ringRadii) {
                ctx2.beginPath();
                ctx2.arc(c.x, c.y, r, 0, Math.PI * 2);
                ctx2.stroke();
            }
        }

        const t = move ? ease(progress) : 0;
        const allStickers = [];
        const faceDefs = this.puzzle.faceDefs;

        let planeA, planeB;
        if (move) {
            [planeA, planeB] = [0, 1, 2].filter(i => i !== move.axis);
        }

        for (const cubie of pieces) {
            for (const def of faceDefs) {
                const facePs = def.idx.map(i => cubie.p[i]);
                let fi = -1, stickerAxis = -1, stickerDir = 0;
                for (let ax = 0; ax < 3; ax++) {
                    const val = facePs[0][ax];
                    if (facePs.every(pt => Math.abs(pt[ax] - val) < 0.01)) {
                        const d = val > cubie.m[ax] ? 1 : -1;
                        if (Math.abs(cubie.m[ax] - d * config.half) < 0.01) {
                            fi = faceColorIndex(ax, d);
                            stickerAxis = ax;
                            stickerDir = d;
                        }
                        break;
                    }
                }
                if (fi < 0) continue;

                const ci = this.puzzle.getStickerColor(cubie, fi, config);
                const color = ci !== null ? this.puzzle.colors[ci] : this.puzzle.innerColor;
                const m = cubie.m;
                const startPos = this.stickerTo2D(fi, m, config);

                const entry = { x: startPos.x, y: startPos.y, color, fi, cubie, faceAxis: this.faceAxis[fi] };

                if (move && Math.abs(m[move.axis] - move.layer) < 0.01) {
                    const newM = [m[0], m[1], m[2]];
                    newM[planeA] = -m[planeB] * move.dir;
                    newM[planeB] = m[planeA] * move.dir;

                    let newFi;
                    if (stickerAxis === move.axis) {
                        newFi = fi;
                    } else if (stickerAxis === planeA) {
                        newFi = faceColorIndex(planeB, stickerDir * move.dir);
                    } else {
                        newFi = faceColorIndex(planeA, -stickerDir * move.dir);
                    }

                    const endPos = this.stickerTo2D(newFi, newM, config);

                    if (stickerAxis !== move.axis) {
                        const rc = this.ringSetCenter(move.axis);
                        const ringIdx = Math.round(move.layer + config.half);
                        const radius = this.ringRadii[ringIdx];
                        const startAng = Math.atan2(startPos.y - rc.y, startPos.x - rc.x);
                        const endAng = Math.atan2(endPos.y - rc.y, endPos.x - rc.x);
                        let delta = endAng - startAng;
                        while (delta > Math.PI) delta -= 2 * Math.PI;
                        while (delta < -Math.PI) delta += 2 * Math.PI;
                        entry.arc = { rc, radius, startAng, delta };
                    } else {
                        entry.x = startPos.x + (endPos.x - startPos.x) * t;
                        entry.y = startPos.y + (endPos.y - startPos.y) * t;
                    }
                }

                allStickers.push(entry);
            }
        }

        // Majority-vote on arc direction
        const arcEntries = allStickers.filter(e => e.arc);
        if (arcEntries.length > 0) {
            const posCount = arcEntries.filter(e => e.arc.delta > 0).length;
            const majorityPositive = posCount > arcEntries.length / 2;
            for (const e of arcEntries) {
                let d = e.arc.delta;
                if (majorityPositive && d < 0) d += 2 * Math.PI;
                else if (!majorityPositive && d > 0) d -= 2 * Math.PI;
                const ang = e.arc.startAng + d * t;
                e.x = e.arc.rc.x + e.arc.radius * Math.cos(ang);
                e.y = e.arc.rc.y + e.arc.radius * Math.sin(ang);
                delete e.arc;
            }
        }

        this.lastRenderedStickers = allStickers;

        // Draw sticker circles
        for (const s of allStickers) {
            ctx2.beginPath();
            ctx2.arc(s.x, s.y, config.stickerRadius, 0, Math.PI * 2);
            ctx2.fillStyle = s.color;
            ctx2.fill();
            ctx2.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx2.lineWidth = 1.5;
            ctx2.stroke();
        }
    }

    /** Draw selection highlight on the trefoil. Called separately by PuzzleEngine. */
    drawSelectionHighlight(selected, pieces, config) {
        if (!selected) return;
        const selCubie = this.puzzle.findPieceAt(pieces, selected.m);
        if (!selCubie) return;
        const hit = this.lastRenderedStickers.find(s => s.cubie === selCubie && s.fi === selected.faceIndex);
        if (!hit) return;
        const ctx2 = this.ctx;
        ctx2.beginPath();
        ctx2.arc(hit.x, hit.y, config.stickerRadius + 3, 0, Math.PI * 2);
        ctx2.strokeStyle = '#fff';
        ctx2.lineWidth = 4;
        ctx2.stroke();
        ctx2.beginPath();
        ctx2.arc(hit.x, hit.y, config.stickerRadius + 3, 0, Math.PI * 2);
        ctx2.strokeStyle = '#000';
        ctx2.lineWidth = 2;
        ctx2.stroke();
    }

    getClickTarget(px, py, config) {
        let best = null, bestDist = config.stickerRadius * config.stickerRadius;
        for (const s of this.lastRenderedStickers) {
            const dx = s.x - px, dy = s.y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) { bestDist = d2; best = s; }
        }
        if (best) {
            return { faceIndex: best.fi, faceAxis: best.faceAxis, m: [...best.cubie.m], from: '2d' };
        }
        return null;
    }

    computeArrowDirection(piece, faceIndex, rotAxis, config) {
        const m = piece.m;
        const faceAx = this.faceAxis[faceIndex];
        const [planeA, planeB] = [0, 1, 2].filter(i => i !== rotAxis);
        const newM = [m[0], m[1], m[2]];
        newM[planeA] = -m[planeB];
        newM[planeB] = m[planeA];
        let newFi;
        if (faceAx === planeA) {
            newFi = faceColorIndex(planeB, FACE_INFO[faceIndex].dir);
        } else {
            newFi = faceColorIndex(planeA, -FACE_INFO[faceIndex].dir);
        }
        const startPos = this.stickerTo2D(faceIndex, m, config);
        const endPos = this.stickerTo2D(newFi, newM, config);
        return [endPos.x - startPos.x, endPos.y - startPos.y];
    }
}
