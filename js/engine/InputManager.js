import { PATTERNS, getPattern } from '../patterns/PatternRegistry.js';
import { encodeFacelet } from '../solver/FaceletEncoder.js';

const SPEED_MIN = 50, SPEED_MAX = 1000;
function sliderToSpeed(v) { return SPEED_MIN + SPEED_MAX - v; }
function speedToSlider(d) { return SPEED_MIN + SPEED_MAX - d; }
function resolveMax(param, config) {
    return typeof param.max === 'function' ? param.max(config) : param.max;
}

/**
 * Generic input manager. Handles keyboard, mouse drag, click selection,
 * and dynamically generated config UI. Delegates puzzle-specific move
 * resolution to the PuzzleDefinition interface.
 */
export class InputManager {
    constructor(engine) {
        this.engine = engine;
        this.selected = null;  // kept for Renderer3D compatibility; never set
        this.dragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragMoved = false;
    }

    bind(canvas3d, canvas2d) {
        // --- Speed slider ---
        const speedSlider = document.getElementById('speed');
        if (speedSlider) {
            speedSlider.value = speedToSlider(this.engine.animation.moveDuration);
            speedSlider.addEventListener('input', () => {
                this.engine.animation.setSpeed(sliderToSpeed(Number(speedSlider.value)));
            });
        }
        this._speedSlider = speedSlider;

        // --- Solver status / move list ---
        this._solverStatus = document.getElementById('solver-status');
        this._solverMoves = document.getElementById('solver-moves');
        this._scrambleBtn = document.getElementById('scramble-btn');
        this._resetBtn    = document.getElementById('reset-btn');
        this._solveBtn    = document.getElementById('solve-btn');
        this._gotoBtn     = document.getElementById('goto-btn');
        this._stepPrev    = document.getElementById('step-prev');
        this._stepRevAll  = document.getElementById('step-rev-all');
        this._stepNext    = document.getElementById('step-next');
        this._stepAll     = document.getElementById('step-all');
        if (this._scrambleBtn) this._scrambleBtn.addEventListener('click', () => this.engine.scramble());
        if (this._resetBtn)    this._resetBtn.addEventListener('click', () => this._onReset());
        if (this._solveBtn)    this._solveBtn.addEventListener('click', () => this.engine.solve());
        if (this._gotoBtn)     this._gotoBtn.addEventListener('click', () => this.engine.goToState());
        if (this._stepPrev)    this._stepPrev.addEventListener('click', () => this.engine.playPrev());
        if (this._stepRevAll)  this._stepRevAll.addEventListener('click', () => this.engine.reverseAll());
        if (this._stepNext)    this._stepNext.addEventListener('click', () => this.engine.playNext());
        if (this._stepAll)     this._stepAll.addEventListener('click', () => this.engine.playAll());
        this.updateStepUI();

        // --- Patterns panel ---
        this._patternSelect = document.getElementById('pattern-select');
        this._paintToggle = document.getElementById('paint-toggle');
        this._patternGo = document.getElementById('pattern-go');
        this._paintPalette = document.getElementById('paint-palette');
        this._paintColorId = 0;
        this._buildPaintPalette();
        this._refreshPatternOptions();
        if (this._patternSelect) {
            this._patternSelect.addEventListener('change', () => {
                // Exit paint mode if a preset is picked — they're mutually exclusive.
                if (this.engine.paintMode.active && this._patternSelect.value) {
                    this.engine.paintMode.exit();
                    this._updatePaintToggleUI();
                }
            });
        }
        if (this._paintToggle) {
            this._paintToggle.addEventListener('click', () => {
                if (!this.engine.paintMode.active && this._patternSelect) {
                    this._patternSelect.value = '';
                }
                this.engine.paintMode.toggle();
                this._updatePaintToggleUI();
                this.setSolverStatus(this.engine.paintMode.active
                    ? 'Paint mode: pick a color, click stickers to paint, then press Go.' : '');
            });
        }
        if (this._patternGo) {
            this._patternGo.addEventListener('click', () => this._onPatternGo());
        }

        // --- 3D mouse drag ---
        canvas3d.addEventListener('mousedown', (e) => {
            this.dragging = true;
            this.dragMoved = false;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.dragging) return;
            const dx = e.clientX - this.dragStartX;
            const dy = e.clientY - this.dragStartY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.dragMoved = true;
            this.engine.renderer.viewYaw -= dx * 0.01;
            this.engine.renderer.viewPitch -= dy * 0.01;
            this.engine.renderer.viewPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.engine.renderer.viewPitch));
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
        });

        window.addEventListener('mouseup', () => { this.dragging = false; });

        // --- 3D click selection ---
        canvas3d.addEventListener('click', (e) => {
            if (this.dragMoved) return;
            const rect = canvas3d.getBoundingClientRect();
            const px = (e.clientX - rect.left) * (canvas3d.width / rect.width);
            const py = (e.clientY - rect.top) * (canvas3d.height / rect.height);
            const puzzle = this.engine.puzzle;
            const faceAxisLookup = puzzle.constructor.FACE_AXIS || null;
            const hit = this.engine.renderer.hitTest(px, py, faceAxisLookup);
            if (this.engine.paintMode.active) {
                this.engine.paintMode.applyColorAt(hit, this._paintColorId);
                return;
            }
            this.selected = hit;
        });

        // --- 2D click selection (paint mode + sticker selection for arrows) ---
        if (canvas2d) {
            canvas2d.addEventListener('click', (e) => {
                if (!this.engine.view2d) return;
                const rect = canvas2d.getBoundingClientRect();
                const px = (e.clientX - rect.left) * (canvas2d.width / rect.width);
                const py = (e.clientY - rect.top) * (canvas2d.height / rect.height);
                const hit = this.engine.view2d.getClickTarget(px, py, this.engine.config);
                if (this.engine.paintMode.active) {
                    this.engine.paintMode.applyColorAt(hit, this._paintColorId);
                    return;
                }
                this.selected = hit || null;
            });
        }

        // --- Arrow-key rotation of the selected sticker's layer ---
        // The only keyboard handler we keep: a sticker has to be clicked
        // first (mouse-driven), so this is a hybrid interaction, not a
        // standalone shortcut.
        document.addEventListener('keydown', (e) => this._onArrowKey(e));
    }

    _onArrowKey(e) {
        if (!this.selected || !e.key.startsWith('Arrow')) return;
        e.preventDefault();
        const engine = this.engine;
        const puzzle = engine.puzzle;
        const config = engine.config;
        let screenDir;
        if      (e.key === 'ArrowRight') screenDir = [1, 0];
        else if (e.key === 'ArrowLeft')  screenDir = [-1, 0];
        else if (e.key === 'ArrowDown')  screenDir = [0, 1];
        else if (e.key === 'ArrowUp')    screenDir = [0, -1];
        else return;

        const selPiece = puzzle.findPieceAt(engine.pieces, this.selected.m);
        if (!selPiece) return;

        let move;
        if (this.selected.from === '3d') {
            move = puzzle.resolveArrowMove(
                selPiece, this.selected.faceIndex, screenDir,
                engine.renderer.viewYaw, engine.renderer.viewPitch, config
            );
        } else if (engine.view2d) {
            const fi = this.selected.faceIndex;
            const faceAxis = this.selected.faceAxis;
            const tangentAxes = [0, 1, 2].filter(i => i !== faceAxis);
            let bestAxis = tangentAxes[0], bestDir = 1, bestDot = -Infinity;
            for (const rotAxis of tangentAxes) {
                const disp = engine.view2d.computeArrowDirection(selPiece, fi, rotAxis, config);
                const dot = disp[0] * screenDir[0] + disp[1] * screenDir[1];
                if (Math.abs(dot) > bestDot) {
                    bestDot = Math.abs(dot);
                    bestAxis = rotAxis;
                    bestDir = dot > 0 ? 1 : -1;
                }
            }
            move = { axis: bestAxis, layer: selPiece.m[bestAxis], dir: bestDir };
        }
        if (!move) return;
        // On 3×3 the centers are fixed by the solver's convention — reject
        // middle-slice rotations (layer=0) at the source so the user can't
        // arrow-key the cube into an unsolvable state.
        if (engine.config.N === 3 && Math.abs(move.layer) < 0.01) {
            this.setSolverStatus(
                'On a 3×3 the middle slice is locked — solver assumes fixed centers. Click an edge or corner sticker instead.'
            );
            return;
        }
        engine.animation.queueMove(move);
    }

    _onReset() {
        const engine = this.engine;
        engine.paintMode.exit();
        this._updatePaintToggleUI();
        engine.reset();
        engine.clearPending();
        this.setSolverStatus('');
        this.clearSolverMoves();
    }

    _refreshPatternOptions() {
        const sel = this._patternSelect;
        if (!sel) return;
        const N = this.engine.config?.N;
        const previous = sel.value;
        sel.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '— pick —';
        sel.appendChild(placeholder);
        for (const p of PATTERNS) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.label;
            if (typeof N === 'number' && !p.supportsN(N)) {
                opt.disabled = true;
                opt.textContent += ` (N≠${N})`;
            }
            sel.appendChild(opt);
        }
        // Preserve previous selection if still valid.
        if (previous && [...sel.options].some(o => o.value === previous && !o.disabled)) {
            sel.value = previous;
        }
    }

    _updatePaintToggleUI() {
        if (this._paintToggle) {
            this._paintToggle.classList.toggle('active', this.engine.paintMode.active);
        }
        if (this._paintPalette) {
            this._paintPalette.hidden = !this.engine.paintMode.active;
        }
    }

    _buildPaintPalette() {
        if (!this._paintPalette) return;
        const colors = this.engine.puzzle?.colors;
        if (!colors) return;
        // Clear any prior swatches (keep the static label).
        this._paintPalette.querySelectorAll('.paint-swatch').forEach(el => el.remove());
        for (let i = 0; i < 6; i++) {
            const sw = document.createElement('button');
            sw.type = 'button';
            sw.className = 'paint-swatch';
            sw.dataset.colorId = String(i);
            sw.style.background = colors[i];
            sw.title = `Color ${i}`;
            sw.addEventListener('click', () => {
                this._paintColorId = i;
                this._highlightActiveSwatch();
            });
            this._paintPalette.appendChild(sw);
        }
        this._highlightActiveSwatch();
    }

    _highlightActiveSwatch() {
        if (!this._paintPalette) return;
        this._paintPalette.querySelectorAll('.paint-swatch').forEach(el => {
            el.classList.toggle('active', Number(el.dataset.colorId) === this._paintColorId);
        });
    }

    async _onPatternGo() {
        const engine = this.engine;
        let target = null;
        if (engine.paintMode.active) {
            // Encode the painted cube state directly. getStickerColor honors
            // stickers[i].faceId, so paint changes flow through.
            const enc = encodeFacelet(engine.pieces, engine.puzzle, engine.config);
            if (!enc.ok) {
                this.setSolverStatus(enc.reason || 'Painted cube has missing pieces.');
                return;
            }
            target = enc.state;
            engine.paintMode.exit();
            this._updatePaintToggleUI();
        } else {
            const id = this._patternSelect?.value;
            if (!id) {
                this.setSolverStatus('Pick a pattern or click Paint first.');
                return;
            }
            const pat = getPattern(id);
            if (!pat) return;
            if (!pat.supportsN(engine.config.N)) {
                this.setSolverStatus(`${pat.label} is not reachable on N=${engine.config.N}.`);
                return;
            }
            target = pat.target(engine.config.N);
            if (!target) {
                this.setSolverStatus(`${pat.label} could not generate a target for N=${engine.config.N}.`);
                return;
            }
        }
        await engine.goToState(target);
    }

    /**
     * Set up puzzle-specific config UI based on puzzle.configParams.
     * Populates the #puzzle-config container in the DOM.
     */
    setupConfigUI(puzzle, config) {
        const container = document.getElementById('puzzle-config');
        if (!container) return;
        container.innerHTML = '';

        for (const param of puzzle.configParams) {
            const label = document.createElement('label');
            let input;
            if (param.type === 'checkbox') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = config[param.key] || false;
                input.addEventListener('change', () => {
                    config[param.key] = input.checked;
                    puzzle.onConfigChange(config, param.key);
                    this.engine.onConfigChange(param.key);
                    this._syncInputs(puzzle, config);
                });
                label.appendChild(input);
                label.append(` ${param.label}`);
            } else {
                label.textContent = `${param.label}: `;
                input = document.createElement('input');
                input.type = param.type || 'number';
                input.min = param.min;
                input.max = resolveMax(param, config);
                input.value = config[param.key] || param.default;
                input.style.cssText = 'width:3em;text-align:center;';
                input.addEventListener('change', () => {
                    const max = resolveMax(param, config);
                    config[param.key] = Math.max(param.min, Math.min(max, parseInt(input.value) || param.default));
                    puzzle.onConfigChange(config, param.key);
                    this.selected = null;
                    this.engine.onConfigChange(param.key);
                    this._syncInputs(puzzle, config);
                });
                label.appendChild(input);
            }
            this['_input_' + param.key] = input;
            container.appendChild(label);
        }
    }

    _syncInputs(puzzle, config) {
        for (const param of puzzle.configParams) {
            const input = this['_input_' + param.key];
            if (!input) continue;
            if (param.type === 'checkbox') {
                input.checked = !!config[param.key];
            } else {
                input.max = resolveMax(param, config);
                input.value = config[param.key];
            }
        }
    }

    setSolverStatus(text) {
        if (this._solverStatus) this._solverStatus.textContent = text || '';
    }

    clearSolverMoves() {
        if (this._solverMoves) this._solverMoves.innerHTML = '';
    }

    renderSolverMoves(moves) {
        if (!this._solverMoves) return;
        this._solverMoves.innerHTML = '';
        for (let i = 0; i < moves.length; i++) {
            const span = document.createElement('span');
            span.className = 'solver-move';
            span.textContent = moves[i];
            span.dataset.index = String(i);
            this._solverMoves.appendChild(span);
        }
        this.updateStepUI();
    }

    /**
     * Refresh the step controls + tape highlight. The "head" position
     * mirrors what the cube is actually doing: during a forward op it's
     * the token being played; during a back op it's the token being
     * undone; while idle it's the next-up token. Called from the engine
     * after every animation move-boundary transition, so the counter
     * advances live with playback.
     */
    updateStepUI() {
        const eng = this.engine;
        const op = eng._currentOp;
        const headPos = op ? op.tokenIdx : eng.playedCount;
        const total = eng.allTokens.length;
        const hasSequence = total > 0;
        const idle = !op;
        const moreAhead = eng.pendingTokens.length > 0;
        const canBack = eng.playedCount > 0;

        // Step controls stay visible in place; disabled during animation
        // or when there's nothing to act on. Solve/Go are also disabled
        // mid-animation so the user can't queue a new sequence on top.
        const showStepRow = hasSequence;
        if (this._stepNext) {
            this._stepNext.hidden = !showStepRow;
            this._stepNext.disabled = !(idle && moreAhead);
        }
        if (this._stepPrev) {
            this._stepPrev.hidden = !showStepRow;
            this._stepPrev.disabled = !(idle && canBack);
        }
        if (this._stepAll) {
            this._stepAll.hidden = !showStepRow;
            this._stepAll.disabled = !(idle && moreAhead);
        }
        if (this._stepRevAll) {
            this._stepRevAll.hidden = !showStepRow;
            this._stepRevAll.disabled = !(idle && canBack);
        }
        // Animation-aware enable: Scramble/Reset/Solve/Path lock while
        // anything is in flight (step ops or a scramble draining through
        // the animation queue).
        const animating = !!eng.animation.current || eng.animation.queue.length > 0;
        const busy = !idle || animating || eng._solving;
        if (this._scrambleBtn) this._scrambleBtn.disabled = busy;
        if (this._resetBtn)    this._resetBtn.disabled    = !!eng._solving;
        if (this._solveBtn)    this._solveBtn.disabled    = busy;
        if (this._gotoBtn)     this._gotoBtn.disabled     = busy;

        if (this._solverMoves) {
            const spans = this._solverMoves.querySelectorAll('.solver-move');
            spans.forEach((sp, i) => {
                sp.classList.toggle('played', i < headPos);
                sp.classList.toggle('playing', i === headPos && !!op);
                sp.classList.toggle('next', i === headPos && idle && i < total);
            });
            // Slide the tape so the head sits at the viewport's center
            // marker — head stays fixed, tape translates past it.
            const viewport = this._solverMoves.parentElement;
            if (viewport && hasSequence && headPos < spans.length) {
                const head = spans[headPos];
                const tx = viewport.clientWidth / 2 - (head.offsetLeft + head.offsetWidth / 2);
                this._solverMoves.style.transform = `translateX(${tx}px)`;
            } else if (viewport) {
                this._solverMoves.style.transform = 'translateX(0)';
            }
        }

        if (hasSequence && this._solverStatus) {
            if (idle && eng.playedCount === total) {
                this._solverStatus.textContent = `Done (${total} moves)`;
            } else if (op) {
                const verb = op.type === 'back' ? 'Undoing' : 'Playing';
                this._solverStatus.textContent =
                    `${headPos + 1}/${total} — ${verb} ${eng.allTokens[op.tokenIdx]}`;
            } else {
                this._solverStatus.textContent =
                    `${headPos + 1}/${total} — next: ${eng.allTokens[headPos]}`;
            }
        }
    }

}
