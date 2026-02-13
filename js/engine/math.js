/**
 * Pure math utilities shared across the puzzle engine.
 * No state, no DOM — just geometry and easing.
 */

/** Rotate a 3D point around a cardinal axis by angle (radians). */
export function rotatePoint([x, y, z], axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    if (axis === 0) return [x, y * c - z * s, y * s + z * c];
    if (axis === 1) return [x * c - z * s, y, x * s + z * c];
    return [x * c - y * s, x * s + y * c, z];
}

/** Project a 3D point to 2D screen coords with perspective. */
export function project(x, y, z, viewYaw, viewPitch, cx, cy) {
    const x1 = x * Math.cos(viewYaw) - z * Math.sin(viewYaw);
    const z1 = x * Math.sin(viewYaw) + z * Math.cos(viewYaw);
    const y1 = y * Math.cos(viewPitch) - z1 * Math.sin(viewPitch);
    const z2 = y * Math.sin(viewPitch) + z1 * Math.cos(viewPitch);
    const s = 800 / (800 - z2);
    return { x: cx + x1 * s, y: cy + y1 * s, z: z2 };
}

/** Project a world-space direction to screen-space (ignoring perspective). */
export function worldToScreen(dx, dy, dz, viewYaw, viewPitch) {
    const sx = dx * Math.cos(viewYaw) - dz * Math.sin(viewYaw);
    const z1 = dx * Math.sin(viewYaw) + dz * Math.cos(viewYaw);
    const sy = dy * Math.cos(viewPitch) - z1 * Math.sin(viewPitch);
    return [sx, sy];
}

/** Check if (px, py) is inside a convex quad (array of 4 {x, y} points). */
export function pointInQuad(px, py, quad) {
    for (let i = 0; i < 4; i++) {
        const a = quad[i], b = quad[(i + 1) % 4];
        if ((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x) < 0) return false;
    }
    return true;
}

/** Cosine ease-in-out: 0→0, 0.5→0.5, 1→1. */
export function ease(t) {
    return 0.5 - Math.cos(Math.min(t, 1) * Math.PI) / 2;
}
