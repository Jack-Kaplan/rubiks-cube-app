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

        // Step mode: when true, solver/pattern results stay in pendingTokens
        // instead of being dumped into the animation queue, and the user
        // advances one notation token at a time via playNext().
        this.stepMode = false;
        this.pendingTokens = [];      // remaining notation tokens
        this.pendingIndex = 0;         // index of the next token (within original list)
        this.allTokens = [];           // full original token list (for display)
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
        this.input.selectedDepth = 1;
        this.config.selectedDepth = 1;

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
        this.input.setupControlsDisplay(puzzle);

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
            this.input.selectedDepth = 1;
            config.selectedDepth = 1;
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
            this.pendingIndex = 0;
            ui?.renderSolverMoves?.(moves);
            ui?.updateStepUI?.();

            const tookS = Math.round((Date.now() - started) / 1000);
            const verb = goTo ? 'Path' : 'Solved';
            if (this.stepMode) {
                ui?.setSolverStatus?.(`${verb}: ${moves.length} moves (${tookS}s) — press N or Next ▶`);
            } else {
                // Auto-play: drain the pending buffer straight into animation.
                this._flushPending();
                ui?.setSolverStatus?.(`${verb}: ${moves.length} move${moves.length === 1 ? '' : 's'} (${tookS}s)`);
            }
        } catch (e) {
            ui?.setSolverStatus?.(`Solver error: ${e.message || e}`);
        } finally {
            this._solving = false;
        }
    }

    /**
     * Step one notation token from the pending buffer into the animation
     * queue. A token like "U2" expands to two engine moves, played as
     * consecutive quarter-turns — but from the user's perspective it's
     * still one "step". Returns the token that just played, or null if
     * the buffer is empty.
     */
    playNext() {
        if (this.pendingTokens.length === 0) return null;
        const tok = this.pendingTokens.shift();
        for (const m of decodeMove(tok, this.puzzle, this.config)) {
            this.animation.queueMove(m);
        }
        this.pendingIndex++;
        this.input?.updateStepUI?.();
        return tok;
    }

    /** Drain all remaining pending tokens straight into the animation queue. */
    _flushPending() {
        while (this.pendingTokens.length) this.playNext();
    }

    /**
     * Step backward by one notation token: undo the most recently played
     * token by applying its inverse via the animation queue (so the user
     * sees the cube physically rewind). The token is pushed back to the
     * front of the pending buffer so subsequent Next replays it. Returns
     * the token that was undone, or null at the start.
     */
    playPrev() {
        if (this.pendingIndex === 0 || this.allTokens.length === 0) return null;

        // Flush any in-flight forward animation so the cube state reflects
        // everything played up to "now" before we start rewinding.
        if (this.animation.current) {
            this.puzzle.applyRotation(this.pieces, this.animation.current);
        }
        for (const m of this.animation.queue) {
            this.puzzle.applyRotation(this.pieces, m);
        }
        this.animation.clear();

        this.pendingIndex--;
        const tok = this.allTokens[this.pendingIndex];
        // Re-queue it at the front so Next replays the same move.
        this.pendingTokens.unshift(tok);

        // Animate the inverse so the visual matches the index move.
        const invTok = invertNotation(tok);
        if (invTok) {
            for (const m of decodeMove(invTok, this.puzzle, this.config)) {
                this.animation.queueMove(m);
            }
        }
        this.input?.updateStepUI?.();
        return tok;
    }

    /**
     * Toggle step-through mode. When set to false with pending moves
     * remaining, drain them into the animation queue so the cube finishes
     * the sequence.
     */
    setStepMode(active) {
        this.stepMode = !!active;
        if (!this.stepMode && this.pendingTokens.length) this._flushPending();
        this.input?.updateStepUI?.();
    }

    /** Drop any pending tokens and reset step UI. */
    clearPending() {
        this.pendingTokens = [];
        this.allTokens = [];
        this.pendingIndex = 0;
        this.input?.updateStepUI?.();
    }

    /** Main render loop — call once, runs via requestAnimationFrame. */
    _frame(time) {
        const { current: move, progress } = this.animation.update(time, this.puzzle, this.pieces);

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
