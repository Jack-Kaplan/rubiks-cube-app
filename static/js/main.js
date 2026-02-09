/**
 * Rubik's Cube - Minimal 3D Visualization
 * Single-file implementation: cube state, animation, and 3D rendering.
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

const SPACING = 52;
const CUBIE_SIZE = 0.45; // half-width of each cubie (< 0.5 leaves gaps)
const MOVE_DURATION = 300;
const INNER_COLOR = '#222';

const DEBUG = false; // set true to enable sticker color logging
let _logStickers = false;

// --- Cube State ---

function createCube() {
    const cubies = [];
    const S = CUBIE_SIZE;
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            for (let z = -1; z <= 1; z++) {
                if (x === 0 && y === 0 && z === 0) continue;
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
        if (Math.round(c.m[axis]) !== layer) continue;
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

function getStickerColor(cubie, face) {
    const m = cubie.m, p = cubie.p;
    let faceAxis, faceDir;
    switch (face) {
        case 0: if (Math.round(m[1]) !== -1) return null; faceAxis = 1; faceDir = -1; break;
        case 1: if (Math.round(m[1]) !== 1)  return null; faceAxis = 1; faceDir = 1;  break;
        case 2: if (Math.round(m[0]) !== -1) return null; faceAxis = 0; faceDir = -1; break;
        case 3: if (Math.round(m[0]) !== 1)  return null; faceAxis = 0; faceDir = 1;  break;
        case 4: if (Math.round(m[2]) !== 1)  return null; faceAxis = 2; faceDir = 1;  break;
        case 5: if (Math.round(m[2]) !== -1) return null; faceAxis = 2; faceDir = -1; break;
        default: return null;
    }
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
        console.log(`[getStickerColor] m=[${m.map(v=>Math.round(v))}] face=${face} faceAxis=${faceAxis} faceDir=${faceDir} extreme=${extreme.toFixed(2)} faceVerts=[${faceVerts}]`);
        console.log(`  vert coords:`, faceVerts.map((idx,j) => `  idx${idx}=(${vertCoords[j].map(c=>c.toFixed(2))})`).join(''));
    }

    const cx = faceVerts.map(i => Math.floor(i / 4));
    if (cx.every(c => c === cx[0])) {
        const result = cx[0] === 1 ? 3 : 2;
        if (_logStickers) console.log(`  cx=[${cx}] all same → return ${result} (${['Y-top','Y+bot','X-left','X+right','Z+front','Z-back'][result]})`);
        return result;
    }
    const cy = faceVerts.map(i => Math.floor((i % 4) / 2));
    if (cy.every(c => c === cy[0])) {
        const result = cy[0] === 1 ? 1 : 0;
        if (_logStickers) console.log(`  cx=[${cx}] not uniform, cy=[${cy}] all same → return ${result} (${['Y-top','Y+bot','X-left','X+right','Z+front','Z-back'][result]})`);
        return result;
    }
    const cz = faceVerts.map(i => i % 2);
    if (cz.every(c => c === cz[0])) {
        const result = cz[0] === 1 ? 4 : 5;
        if (_logStickers) console.log(`  cx=[${cx}] cy=[${cy}] not uniform, cz=[${cz}] all same → return ${result} (${['Y-top','Y+bot','X-left','X+right','Z+front','Z-back'][result]})`);
        return result;
    }
    if (_logStickers) console.warn(`[getStickerColor] NO CHECK MATCHED! cx=[${cx}] cy=[${cy}] cz=[${cz}]`, { m: [...m], face, faceVerts, vertCoords: faceVerts.map(i => [...p[i]]) });
    return face;
}

// --- Animation ---

const MOVES = {
    'u': { axis: 1, layer: -1, dir: -1 },
    'U': { axis: 1, layer: -1, dir: 1 },
    'd': { axis: 1, layer: 1,  dir: 1 },
    'D': { axis: 1, layer: 1,  dir: -1 },
    'l': { axis: 0, layer: -1, dir: -1 },
    'L': { axis: 0, layer: -1, dir: 1 },
    'r': { axis: 0, layer: 1,  dir: 1 },
    'R': { axis: 0, layer: 1,  dir: -1 },
    'f': { axis: 2, layer: 1,  dir: 1 },
    'F': { axis: 2, layer: 1,  dir: -1 },
    'b': { axis: 2, layer: -1, dir: -1 },
    'B': { axis: 2, layer: -1, dir: 1 },
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
    for (let i = 0; i < 15; i++) {
        let axis;
        do { axis = Math.floor(Math.random() * 3); } while (axis === lastAxis);
        queueMove(axis, Math.floor(Math.random() * 3) - 1, Math.random() < 0.5 ? 1 : -1);
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
        progress = (time - moveStart) / MOVE_DURATION;
        if (progress >= 1) {
            applyRotation(cubies, current.axis, current.layer, current.dir);
            if (DEBUG) {
                console.group(`=== ROTATION: axis=${current.axis} layer=${current.layer} dir=${current.dir} ===`);
                _logStickers = true;
                const faceNames = ['Y-top', 'Y+bot', 'X-left', 'X+right', 'Z+front', 'Z-back'];
                for (const cubie of cubies) {
                    const pos = cubie.m.map(Math.round);
                    for (let fi = 0; fi < 6; fi++) {
                        const ci = getStickerColor(cubie, fi);
                        if (ci !== null) {
                            console.log(`  cubie[${pos}] face=${fi}(${faceNames[fi]}) → color=${ci}(${faceNames[ci]})`);
                        }
                    }
                }
                _logStickers = false;
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

// --- 3D Rendering ---

const canvas = document.getElementById('cube');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const CX = W / 2, CY = H / 2;

function project(x, y, z, time) {
    const a = time / 4000;
    const x1 = x * Math.cos(a) - z * Math.sin(a);
    const z1 = x * Math.sin(a) + z * Math.cos(a);
    const tilt = -0.7;
    const y1 = y * Math.cos(tilt) - z1 * Math.sin(tilt);
    const z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
    const s = Math.pow(1.4, z2 / 150);
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
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    const { current: move, progress } = updateAnimation(time);
    const allFaces = [];

    for (const cubie of cubies) {
        let verts = cubie.p.map(p => [p[0] * SPACING, p[1] * SPACING, p[2] * SPACING]);

        // Animate affected cubies
        if (move && Math.round(cubie.m[move.axis]) === move.layer) {
            const angle = ease(progress) * (Math.PI / 2) * move.dir;
            verts = verts.map(v => rotatePoint(v, move.axis, angle));
        }

        const proj = verts.map(v => project(v[0], v[1], v[2], time));

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
            const facePs = def.idx.map(i => cubie.p[i]);
            for (let ax = 0; ax < 3; ax++) {
                const v = facePs[0][ax];
                if (facePs.every(pt => Math.abs(pt[ax] - v) < 0.01)) {
                    const d = v > cubie.m[ax] ? 1 : -1;
                    if (Math.round(cubie.m[ax]) === d) {
                        const fi = faceColorIndex(ax, d);
                        const ci = getStickerColor(cubie, fi);
                        if (ci !== null) color = COLORS[ci];
                    }
                    break;
                }
            }

            allFaces.push({
                verts: fv,
                color,
                depth: (fv[0].z + fv[1].z + fv[2].z + fv[3].z) / 4,
            });
        }
    }

    // Painter's algorithm: draw far faces first
    allFaces.sort((a, b) => a.depth - b.depth);

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

    requestAnimationFrame(render);
}

// --- Input ---

document.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); scramble(); return; }
    if (e.key === 'Escape') { resetCube(); return; }
    const key = e.shiftKey ? e.key.toUpperCase() : e.key.toLowerCase();
    const move = MOVES[key];
    if (move) { e.preventDefault(); queueMove(move.axis, move.layer, move.dir); }
});

canvas.addEventListener('click', scramble);

// --- Initial state dump ---
if (DEBUG) {
    _logStickers = true;
    console.group('=== INITIAL CUBE STATE ===');
    const faceNamesInit = ['Y-top', 'Y+bot', 'X-left', 'X+right', 'Z+front', 'Z-back'];
    for (const cubie of cubies) {
        const pos = cubie.m.map(Math.round);
        const stickers = [];
        for (let fi = 0; fi < 6; fi++) {
            const ci = getStickerColor(cubie, fi);
            if (ci !== null) stickers.push(`face=${fi}(${faceNamesInit[fi]})→color=${ci}(${faceNamesInit[ci]})`);
        }
        if (stickers.length > 0) {
            console.log(`cubie[${pos}]: ${stickers.join(', ')}`);
        }
    }
    console.groupEnd();
    _logStickers = false;
}

requestAnimationFrame(render);
