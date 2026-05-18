import { Renderer3D } from './Renderer3D.js';
import { AnimationQueue } from './AnimationQueue.js';
import { InputManager } from './InputManager.js';
import { encodeFacelet } from '../solver/FaceletEncoder.js';
import { decodeMove, invertMoveList, invertNotation } from '../solver/MoveDecoder.js';
import { SolverClient } from '../solver/SolverClient.js';
import { SOLVER_URL } from '../config.js';
import { PaintMode } from '../patterns/PaintMode.js';

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

        // Step-tape state: the head advances in lockstep with animation
        // completion so the on-screen counter mirrors what the cube is
        // actually doing.
        this.allTokens = [];
        this.pendingTokens = [];
        this.playedCount = 0;
        this._currentOp = null;       // {type:'forward'|'back', tokenIdx, remainingMoves}
        this._autoPlay = false;
        this._lastCompletedCount = this.animation.completedCount;
    }

    loadPuzzle(puzzle, config) {
        this.puzzle = puzzle;
        this.config = config || { ...puzzle.defaultConfig };
        puzzle.onConfigChange(this.config);
        this.pieces = puzzle.createPieces(this.config);

        const angles = puzzle.defaultViewAngles;
        this.renderer.viewYaw = angles.yaw;
        this.renderer.viewPitch = angles.pitch;
        this.animation.clear();
        this.input.selected = null;

        if (puzzle.has2DView && this.canvas2d) {
            this.view2d = puzzle.create2DView(this.canvas2d);
            this.view2d.updateScaling(this.config);
            this.canvas2d.parentElement.style.display = '';
        } else {
            this.view2d = null;
            if (this.canvas2d) this.canvas2d.parentElement.style.display = 'none';
        }

        this.input.setupConfigUI(puzzle, this.config);

        const titleEl = document.getElementById('puzzle-title');
        if (titleEl) titleEl.textContent = puzzle.name;
    }

    onConfigChange(key) {
        const puzzle = this.puzzle;
        const config = this.config;

        if (key === 'imageMode' && config.imageMode) {
            puzzle._loadFaceImages?.(config.N);
        }

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

    async solve() {
        await this._runSolver({ goTo: false });
    }

    async goToState(targetState) {
        await this._runSolver({ goTo: true, targetState });
    }

    async _runSolver({ goTo, targetState }) {
        if (this._solving) return;
        if (this.config.N < 2) return;

        const ui = this.input;

        // Snap through pending animation so the encoded state matches
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

        // 3×3 kociemba assumes fixed centers, so displaced centers (e.g. after
        // a middle-slice rotation) make it choke. Find a whole-cube rotation
        // that brings centers back to URFDLB and encode in that frame —
        // applying the solver's moves to the original cube then lands in a
        // solved-but-rotated state.
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

    playNext() {
        if (this._currentOp || this.pendingTokens.length === 0) return null;
        const tok = this.pendingTokens.shift();
        const moves = decodeMove(tok, this.puzzle, this.config);
        for (const m of moves) this.animation.queueMove(m);
        this._currentOp = {
            type: 'forward',
            tokenIdx: this.playedCount,
            remainingMoves: Math.max(1, moves.length),
        };
        if (moves.length === 0) {
            this._currentOp.remainingMoves = 0;
            this._finalizeCurrentOp();
        }
        this.input?.updateStepUI?.();
        return tok;
    }

    playAll() {
        this._autoPlay = true;
        this._autoReverse = false;
        if (!this._currentOp && this.pendingTokens.length > 0) this.playNext();
    }

    reverseAll() {
        this._autoReverse = true;
        this._autoPlay = false;
        if (!this._currentOp && this.playedCount > 0) this.playPrev();
    }

    skipToEnd() {
        this._flushInFlightToPieces();
        while (this.pendingTokens.length > 0) {
            const tok = this.pendingTokens.shift();
            for (const m of decodeMove(tok, this.puzzle, this.config)) {
                this.puzzle.applyRotation(this.pieces, m);
            }
            this.playedCount++;
        }
        this._autoPlay = false;
        this._autoReverse = false;
        this._lastCompletedCount = this.animation.completedCount;
        this.input?.updateStepUI?.();
    }

    skipToStart() {
        this._flushInFlightToPieces();
        while (this.playedCount > 0) {
            const idx = this.playedCount - 1;
            const tok = this.allTokens[idx];
            const inv = invertNotation(tok);
            if (inv) {
                for (const m of decodeMove(inv, this.puzzle, this.config)) {
                    this.puzzle.applyRotation(this.pieces, m);
                }
            }
            this.pendingTokens.unshift(tok);
            this.playedCount--;
        }
        this._autoPlay = false;
        this._autoReverse = false;
        this._lastCompletedCount = this.animation.completedCount;
        this.input?.updateStepUI?.();
    }

    _flushInFlightToPieces() {
        if (this.animation.current) {
            this.puzzle.applyRotation(this.pieces, this.animation.current);
        }
        for (const m of this.animation.queue) {
            this.puzzle.applyRotation(this.pieces, m);
        }
        this.animation.clear();
        if (this._currentOp) {
            if (this._currentOp.type === 'forward') this.playedCount = this._currentOp.tokenIdx + 1;
            else this.playedCount = this._currentOp.tokenIdx;
            this._currentOp = null;
        }
    }

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

    _renormalize3x3(pieces) {
        if (this.config.N !== 3) return null;
        const centerIdx = [4, 13, 22, 31, 40, 49];
        const standard = 'URFDLB';

        const clonePieces = (src) => src.map(p => ({
            m: [...p.m],
            p: p.p.map(c => [...c]),
            stickers: p.stickers.map(s => s ? { ...s } : null),
        }));
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

        // 24-element cube rotation group covered (with redundancy) by
        // x/y/z each ∈ {0..3} quarter-turns; first hit wins.
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

    _frame(time) {
        const { current: move, progress } = this.animation.update(time, this.puzzle, this.pieces);
        // Detect completions via the monotonic counter — object identity
        // fails for repeated moves (e.g. 180° turns enqueue the same shape twice).
        const completed = this.animation.completedCount;
        while (this._lastCompletedCount < completed) {
            this._lastCompletedCount++;
            this._onMoveCompleted();
        }

        if (this.view2d) {
            this.view2d.render(this.pieces, move, progress, this.config);
            this.view2d.drawSelectionHighlight(this.input.selected, this.pieces, this.config);
        }

        this.renderer.render(this.puzzle, this.pieces, move, progress, this.config, this.input.selected);

        requestAnimationFrame(t => this._frame(t));
    }

    start() {
        this.input.bind(this.canvas3d, this.canvas2d);
        requestAnimationFrame(t => this._frame(t));
    }
}
