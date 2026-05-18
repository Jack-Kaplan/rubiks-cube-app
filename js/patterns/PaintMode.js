// Mutates piece.stickers[i].faceId — the source of truth for both
// Renderer3D display and encodeFacelet output, so painted changes flow
// straight through to engine.goToState(state).

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

    applyColorAt(hit, colorId) {
        if (!this.active || !hit) return;
        const piece = this.engine.puzzle.findPieceAt(this.engine.pieces, hit.m);
        const sticker = piece?.stickers?.[hit.faceIndex];
        if (!sticker) return;
        sticker.faceId = colorId;
    }
}
