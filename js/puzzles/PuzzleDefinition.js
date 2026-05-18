export const PIECE_GAP = 0.999;

/**
 * Interface contract for puzzle types. Subclass and override.
 *
 * Required: name, id, colors, faceCount, faceDefs, vertsPerFace,
 *           createPieces, applyRotation, getStickerColor,
 *           baseMoves, resolveMove, generateScramble,
 *           getSpacing, detectWorldFace
 * Optional: innerColor, moveAngle, findPieceAt, isPieceInMove,
 *           isFrontFacing, has2DView, create2DView, defaultConfig,
 *           configParams, onConfigChange, resolveArrowMove
 */
export class PuzzleDefinition {
    get name() { throw new Error('PuzzleDefinition.name not implemented'); }
    get id() { throw new Error('PuzzleDefinition.id not implemented'); }

    get colors() { throw new Error('PuzzleDefinition.colors not implemented'); }
    get innerColor() { return '#222'; }

    get faceCount() { throw new Error('PuzzleDefinition.faceCount not implemented'); }
    get faceDefs() { throw new Error('PuzzleDefinition.faceDefs not implemented'); }
    get vertsPerFace() { throw new Error('PuzzleDefinition.vertsPerFace not implemented'); }

    createPieces(config) { throw new Error('PuzzleDefinition.createPieces not implemented'); }
    applyRotation(pieces, move) { throw new Error('PuzzleDefinition.applyRotation not implemented'); }
    getStickerColor(piece, faceIndex, config) { throw new Error('PuzzleDefinition.getStickerColor not implemented'); }

    findPieceAt(pieces, m) {
        return pieces.find(c =>
            Math.abs(c.m[0] - m[0]) < 0.01 &&
            Math.abs(c.m[1] - m[1]) < 0.01 &&
            Math.abs(c.m[2] - m[2]) < 0.01
        );
    }

    get baseMoves() { throw new Error('PuzzleDefinition.baseMoves not implemented'); }
    resolveMove(baseMove, reversed, config) { throw new Error('PuzzleDefinition.resolveMove not implemented'); }
    generateScramble(config) { throw new Error('PuzzleDefinition.generateScramble not implemented'); }

    get moveAngle() { return Math.PI / 2; }

    isPieceInMove(piece, move) {
        return Math.abs(piece.m[move.axis] - move.layer) < 0.01;
    }

    getSpacing(config) { throw new Error('PuzzleDefinition.getSpacing not implemented'); }

    isFrontFacing(projectedVerts) {
        const fv = projectedVerts;
        const cross = (fv[1].x - fv[0].x) * (fv[2].y - fv[0].y)
                    - (fv[1].y - fv[0].y) * (fv[2].x - fv[0].x);
        return cross > 0;
    }

    detectWorldFace(piece, faceVerts, config) { throw new Error('PuzzleDefinition.detectWorldFace not implemented'); }

    get has2DView() { return false; }
    create2DView(canvas) { return null; }

    get defaultConfig() { return {}; }
    get configParams() { return []; }
    onConfigChange(config) {}

    get defaultViewAngles() { return { yaw: 0.6, pitch: -0.7 }; }

    resolveArrowMove(piece, faceIndex, screenDir, viewYaw, viewPitch, config) { return null; }
}
