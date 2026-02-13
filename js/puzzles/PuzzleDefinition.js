/** Global gap constant: fraction of fill from centroid to vertex (0.999 = 0.1% gap). */
export const PIECE_GAP = 0.999;

/**
 * Base class defining the interface contract for all puzzle types.
 * Extend this class and override the required methods to create a new puzzle.
 *
 * Required overrides (will throw if not implemented):
 *   name, id, colors, faceCount, faceDefs, vertsPerFace,
 *   createPieces, applyRotation, getStickerColor,
 *   baseMoves, resolveMove, generateScramble,
 *   getSpacing, detectWorldFace
 *
 * Optional overrides (have sensible defaults):
 *   innerColor, moveAngle, findPieceAt, isPieceInMove, isFrontFacing,
 *   has2DView, create2DView, defaultConfig, configParams, onConfigChange
 */
export class PuzzleDefinition {

    // ── Identity ──────────────────────────────────────────────

    /** @returns {string} Human-readable name, e.g. "Rubik's Cube" */
    get name() { throw new Error('PuzzleDefinition.name not implemented'); }

    /** @returns {string} URL-safe slug, e.g. "cube" */
    get id() { throw new Error('PuzzleDefinition.id not implemented'); }

    // ── Colors ────────────────────────────────────────────────

    /** @returns {Object<number, string>} Color palette indexed by face ID */
    get colors() { throw new Error('PuzzleDefinition.colors not implemented'); }

    /** @returns {string} Color for internal (non-sticker) faces */
    get innerColor() { return '#222'; }

    // ── Geometry ──────────────────────────────────────────────

    /** @returns {number} Number of faces on the solid (6 for cube, 4 for tetrahedron, etc.) */
    get faceCount() { throw new Error('PuzzleDefinition.faceCount not implemented'); }

    /**
     * Face definitions: each entry has corner indices and orientation info.
     * Cube example: [{ idx: [0,4,5,1], axis: 1, dir: -1 }, ...]
     * @returns {Array<Object>}
     */
    get faceDefs() { throw new Error('PuzzleDefinition.faceDefs not implemented'); }

    /** @returns {number} Vertices per face (4 for quads, 3 for triangles, 5 for pentagons) */
    get vertsPerFace() { throw new Error('PuzzleDefinition.vertsPerFace not implemented'); }

    // ── State Management ─────────────────────────────────────

    /**
     * Create the initial solved puzzle state.
     * @param {Object} config - Puzzle-specific configuration
     * @returns {Array<Object>} Array of piece objects with at minimum: m (position), p (corners), stickers
     */
    createPieces(config) { throw new Error('PuzzleDefinition.createPieces not implemented'); }

    /**
     * Apply a completed rotation to the piece array (mutates in place).
     * @param {Array<Object>} pieces
     * @param {Object} move - Move descriptor (e.g. { axis, layer, dir })
     */
    applyRotation(pieces, move) { throw new Error('PuzzleDefinition.applyRotation not implemented'); }

    /**
     * Determine the sticker color index for a given piece on a given face.
     * @param {Object} piece
     * @param {number} faceIndex
     * @param {Object} config
     * @returns {number|null} Color key (index into this.colors) or null
     */
    getStickerColor(piece, faceIndex, config) { throw new Error('PuzzleDefinition.getStickerColor not implemented'); }

    /**
     * Find a piece at position m. Default works for [x,y,z] coordinate systems.
     * @param {Array<Object>} pieces
     * @param {Array<number>} m
     * @returns {Object|undefined}
     */
    findPieceAt(pieces, m) {
        return pieces.find(c =>
            Math.abs(c.m[0] - m[0]) < 0.01 &&
            Math.abs(c.m[1] - m[1]) < 0.01 &&
            Math.abs(c.m[2] - m[2]) < 0.01
        );
    }

    // ── Moves ────────────────────────────────────────────────

    /**
     * Base move definitions: keyboard key → move descriptor.
     * Cube example: { 'u': { axis: 1, side: -1, dir: -1 }, ... }
     * @returns {Object}
     */
    get baseMoves() { throw new Error('PuzzleDefinition.baseMoves not implemented'); }

    /**
     * Convert a base move + config into a concrete move for the queue.
     * @param {Object} baseMove
     * @param {boolean} reversed - Shift key held
     * @param {Object} config
     * @returns {Object} Move descriptor (e.g. { axis, layer, dir })
     */
    resolveMove(baseMove, reversed, config) { throw new Error('PuzzleDefinition.resolveMove not implemented'); }

    /**
     * Generate a scramble sequence.
     * @param {Object} config
     * @returns {Array<Object>} Array of move descriptors
     */
    generateScramble(config) { throw new Error('PuzzleDefinition.generateScramble not implemented'); }

    // ── Animation ────────────────────────────────────────────

    /** @returns {number} Angle of a single move in radians. Cube: π/2. Pyraminx: 2π/3. */
    get moveAngle() { return Math.PI / 2; }

    /**
     * Check if a piece is affected by a given move (for animation).
     * Default: checks piece.m[move.axis] === move.layer
     * @param {Object} piece
     * @param {Object} move
     * @returns {boolean}
     */
    isPieceInMove(piece, move) {
        return Math.abs(piece.m[move.axis] - move.layer) < 0.01;
    }

    // ── Rendering ────────────────────────────────────────────

    /**
     * Pixel spacing between piece centers for 3D rendering.
     * @param {Object} config
     * @returns {number}
     */
    getSpacing(config) { throw new Error('PuzzleDefinition.getSpacing not implemented'); }

    /**
     * Is a rendered face front-facing? Default: cross product > 0 (convex polygons).
     * @param {Array<Object>} projectedVerts - Array of {x, y}
     * @returns {boolean}
     */
    isFrontFacing(projectedVerts) {
        const fv = projectedVerts;
        const cross = (fv[1].x - fv[0].x) * (fv[2].y - fv[0].y)
                    - (fv[1].y - fv[0].y) * (fv[2].x - fv[0].x);
        return cross > 0;
    }

    /**
     * Detect which world face a sticker belongs to from its vertices.
     * Returns a face color index or -1.
     * @param {Object} piece
     * @param {Array<Array<number>>} faceVerts - Corner positions from piece.p
     * @param {Object} config
     * @returns {number}
     */
    detectWorldFace(piece, faceVerts, config) { throw new Error('PuzzleDefinition.detectWorldFace not implemented'); }

    // ── 2D View (Optional) ───────────────────────────────────

    /** @returns {boolean} Whether this puzzle has a custom 2D projection view */
    get has2DView() { return false; }

    /**
     * Create and return a 2D view renderer.
     * Must return an object with: render(pieces, move, progress, config),
     * getClickTarget(px, py, config), computeArrowDirection(piece, faceIndex, rotAxis, config)
     * @param {HTMLCanvasElement} canvas
     * @returns {Object|null}
     */
    create2DView(canvas) { return null; }

    // ── Configuration ────────────────────────────────────────

    /** @returns {Object} Default configuration (e.g. { N: 3, borderWidth: 2 }) */
    get defaultConfig() { return {}; }

    /**
     * Configurable parameters with UI hints.
     * @returns {Array<Object>} e.g. [{ key: 'N', label: 'Size', type: 'number', min: 1, max: 10, default: 3 }]
     */
    get configParams() { return []; }

    /**
     * Called when config changes. Puzzle can recompute derived values.
     * @param {Object} config
     */
    onConfigChange(config) {}

    // ── Camera ──────────────────────────────────────────────

    /** @returns {{ yaw: number, pitch: number }} Default 3D view angles for this puzzle */
    get defaultViewAngles() { return { yaw: 0.6, pitch: -0.7 }; }

    /**
     * Resolve an arrow-key press into a move for this puzzle.
     * @param {Object} piece - The selected piece
     * @param {number} faceIndex - Which face is selected
     * @param {number[]} screenDir - Arrow direction as [dx, dy] in screen space
     * @param {number} viewYaw
     * @param {number} viewPitch
     * @param {Object} config
     * @returns {Object|null} A move descriptor to queue, or null if not supported
     */
    resolveArrowMove(piece, faceIndex, screenDir, viewYaw, viewPitch, config) { return null; }
}
