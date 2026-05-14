import { Renderer3D } from './Renderer3D.js';
import { AnimationQueue } from './AnimationQueue.js';
import { InputManager } from './InputManager.js';
import { encodeFacelet } from '../solver/FaceletEncoder.js';
import { decodeMove, invertMoveList, invertNotation } from '../solver/MoveDecoder.js';
import { SolverClient } from '../solver/SolverClient.js';
import { SOLVER_URL } from '../config.js';
import { PaintMode } from '../patterns/PaintMode.js';

/**
 * Core orchestrator. Owns the render loop and wires together
 * the renderer, animation queue, input manager, and puzzle definition.
 */
export class PuzzleEngine {
    constructor(canvas3d, canvas2d) {
        this.canvas3d = canvas3d;
        this.canvas2d = canvas2d;
        this.renderer = new Renderer3D(canvas3d);
        this.animation = new AnimationQueue();
        this.input = new InputManager(this);

        this.puzzle = null;
        this.pieces = [];
        this.config = {};
        this.view2d = null;
        this.solver = new SolverClient(SOLVER_URL);
        this._solving = false;
        this.paintMode = new PaintMode(this);

        // Solver/pattern results land in pendingTokens; the user walks the
        // tape with playNext() / playPrev(), or hands it off to auto-play
        // with playAll(). The "head" moves token-by-token in lockstep with
        // animation completion so the on-screen counter mirrors what the
        // cube is actually doing.
        this.allTokens = [];          // full original token list (for display)
        this.pendingTokens = [];      // tokens not yet queued for animation
        this.playedCount = 0;         // number of tokens fully animated
        this._currentOp = null;       // {type:'forward'|'back', tokenIdx, remainingMoves}
        this._autoPlay = false;
        this._lastCompletedCount = this.animation.completedCount;
    }

    /**
     * Load a puzzle definition. Creates pieces, sets up 2D view if available.
     */
    loadPuzzle(puzzle, config) {
        this.puzzle = puzzle;
        this.config = config || { ...puzzle.defaultConfig };
        puzzle.onConfigChange(this.config);
        this.pieces = puzzle.createPieces(this.config);

        // Set puzzle-specific camera orientation
        const angles = puzzle.defaultViewAngles;
        this.renderer.viewYaw = angles.yaw;
        this.renderer.viewPitch = angles.pitch;
        this.animation.clear();
        this.input.selected = null;

        // 2D view
        if (puzzle.has2DView && this.canvas2d) {
            this.view2d = puzzle.create2DView(this.canvas2d);
            this.view2d.updateScaling(this.config);
            this.canvas2d.parentElement.style.display = '';
        } else {
            this.view2d = null;
            if (this.canvas2d) this.canvas2d.parentElement.style.display = 'none';
        }

        // Set up dynamic UI
        this.input.setupConfigUI(puzzle, this.config);

        // Update page title
        const titleEl = document.getElementById('puzzle-title');
        if (titleEl) titleEl.textContent = puzzle.name;
    }

    /** Called by InputManager when a config parameter changes. */
    onConfigChange(key) {
        const puzzle = this.puzzle;
        const config = this.config;

        // Reload face images if needed
        if (key === 'imageMode' && config.imageMode) {
            puzzle._loadFaceImages?.(config.N);
        }

        // Rebuild pieces for structural changes
        if (key === 'N' || key === 'borderWidth') {
            this.pieces = puzzle.createPieces(config);
            this.animation.clear();
            this.input.selected = null;
            this.paintMode.exit();
            this.clearPending();
            this.input._refreshPatternOptions?.();
            this.input._updatePaintToggleUI?.();
            if (this.view2d) this.view2d.updateScaling(config);
            if (config.imageMode && puzzle._loadFaceImages) {
                puzzle._loadFaceImages(config.N);
            }
        }
    }

    reset() {
        this.animation.clear();
        this.pieces = this.puzzle.createPieces(this.config);
        this.input.selected = null;
    }

    scramble() {
        const moves = this.puzzle.generateScramble(this.config);
        for (const move of moves) this.animation.queueMove(move);
    }

    /**
     * Encode the current cube state, POST to the solver backend, then queue
     * each returned move through the animation queue. Concurrent presses are
     * ignored. UI feedback flows through the InputManager's status/move-list
     * helpers if they're available.
     */
    async solve() {
        await this._runSolver({ goTo: false });
    }

    /**
     * Inverse mode: ask the solver for the move sequence M that would solve
     * the target state, invert it, then queue those inverse moves starting
     * from a freshly-solved cube. The result is a step-by-step path from
     * solved → target state.
     *
     * @param {string} [targetState] Optional URFDLB facelet string. If
     *   omitted, the current cube state is encoded and used as the target.
     */
    async goToState(targetState) {
        await this._runSolver({ goTo: true, targetState });
    }

    async _runSolver({ goTo, targetState }) {
        if (this._solving) return;
        if (this.config.N < 2) return;

        const ui = this.input;

        // Snap through any pending animation so the encoded state matches
        // what the user sees once animation settles.
        if (this.animation.current) {
            this.puzzle.applyRotation(this.pieces, this.animation.current);
        }
        for (const m of this.animation.queue) {
            this.puzzle.applyRotation(this.pieces, m);
        }
        this.animation.clear();

        const encoded = targetState
            ? { ok: true, state: targetState }
            : encodeFacelet(this.pieces, this.puzzle, this.config);
        if (!encoded.ok) {
            ui?.setSolverStatus?.(encoded.reason || 'Cube state is not solvable.');
            return;
        }

        // 3×3: kociemba assumes fixed centers, so a state with displaced
        // centers (e.g., after a middle-slice rotation) makes it choke. But
        // mathematically E ≡ U D' y up to a whole-cube rotation — i.e., the
        // state IS reachable by outer-face turns *in a rotated frame*. So
        // virtually rotate the cube until centers line up with standard
        // URFDLB, encode that, and send THAT to kociemba. The solver's moves
        // applied to the original cube produce a uniform-but-rotated solve.
        let frameNote = '';
        if (this.config.N === 3 && !targetState) {
            const centerIdx = [4, 13, 22, 31, 40, 49];
            const standard = 'URFDLB';
            const offIdx = centerIdx.findIndex((i, k) => encoded.state[i] !== standard[k]);
            if (offIdx >= 0) {
                const renorm = this._renormalize3x3(this.pieces);
                if (!renorm) {
                    ui?.setSolverStatus?.(
                        'This 3×3 state is fundamentally unreachable by the standard solver.'
                    );
                    return;
                }
                encoded.state = renorm;
                frameNote = ' (cube ends solved in a rotated frame)';
            }
        }

        this._solving = true;
        ui?.clearSolverMoves?.();
        ui?.setSolverStatus?.(goTo ? 'Computing path…' : 'Solving…');
        const started = Date.now();
        try {
            const solveMoves = await this.solver.solve(this.config.N, encoded.state, {
                onTick: ({ elapsedMs }) => {
                    const label = goTo ? 'Computing path' : 'Solving';
                    ui?.setSolverStatus?.(`${label}… (${Math.round(elapsedMs / 1000)}s)`);
                },
            });

            // For "go to" mode, reset to solved and play the inverse sequence.
            const moves = goTo ? invertMoveList(solveMoves) : solveMoves;
            if (goTo) {
                this.pieces = this.puzzle.createPieces(this.config);
            }

            this.allTokens = moves;
            this.pendingTokens = [...moves];
            this.playedCount = 0;
            this._currentOp = null;
            this._autoPlay = false;
            ui?.renderSolverMoves?.(moves);
            ui?.updateStepUI?.();

            const tookS = Math.round((Date.now() - started) / 1000);
            const verb = goTo ? 'Path' : 'Solved';
            const n = moves.length;
            if (n === 0) {
                ui?.setSolverStatus?.(`${verb}: already there (${tookS}s)${frameNote}`);
            } else {
                ui?.setSolverStatus?.(
                    `${verb}: ${n} move${n === 1 ? '' : 's'} (${tookS}s)${frameNote} — use Next / Back / Play all.`
                );
            }
        } catch (e) {
            ui?.setSolverStatus?.(`Solver error: ${e.message || e}`);
        } finally {
            this._solving = false;
        }
    }

    /**
     * Queue the next notation token for animation. While an op is in
     * flight the call is a no-op — wait for the cube to finish.
     */
    playNext() {
        if (this._currentOp || this.pendingTokens.length === 0) return null;
        const tok = this.pendingTokens.shift();
        const moves = decodeMove(tok, this.puzzle, this.config);
        for (const m of moves) this.animation.queueMove(m);
        this._currentOp = {
            type: 'forward',
            tokenIdx: this.playedCount,
            // Tokens that decode to zero engine moves (defensive; shouldn't
            // happen from valid solver output) still need a one-frame op so
            // _onMoveCompleted can advance the counter.
            remainingMoves: Math.max(1, moves.length),
        };
        if (moves.length === 0) {
            // Synthesize a one-shot completion next frame.
            this._currentOp.remainingMoves = 0;
            this._finalizeCurrentOp();
        }
        this.input?.updateStepUI?.();
        return tok;
    }

    /**
     * Hand the remainder off to auto-play. The render loop advances one
     * token at a time so the counter and tape highlight stay in sync with
     * what the cube is actually doing.
     */
    playAll() {
        this._autoPlay = true;
        this._autoReverse = false;
        if (!this._currentOp && this.pendingTokens.length > 0) this.playNext();
    }

    /**
     * Mirror of playAll: undo the played tokens one at a time until the
     * head returns to the start of the tape.
     */
    reverseAll() {
        this._autoReverse = true;
        this._autoPlay = false;
        if (!this._currentOp && this.playedCount > 0) this.playPrev();
    }

    /**
     * Undo the most recently completed token by animating its inverse.
     * The token is pushed back to the front of pendingTokens so Next can
     * replay it. Disabled while another op is animating.
     */
    playPrev() {
        if (this._currentOp || this.playedCount === 0) return null;
        const tokenIdx = this.playedCount - 1;
        const tok = this.allTokens[tokenIdx];
        this.pendingTokens.unshift(tok);
        const invTok = invertNotation(tok);
        const invMoves = invTok ? decodeMove(invTok, this.puzzle, this.config) : [];
        for (const m of invMoves) this.animation.queueMove(m);
        this._currentOp = {
            type: 'back',
            tokenIdx,
            remainingMoves: Math.max(1, invMoves.length),
        };
        if (invMoves.length === 0) {
            this._currentOp.remainingMoves = 0;
            this._finalizeCurrentOp();
        }
        this.input?.updateStepUI?.();
        return tok;
    }

    /**
     * For 3×3 only: if the current cube has displaced centers (e.g. from a
     * middle-slice rotation), find a whole-cube rotation that brings the
     * centers back to URFDLB-standard positions and return the encoded
     * facelet string in that rotated frame. The kociemba solver can then
     * accept the state; the solver's outer-face moves applied to the cube
     * land it in a "solved-but-rotated" configuration (each face uniform,
     * overall orientation differs from canonical). Returns null if no
     * orientation works — i.e., the state is genuinely impossible.
     */
    _renormalize3x3(pieces) {
        if (this.config.N !== 3) return null;
        const centerIdx = [4, 13, 22, 31, 40, 49];
        const standard = 'URFDLB';

        const clonePieces = (src) => src.map(p => ({
            m: [...p.m],
            p: p.p.map(c => [...c]),
            stickers: p.stickers.map(s => s ? { ...s } : null),
        }));
        // Whole-cube rotation: same arithmetic as CubePuzzle.applyRotation
        // but applied to every piece (not filtered by layer).
        const wholeRotate = (clone, axis, dir) => {
            const [a, b] = [0, 1, 2].filter(i => i !== axis);
            for (const c of clone) {
                const x = c.m[a], y = c.m[b];
                c.m[a] = -y * dir;
                c.m[b] = x * dir;
                for (const p of c.p) {
                    const px = p[a], py = p[b];
                    p[a] = -py * dir;
                    p[b] = px * dir;
                }
            }
        };

        // The cube rotation group has 24 elements; iterating x,y,z each in
        // {0..3} quarter-turns covers all of them (with redundancy, which
        // is harmless — we stop at the first hit).
        for (let xr = 0; xr < 4; xr++) {
            for (let yr = 0; yr < 4; yr++) {
                for (let zr = 0; zr < 4; zr++) {
                    const clone = clonePieces(pieces);
                    for (let i = 0; i < xr; i++) wholeRotate(clone, 0, 1);
                    for (let i = 0; i < yr; i++) wholeRotate(clone, 1, 1);
                    for (let i = 0; i < zr; i++) wholeRotate(clone, 2, 1);
                    const enc = encodeFacelet(clone, this.puzzle, this.config);
                    if (!enc.ok) continue;
                    let ok = true;
                    for (let k = 0; k < 6; k++) {
                        if (enc.state[centerIdx[k]] !== standard[k]) { ok = false; break; }
                    }
                    if (ok) return enc.state;
                }
            }
        }
        return null;
    }

    /** Drop any pending tokens and reset step state. */
    clearPending() {
        this.pendingTokens = [];
        this.allTokens = [];
        this.playedCount = 0;
        this._currentOp = null;
        this._autoPlay = false;
        this._autoReverse = false;
        this._lastCompletedCount = this.animation.completedCount;
        this.input?.updateStepUI?.();
    }

    /**
     * Called from the render loop when the animation queue's `current`
     * transitions to a different move (or to null). Each transition means
     * the previous move finished — we tally it against the current op
     * and, if all of the op's engine moves are done, advance the head.
     */
    _onMoveCompleted() {
        if (!this._currentOp) return;
        this._currentOp.remainingMoves--;
        if (this._currentOp.remainingMoves > 0) {
            this.input?.updateStepUI?.();
            return;
        }
        this._finalizeCurrentOp();
    }

    _finalizeCurrentOp() {
        const op = this._currentOp;
        this._currentOp = null;
        if (op.type === 'forward') this.playedCount = op.tokenIdx + 1;
        else this.playedCount = op.tokenIdx;
        this.input?.updateStepUI?.();
        if (this._autoPlay && this.pendingTokens.length > 0) {
            this.playNext();
        } else if (this._autoReverse && this.playedCount > 0) {
            this.playPrev();
        } else {
            this._autoPlay = false;
            this._autoReverse = false;
        }
    }

    /** Main render loop — call once, runs via requestAnimationFrame. */
    _frame(time) {
        const { current: move, progress } = this.animation.update(time, this.puzzle, this.pieces);
        // Detect move completions via AnimationQueue's monotonic counter so
        // we don't rely on object identity (the same move object can appear
        // multiple times in the queue — e.g., 180° turns).
        const completed = this.animation.completedCount;
        while (this._lastCompletedCount < completed) {
            this._lastCompletedCount++;
            this._onMoveCompleted();
        }

        // 2D view
        if (this.view2d) {
            this.view2d.render(this.pieces, move, progress, this.config);
            this.view2d.drawSelectionHighlight(this.input.selected, this.pieces, this.config);
        }

        // 3D view
        this.renderer.render(this.puzzle, this.pieces, move, progress, this.config, this.input.selected);

        requestAnimationFrame(t => this._frame(t));
    }

    start() {
        this.input.bind(this.canvas3d, this.canvas2d);
        requestAnimationFrame(t => this._frame(t));
    }
}
