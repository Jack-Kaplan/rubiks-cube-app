/**
 * Paint mode: when active, sticker clicks cycle that sticker's color
 * through the 6 face colors instead of selecting it for arrow-key turns.
 *
 * The mutation target is the piece's stored `stickers[i].faceId`. With
 * the encoder/renderer alignment fix in `CubePuzzle.getStickerColor`,
 * that field is the source of truth for both display (`Renderer3D`) and
 * solver encoding (`encodeFacelet`), so paint changes flow through to
 * `engine.goToState(state)` without any parallel state structure.
 *
 * Entering paint mode resets the cube to solved — painting on a scrambled
 * cube is too confusing to be useful.
 */

export class PaintMode {
    constructor(engine) {
        this.engine = engine;
        this.active = false;
    }

    enter() {
        this.engine.animation.clear();
        this.engine.reset();
        this.active = true;
    }

    exit() {
        this.active = false;
    }

    toggle() {
        if (this.active) this.exit();
        else this.enter();
    }

    /**
     * Called from the InputManager's 3D/2D click handlers when paint mode
     * is active. `hit` has shape `{ faceIndex, faceAxis, m, from }` —
     * the same as the existing select-sticker path.
     */
    cycleColorAt(hit) {
        if (!this.active || !hit) return;
        const piece = this.engine.puzzle.findPieceAt(this.engine.pieces, hit.m);
        const sticker = piece?.stickers?.[hit.faceIndex];
        if (!sticker) return;
        sticker.faceId = (sticker.faceId + 1) % 6;
    }
}
