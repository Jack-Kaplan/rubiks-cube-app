/**
 * Rubik's Cube - Minimal 3D Visualization
 * Single-file implementation: cube state, animation, and 3D rendering.
 * Supports N×N×N cubes with automatic 2D/3D scaling.
 */

// --- Colors ---
const COLORS = {
    0: '#FFE135', // Yellow (Top, Y-)
    1: '#FF3B30', // Red    (Bottom, Y+)
    2: '#32CD32', // Green  (Left, X-)
    3: '#00CFFF', // Cyan   (Right, X+)
    4: '#FF69B4', // Pink   (Front, Z+)
    5: '#0066CC', // Blue   (Back, Z-)
};

const CUBIE_SIZE = 0.49; // half-width of each cubie (< 0.5 leaves gaps)
let moveDuration = 300;
const INNER_COLOR = '#222';

const DEBUG = false;    // set true to enable 3D sticker color logging
const DEBUG_2D = false; // set true to enable 2D trefoil sticker logging
let _logStickers = false;

// --- N×N×N Configuration ---
let N = 3;
let half = (N - 1) / 2;
let spacing = Math.floor(310 / N);
let stickerRadius = Math.max(4, Math.min(16, Math.floor(48 / N)));
let selectedDepth = 1;

// --- 2D Trefoil Configuration ---
// 3-circle Venn diagram: one ring set per rotation axis.
// Each ring set has N concentric rings (one per layer along that axis).
// Each face is in 2 ring sets; stickers sit at circle-circle intersection points.
const TREFOIL = {
    centerDist: 136,           // distance from canvas center to each ring set center
    ringRadii: [],             // computed dynamically based on N
    // Ring set center angles indexed by axis: [X-axis, Y-axis, Z-axis]
    ringSetAngles: [30, 270, 150],
};
// Inner faces (closer to canvas center at intersection points)
const INNER_FACES = new Set([0, 3, 4]); // Yellow, Cyan, Pink
// Face axis lookup: face index → its axis
const FACE_AXIS = [1, 1, 0, 0, 2, 2];

function updateScaling() {
    half = (N - 1) / 2;
    spacing = Math.floor(310 / N);
    stickerRadius = Math.max(4, Math.min(16, Math.floor(48 / N)));
    // Trefoil ring radii: N evenly spaced values centered around 210
    // Spacing shrinks as 90/N so total span grows slowly (60→81 for N=3→10)
    const ringSpacing = 90 / N;
    const minR = 210 - ringSpacing * (N - 1) / 2;
    TREFOIL.ringRadii = Array.from({length: N}, (_, i) => minR + i * ringSpacing);
}
updateScaling();

// --- Cube State ---

function createCube() {
    const cubies = [];
    const S = CUBIE_SIZE;
    for (let xi = 0; xi < N; xi++) {
        for (let yi = 0; yi < N; yi++) {
            for (let zi = 0; zi < N; zi++) {
                // Skip interior cubies (not on any outer face)
                if (xi > 0 && xi < N - 1 && yi > 0 && yi < N - 1 && zi > 0 && zi < N - 1) continue;
                const x = xi - half, y = yi - half, z = zi - half;
                // 8 corners of this cubie box, ordered: [±S, ±S, ±S]
                const corners = [];
                for (let cx = -1; cx <= 1; cx += 2)
                    for (let cy = -1; cy <= 1; cy += 2)
                        for (let cz = -1; cz <= 1; cz += 2)
                            corners.push([x + cx * S, y + cy * S, z + cz * S]);
                cubies.push({ m: [x, y, z], p: corners });
            }
        }
    }
    return cubies;
}

function applyRotation(cubies, axis, layer, dir) {
    const [a, b] = [0, 1, 2].filter(i => i !== axis);
    for (const c of cubies) {
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

// Face info: face index → { axis, dir }
const FACE_INFO = [
    { axis: 1, dir: -1 }, // 0: Yellow (Top, Y-)
    { axis: 1, dir:  1 }, // 1: Red    (Bottom, Y+)
    { axis: 0, dir: -1 }, // 2: Green  (Left, X-)
    { axis: 0, dir:  1 }, // 3: Cyan   (Right, X+)
    { axis: 2, dir:  1 }, // 4: Pink   (Front, Z+)
    { axis: 2, dir: -1 }, // 5: Blue   (Back, Z-)
];

// --- Selection (click-to-rotate) ---
let selected = null; // { cubie, faceIndex, faceAxis }
let lastRenderedFaces = [];   // 3D hit-test buffer
let lastRenderedStickers = []; // 2D hit-test buffer

// Project a world-space direction to screen-space (ignoring perspective)
function worldToScreen(dx, dy, dz) {
    const sx = dx * Math.cos(viewYaw) - dz * Math.sin(viewYaw);
    const z1 = dx * Math.sin(viewYaw) + dz * Math.cos(viewYaw);
    const sy = dy * Math.cos(viewPitch) - z1 * Math.sin(viewPitch);
    return [sx, sy];
}

function pointInQuad(px, py, quad) {
    for (let i = 0; i < 4; i++) {
        const a = quad[i], b = quad[(i + 1) % 4];
        if ((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x) < 0) return false;
    }
    return true;
}

function getStickerColor(cubie, face) {
    const m = cubie.m, p = cubie.p;
    if (face < 0 || face > 5) return null;
    const { axis: faceAxis, dir: faceDir } = FACE_INFO[face];
    if (Math.abs(m[faceAxis] - faceDir * half) > 0.01) return null;

    const extreme = faceDir > 0
        ? Math.max(...p.map(v => v[faceAxis]))
        : Math.min(...p.map(v => v[faceAxis]));
    const faceVerts = [];
    for (let i = 0; i < 8; i++)
        if (Math.abs(p[i][faceAxis] - extreme) < 0.1) faceVerts.push(i);
    if (faceVerts.length !== 4) {
        if (_logStickers) console.warn(`[getStickerColor] faceVerts.length=${faceVerts.length} (expected 4)`, { m: [...m], face, faceAxis, faceDir, extreme });
        return face;
    }

    const vertCoords = _logStickers ? faceVerts.map(i => [...p[i]]) : null;
    if (_logStickers) {
        console.log(`[getStickerColor] m=[${m.map(v=>v.toFixed(1))}] face=${face} faceAxis=${faceAxis} faceDir=${faceDir} extreme=${extreme.toFixed(2)} faceVerts=[${faceVerts}]`);
        console.log(`  vert coords:`, faceVerts.map((idx,j) => `  idx${idx}=(${vertCoords[j].map(c=>c.toFixed(2))})`).join(''));
    }

    const cx = faceVerts.map(i => Math.floor(i / 4));
    if (cx.every(c => c === cx[0])) {
        const result = cx[0] === 1 ? 3 : 2;
        if (_logStickers) console.log(`  cx=[${cx}] all same → return ${result}`);
        return result;
    }
    const cy = faceVerts.map(i => Math.floor((i % 4) / 2));
    if (cy.every(c => c === cy[0])) {
        const result = cy[0] === 1 ? 1 : 0;
        if (_logStickers) console.log(`  cy=[${cy}] all same → return ${result}`);
        return result;
    }
    const cz = faceVerts.map(i => i % 2);
    if (cz.every(c => c === cz[0])) {
        const result = cz[0] === 1 ? 4 : 5;
        if (_logStickers) console.log(`  cz=[${cz}] all same → return ${result}`);
        return result;
    }
    if (_logStickers) console.warn(`[getStickerColor] NO CHECK MATCHED!`, { m: [...m], face, faceVerts });
    return face;
}

// --- Animation ---

// Base moves: lowercase key → { axis, side, dir }
// side = which end of the axis (-1 = negative, +1 = positive)
// dir = rotation direction for standard (non-shifted) move
const BASE_MOVES = {
    'u': { axis: 1, side: -1, dir: -1 },
    'd': { axis: 1, side:  1, dir:  1 },
    'l': { axis: 0, side: -1, dir: -1 },
    'r': { axis: 0, side:  1, dir:  1 },
    'f': { axis: 2, side:  1, dir:  1 },
    'b': { axis: 2, side: -1, dir: -1 },
};

let cubies = createCube();
let queue = [];
let current = null;
let moveStart = 0;

function queueMove(axis, layer, dir) {
    queue.push({ axis, layer, dir });
}

function scramble() {
    let lastAxis = -1;
    const numMoves = N * 7;
    for (let i = 0; i < numMoves; i++) {
        let axis;
        do { axis = Math.floor(Math.random() * 3); } while (axis === lastAxis);
        const layerIdx = Math.floor(Math.random() * N);
        const layer = layerIdx - half;
        queueMove(axis, layer, Math.random() < 0.5 ? 1 : -1);
        lastAxis = axis;
    }
}

function resetCube() {
    queue = [];
    current = null;
    cubies = createCube();
}

function ease(t) {
    return 0.5 - Math.cos(Math.min(t, 1) * Math.PI) / 2;
}

function updateAnimation(time) {
    let progress = 0;
    if (current) {
        progress = (time - moveStart) / moveDuration;
        if (progress >= 1) {
            applyRotation(cubies, current.axis, current.layer, current.dir);
            if (DEBUG) {
                console.group(`=== ROTATION: axis=${current.axis} layer=${current.layer} dir=${current.dir} ===`);
                _logStickers = true;
                const faceNames = ['Y-top', 'Y+bot', 'X-left', 'X+right', 'Z+front', 'Z-back'];
                for (const cubie of cubies) {
                    for (let fi = 0; fi < 6; fi++) {
                        const ci = getStickerColor(cubie, fi);
                        if (ci !== null) {
                            console.log(`  cubie[${cubie.m.map(v=>v.toFixed(1))}] face=${fi}(${faceNames[fi]}) → color=${ci}(${faceNames[ci]})`);
                        }
                    }
                }
                _logStickers = false;
                console.groupEnd();
            }
            if (DEBUG_2D) {
                const faceNames = ['Yellow', 'Red', 'Green', 'Cyan', 'Pink', 'Blue'];
                console.group(`=== 2D TREFOIL after: axis=${current.axis} layer=${current.layer} dir=${current.dir} ===`);
                for (const cubie of cubies) {
                    for (const def of FACE_DEFS) {
                        const facePs = def.idx.map(i => cubie.p[i]);
                        for (let ax = 0; ax < 3; ax++) {
                            const val = facePs[0][ax];
                            if (facePs.every(pt => Math.abs(pt[ax] - val) < 0.01)) {
                                const d = val > cubie.m[ax] ? 1 : -1;
                                if (Math.abs(cubie.m[ax] - d * half) < 0.01) {
                                    const fi = faceColorIndex(ax, d);
                                    const ci = getStickerColor(cubie, fi);
                                    const pos = stickerTo2D(fi, cubie.m);
                                    console.log(`  cubie[${cubie.m.map(v=>v.toFixed(1))}] face=${fi}(${faceNames[fi]}) pos=(${pos.x.toFixed(1)},${pos.y.toFixed(1)}) color=${ci}(${faceNames[ci]})`);
                                }
                                break;
                            }
                        }
                    }
                }
                console.groupEnd();
            }
            current = null;
            progress = 0;
        }
    }
    if (!current && queue.length > 0) {
        current = queue.shift();
        moveStart = time;
        progress = 0;
    }
    return { current, progress: Math.min(progress, 1) };
}

// --- 2D Trefoil Rendering ---

const trefoilCanvas = document.getElementById('trefoil');
const ctx2 = trefoilCanvas.getContext('2d');
const CX2 = trefoilCanvas.width / 2, CY2 = trefoilCanvas.height / 2;

// Compute intersection of two circles; pickInner=true → point closer to canvas center
function circleIntersection(cx1, cy1, r1, cx2, cy2, r2, pickInner) {
    const dx = cx2 - cx1, dy = cy2 - cy1;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) return { x: cx1, y: cy1 }; // degenerate
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const px = cx1 + a * dx / d, py = cy1 + a * dy / d;
    const ox = h * dy / d, oy = h * dx / d;
    const p1 = { x: px + ox, y: py - oy };
    const p2 = { x: px - ox, y: py + oy };
    const d1 = (p1.x - CX2) ** 2 + (p1.y - CY2) ** 2;
    const d2 = (p2.x - CX2) ** 2 + (p2.y - CY2) ** 2;
    return pickInner ? (d1 < d2 ? p1 : p2) : (d1 < d2 ? p2 : p1);
}

// Get ring set center for a given axis
function ringSetCenter(axis) {
    const ang = TREFOIL.ringSetAngles[axis] * Math.PI / 180;
    return {
        x: CX2 + TREFOIL.centerDist * Math.cos(ang),
        y: CY2 + TREFOIL.centerDist * Math.sin(ang)
    };
}

// Convert face index + cubie position → 2D canvas position
function stickerTo2D(faceIndex, cubieM) {
    const faceAxis = FACE_AXIS[faceIndex];
    // The two ring set axes this face belongs to
    const otherAxes = [0, 1, 2].filter(a => a !== faceAxis);
    const [rsA, rsB] = otherAxes;

    // Ring indices from cubie position along each ring set's axis
    const ringA = Math.round(cubieM[rsA] + half); // maps -(N-1)/2..(N-1)/2 → 0..N-1
    const ringB = Math.round(cubieM[rsB] + half);

    const cA = ringSetCenter(rsA);
    const cB = ringSetCenter(rsB);

    return circleIntersection(
        cA.x, cA.y, TREFOIL.ringRadii[ringA],
        cB.x, cB.y, TREFOIL.ringRadii[ringB],
        INNER_FACES.has(faceIndex)
    );
}

function renderTrefoil(move, progress) {
    const W2 = trefoilCanvas.width, H2 = trefoilCanvas.height;
    ctx2.fillStyle = '#fff';
    ctx2.fillRect(0, 0, W2, H2);

    // Guide circles: 3 ring sets × N concentric rings
    ctx2.strokeStyle = '#ddd';
    ctx2.lineWidth = 1;
    for (let axis = 0; axis < 3; axis++) {
        const c = ringSetCenter(axis);
        for (const r of TREFOIL.ringRadii) {
            ctx2.beginPath();
            ctx2.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx2.stroke();
        }
    }

    const t = move ? ease(progress) : 0;
    const allStickers = [];

    // Precompute rotation plane axes if animating
    let planeA, planeB;
    if (move) {
        [planeA, planeB] = [0, 1, 2].filter(i => i !== move.axis);
    }

    // Collect stickers using dynamic face detection
    for (const cubie of cubies) {
        for (const def of FACE_DEFS) {
            const facePs = def.idx.map(i => cubie.p[i]);
            let fi = -1, stickerAxis = -1, stickerDir = 0;
            for (let ax = 0; ax < 3; ax++) {
                const val = facePs[0][ax];
                if (facePs.every(pt => Math.abs(pt[ax] - val) < 0.01)) {
                    const d = val > cubie.m[ax] ? 1 : -1;
                    if (Math.abs(cubie.m[ax] - d * half) < 0.01) {
                        fi = faceColorIndex(ax, d);
                        stickerAxis = ax;
                        stickerDir = d;
                    }
                    break;
                }
            }
            if (fi < 0) continue;

            const ci = getStickerColor(cubie, fi);
            const color = ci !== null ? COLORS[ci] : INNER_COLOR;
            const m = cubie.m;
            const startPos = stickerTo2D(fi, m);

            const entry = { x: startPos.x, y: startPos.y, color, fi, cubie, faceAxis: FACE_AXIS[fi] };

            // Arc animation for cubies in the moving layer
            if (move && Math.abs(m[move.axis] - move.layer) < 0.01) {
                // Simulate post-rotation m[]
                const newM = [m[0], m[1], m[2]];
                newM[planeA] = -m[planeB] * move.dir;
                newM[planeB] = m[planeA] * move.dir;

                // Determine post-rotation face
                let newFi;
                if (stickerAxis === move.axis) {
                    newFi = fi;
                } else if (stickerAxis === planeA) {
                    newFi = faceColorIndex(planeB, stickerDir * move.dir);
                } else {
                    newFi = faceColorIndex(planeA, -stickerDir * move.dir);
                }

                const endPos = stickerTo2D(newFi, newM);

                if (stickerAxis !== move.axis) {
                    // Arc along the move-axis ring — defer position until majority vote
                    const rc = ringSetCenter(move.axis);
                    const ringIdx = Math.round(move.layer + half);
                    const radius = TREFOIL.ringRadii[ringIdx];
                    const startAng = Math.atan2(startPos.y - rc.y, startPos.x - rc.x);
                    const endAng = Math.atan2(endPos.y - rc.y, endPos.x - rc.x);
                    let delta = endAng - startAng;
                    while (delta > Math.PI) delta -= 2 * Math.PI;
                    while (delta < -Math.PI) delta += 2 * Math.PI;
                    entry.arc = { rc, radius, startAng, delta };
                } else {
                    // Face rotating on its own axis — straight-line lerp
                    entry.x = startPos.x + (endPos.x - startPos.x) * t;
                    entry.y = startPos.y + (endPos.y - startPos.y) * t;
                }
            }

            allStickers.push(entry);
        }
    }

    // Majority-vote on arc direction: if most deltas are positive, override
    // any negative ones (and vice versa) so all stickers sweep the same way.
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

    // Store for hit-testing
    lastRenderedStickers = allStickers;

    // Draw sticker circles
    for (const s of allStickers) {
        ctx2.beginPath();
        ctx2.arc(s.x, s.y, stickerRadius, 0, Math.PI * 2);
        ctx2.fillStyle = s.color;
        ctx2.fill();
        ctx2.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx2.lineWidth = 1.5;
        ctx2.stroke();
    }

    // Highlight selected sticker
    if (selected) {
        const hit = allStickers.find(s => s.cubie === selected.cubie && s.fi === selected.faceIndex);
        if (hit) {
            ctx2.beginPath();
            ctx2.arc(hit.x, hit.y, stickerRadius + 3, 0, Math.PI * 2);
            ctx2.strokeStyle = '#fff';
            ctx2.lineWidth = 4;
            ctx2.stroke();
            ctx2.beginPath();
            ctx2.arc(hit.x, hit.y, stickerRadius + 3, 0, Math.PI * 2);
            ctx2.strokeStyle = '#000';
            ctx2.lineWidth = 2;
            ctx2.stroke();
        }
    }
}

// --- 3D Rendering ---

const canvas = document.getElementById('cube');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const CX = W / 2, CY = H / 2;

let viewYaw = 0.6;    // Y-axis rotation (horizontal spin)
let viewPitch = -0.7;  // X-axis tilt (vertical angle)

function project(x, y, z) {
    const x1 = x * Math.cos(viewYaw) - z * Math.sin(viewYaw);
    const z1 = x * Math.sin(viewYaw) + z * Math.cos(viewYaw);
    const y1 = y * Math.cos(viewPitch) - z1 * Math.sin(viewPitch);
    const z2 = y * Math.sin(viewPitch) + z1 * Math.cos(viewPitch);
    const s = 800 / (800 - z2);
    return { x: CX + x1 * s, y: CY + y1 * s, z: z2 };
}

function rotatePoint([x, y, z], axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    if (axis === 0) return [x, y * c - z * s, y * s + z * c];
    if (axis === 1) return [x * c - z * s, y, x * s + z * c];
    return [x * c - y * s, x * s + y * c, z];
}

// 8 corners: 0(-,-,-) 1(-,-,+) 2(-,+,-) 3(-,+,+) 4(+,-,-) 5(+,-,+) 6(+,+,-) 7(+,+,+)
// Winding: outward normals via (v1-v0)x(v2-v0)
const FACE_DEFS = [
    { idx: [0, 4, 5, 1], axis: 1, dir: -1 }, // Y- top
    { idx: [2, 3, 7, 6], axis: 1, dir: 1 },  // Y+ bottom
    { idx: [0, 1, 3, 2], axis: 0, dir: -1 }, // X- left
    { idx: [4, 6, 7, 5], axis: 0, dir: 1 },  // X+ right
    { idx: [1, 5, 7, 3], axis: 2, dir: 1 },  // Z+ front
    { idx: [0, 2, 6, 4], axis: 2, dir: -1 }, // Z- back
];

function faceColorIndex(axis, dir) {
    if (axis === 1) return dir > 0 ? 1 : 0;
    if (axis === 0) return dir > 0 ? 3 : 2;
    return dir > 0 ? 4 : 5;
}

function render(time) {
    const { current: move, progress } = updateAnimation(time);

    // Draw 2D trefoil view
    renderTrefoil(move, progress);

    // Draw 3D cube view
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    const allFaces = [];

    for (const cubie of cubies) {
        let verts = cubie.p.map(p => [p[0] * spacing, p[1] * spacing, p[2] * spacing]);

        // Animate affected cubies
        if (move && Math.abs(cubie.m[move.axis] - move.layer) < 0.01) {
            const angle = ease(progress) * (Math.PI / 2) * move.dir;
            verts = verts.map(v => rotatePoint(v, move.axis, angle));
        }

        const proj = verts.map(v => project(v[0], v[1], v[2]));

        // Render ALL 6 faces of this cubie
        for (const def of FACE_DEFS) {
            const fv = def.idx.map(i => proj[i]);

            // Backface cull
            const cross = (fv[1].x - fv[0].x) * (fv[2].y - fv[0].y)
                        - (fv[1].y - fv[0].y) * (fv[2].x - fv[0].x);
            if (cross <= 0) continue;

            // Determine actual face axis/dir from current corner positions
            // (FACE_DEFS axis/dir are stale after rotations)
            let color = INNER_COLOR;
            let faceIndex = -1;
            const facePs = def.idx.map(i => cubie.p[i]);
            for (let ax = 0; ax < 3; ax++) {
                const v = facePs[0][ax];
                if (facePs.every(pt => Math.abs(pt[ax] - v) < 0.01)) {
                    const d = v > cubie.m[ax] ? 1 : -1;
                    if (Math.abs(cubie.m[ax] - d * half) < 0.01) {
                        faceIndex = faceColorIndex(ax, d);
                        const ci = getStickerColor(cubie, faceIndex);
                        if (ci !== null) color = COLORS[ci];
                    }
                    break;
                }
            }

            allFaces.push({
                verts: fv,
                color,
                depth: (fv[0].z + fv[1].z + fv[2].z + fv[3].z) / 4,
                cubie,
                faceIndex,
            });
        }
    }

    // Painter's algorithm: draw far faces first
    allFaces.sort((a, b) => a.depth - b.depth);
    lastRenderedFaces = allFaces;

    for (const f of allFaces) {
        ctx.beginPath();
        ctx.moveTo(f.verts[0].x, f.verts[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(f.verts[i].x, f.verts[i].y);
        ctx.closePath();
        ctx.fillStyle = f.color;
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Highlight selected face
    if (selected) {
        const hit = allFaces.find(f => f.cubie === selected.cubie && f.faceIndex === selected.faceIndex);
        if (hit) {
            ctx.beginPath();
            ctx.moveTo(hit.verts[0].x, hit.verts[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(hit.verts[i].x, hit.verts[i].y);
            ctx.closePath();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    requestAnimationFrame(render);
}

// --- Input ---

const speedSlider = document.getElementById('speed');
const SPEED_MIN = 50, SPEED_MAX = 1000;
function sliderToSpeed(v) { return SPEED_MIN + SPEED_MAX - v; }
function speedToSlider(d) { return SPEED_MIN + SPEED_MAX - d; }

if (speedSlider) {
    speedSlider.value = speedToSlider(moveDuration);
    speedSlider.addEventListener('input', () => { moveDuration = sliderToSpeed(Number(speedSlider.value)); });
}

function updateSpeed(delta) {
    moveDuration = Math.max(SPEED_MIN, Math.min(SPEED_MAX, moveDuration + delta));
    if (speedSlider) speedSlider.value = speedToSlider(moveDuration);
}

const layerDisplay = document.getElementById('layer-display');
function updateLayerDisplay() {
    if (layerDisplay) layerDisplay.textContent = `Layer: ${selectedDepth}`;
}
updateLayerDisplay();

const sizeInput = document.getElementById('cube-size');
if (sizeInput) {
    sizeInput.value = N;
    sizeInput.addEventListener('change', () => {
        const newN = Math.max(1, Math.min(10, parseInt(sizeInput.value) || 3));
        sizeInput.value = newN;
        N = newN;
        updateScaling();
        selectedDepth = 1;
        selected = null;
        updateLayerDisplay();
        resetCube();
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); scramble(); return; }
    if (e.key === 'Escape') { selected = null; resetCube(); return; }

    // Arrow keys: rotate selected sticker's layer in the visual direction
    if (selected && e.key.startsWith('Arrow')) {
        e.preventDefault();
        let screenDir;
        if (e.key === 'ArrowRight')     screenDir = [1, 0];
        else if (e.key === 'ArrowLeft') screenDir = [-1, 0];
        else if (e.key === 'ArrowDown') screenDir = [0, 1];
        else if (e.key === 'ArrowUp')   screenDir = [0, -1];
        else return;

        const m = selected.cubie.m;
        const fi = selected.faceIndex;
        const faceAxis = selected.faceAxis;
        const tangentAxes = [0, 1, 2].filter(i => i !== faceAxis);

        let bestAxis = tangentAxes[0], bestDir = 1, bestDot = -Infinity;
        for (const rotAxis of tangentAxes) {
            if (selected.from === '3d') {
                // 3D: project world-space rotation velocity to screen
                const [a, b] = [0, 1, 2].filter(i => i !== rotAxis);
                const vel = [0, 0, 0];
                vel[a] = -m[b];
                vel[b] = m[a];
                const [sx, sy] = worldToScreen(vel[0], vel[1], vel[2]);
                const dot = sx * screenDir[0] + sy * screenDir[1];
                if (Math.abs(dot) > bestDot) {
                    bestDot = Math.abs(dot);
                    bestAxis = rotAxis;
                    bestDir = dot > 0 ? 1 : -1;
                }
            } else {
                // 2D: compute trefoil displacement for dir=+1
                const [planeA, planeB] = [0, 1, 2].filter(i => i !== rotAxis);
                const newM = [m[0], m[1], m[2]];
                newM[planeA] = -m[planeB];
                newM[planeB] = m[planeA];
                let newFi;
                if (faceAxis === planeA) {
                    newFi = faceColorIndex(planeB, FACE_INFO[fi].dir);
                } else {
                    newFi = faceColorIndex(planeA, -FACE_INFO[fi].dir);
                }
                const startPos = stickerTo2D(fi, m);
                const endPos = stickerTo2D(newFi, newM);
                const dx = endPos.x - startPos.x, dy = endPos.y - startPos.y;
                const dot = dx * screenDir[0] + dy * screenDir[1];
                if (Math.abs(dot) > bestDot) {
                    bestDot = Math.abs(dot);
                    bestAxis = rotAxis;
                    bestDir = dot > 0 ? 1 : -1;
                }
            }
        }
        queueMove(bestAxis, m[bestAxis], bestDir);
        selected = null;
        return;
    }
    if (e.key === '=' || e.key === '+') { updateSpeed(-50); return; }
    if (e.key === '-' || e.key === '_') { updateSpeed(50); return; }

    // Number keys 1-9: set layer depth
    const num = parseInt(e.key);
    if (num >= 1 && num <= 9) {
        selectedDepth = Math.min(num, N);
        updateLayerDisplay();
        return;
    }

    // Face moves
    const baseKey = e.key.toLowerCase();
    const bm = BASE_MOVES[baseKey];
    if (bm) {
        e.preventDefault();
        const layer = bm.side * (half - (selectedDepth - 1));
        const dir = e.shiftKey ? -bm.dir : bm.dir;
        queueMove(bm.axis, layer, dir);
    }
});

// --- 3D View Mouse Drag ---

let dragging = false;
let dragStartX = 0, dragStartY = 0;
let dragMoved = false;

canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
});

window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    viewYaw -= dx * 0.01;
    viewPitch -= dy * 0.01;
    viewPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, viewPitch));
    dragStartX = e.clientX;
    dragStartY = e.clientY;
});

window.addEventListener('mouseup', () => {
    dragging = false;
});

canvas.addEventListener('click', (e) => {
    if (dragMoved) return;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);
    // Iterate reverse (front-to-back) since sorted far-first
    for (let i = lastRenderedFaces.length - 1; i >= 0; i--) {
        const f = lastRenderedFaces[i];
        if (f.faceIndex < 0) continue; // inner face, not a sticker
        if (pointInQuad(px, py, f.verts)) {
            selected = { cubie: f.cubie, faceIndex: f.faceIndex, faceAxis: FACE_AXIS[f.faceIndex], from: '3d' };
            return;
        }
    }
    selected = null;
});

trefoilCanvas.addEventListener('click', (e) => {
    const rect = trefoilCanvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (trefoilCanvas.width / rect.width);
    const py = (e.clientY - rect.top) * (trefoilCanvas.height / rect.height);
    let best = null, bestDist = stickerRadius * stickerRadius;
    for (const s of lastRenderedStickers) {
        const dx = s.x - px, dy = s.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) { bestDist = d2; best = s; }
    }
    if (best) {
        selected = { cubie: best.cubie, faceIndex: best.fi, faceAxis: best.faceAxis, from: '2d' };
    } else {
        selected = null;
    }
});

// --- Initial state dump ---
if (DEBUG) {
    _logStickers = true;
    console.group('=== INITIAL CUBE STATE ===');
    const faceNamesInit = ['Y-top', 'Y+bot', 'X-left', 'X+right', 'Z+front', 'Z-back'];
    for (const cubie of cubies) {
        const stickers = [];
        for (let fi = 0; fi < 6; fi++) {
            const ci = getStickerColor(cubie, fi);
            if (ci !== null) stickers.push(`face=${fi}(${faceNamesInit[fi]})→color=${ci}(${faceNamesInit[ci]})`);
        }
        if (stickers.length > 0) {
            console.log(`cubie[${cubie.m.map(v=>v.toFixed(1))}]: ${stickers.join(', ')}`);
        }
    }
    console.groupEnd();
    _logStickers = false;
}

requestAnimationFrame(render);
