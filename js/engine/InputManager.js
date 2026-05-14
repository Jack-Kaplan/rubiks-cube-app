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
        this.selected = null;
        this.selectedDepth = 1;
        this.dragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragMoved = false;
        this._boundKeyDown = null;
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

        // --- Layer display ---
        this._layerDisplay = document.getElementById('layer-display');
        this._updateLayerDisplay();

        // --- Solver status / move list ---
        this._solverStatus = document.getElementById('solver-status');
        this._solverMoves = document.getElementById('solver-moves');
        this._stepNext = document.getElementById('step-next');
        this._stepPrev = document.getElementById('step-prev');
        this._stepAll = document.getElementById('step-all');
        if (this._stepNext) {
            this._stepNext.addEventListener('click', () => this.engine.playNext());
        }
        if (this._stepPrev) {
            this._stepPrev.addEventListener('click', () => this.engine.playPrev());
        }
        if (this._stepAll) {
            this._stepAll.addEventListener('click', () => this.engine.playAll());
        }
        this.updateStepUI();

        // --- Patterns panel ---
        this._patternSelect = document.getElementById('pattern-select');
        this._paintToggle = document.getElementById('paint-toggle');
        this._patternGo = document.getElementById('pattern-go');
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
                    ? 'Paint mode: click stickers to cycle colors, then press Go.' : '');
            });
        }
        if (this._patternGo) {
            this._patternGo.addEventListener('click', () => this._onPatternGo());
        }

        // --- Keyboard ---
        this._boundKeyDown = (e) => this._onKeyDown(e);
        document.addEventListener('keydown', this._boundKeyDown);

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
                this.engine.paintMode.cycleColorAt(hit);
                return;
            }
            this.selected = hit;
        });

        // --- 2D click selection ---
        if (canvas2d) {
            canvas2d.addEventListener('click', (e) => {
                if (!this.engine.view2d) return;
                const rect = canvas2d.getBoundingClientRect();
                const px = (e.clientX - rect.left) * (canvas2d.width / rect.width);
                const py = (e.clientY - rect.top) * (canvas2d.height / rect.height);
                const hit = this.engine.view2d.getClickTarget(px, py, this.engine.config);
                if (this.engine.paintMode.active) {
                    this.engine.paintMode.cycleColorAt(hit);
                    return;
                }
                this.selected = hit || null;
            });
        }
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
        if (!this._paintToggle) return;
        this._paintToggle.classList.toggle('active', this.engine.paintMode.active);
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
                    this.selectedDepth = 1;
                    this._updateLayerDisplay();
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

    /**
     * Set up the keyboard shortcuts display based on puzzle.baseMoves.
     */
    setupControlsDisplay(puzzle) {
        const container = document.getElementById('puzzle-controls');
        if (!container) return;
        container.innerHTML = '';

        // Face move keys
        const keys = Object.keys(puzzle.baseMoves).map(k => k.toUpperCase());
        const moveSpan = document.createElement('span');
        keys.forEach(k => {
            const kbd = document.createElement('kbd');
            kbd.textContent = k;
            moveSpan.appendChild(kbd);
        });
        moveSpan.append(' Rotate');
        container.appendChild(moveSpan);

        // Standard controls
        const controls = [
            ['Shift', 'Reverse'],
            ['0-9', 'Layer depth'],
            ['Space', 'Scramble'],
            ['S', 'Solve → solved'],
            ['G', 'Solved → here'],
            ['N', 'Next move'],
            ['B', 'Back (undo)'],
            ['Esc', 'Reset'],
            ['+/-', 'Speed'],
        ];
        for (const [key, desc] of controls) {
            const span = document.createElement('span');
            if (key.includes('-') && key.length > 2) {
                // Range like "1-9"
                const parts = key.split('-');
                const kbd1 = document.createElement('kbd');
                kbd1.textContent = parts[0];
                span.appendChild(kbd1);
                span.append('-');
                const kbd2 = document.createElement('kbd');
                kbd2.textContent = parts[1];
                span.appendChild(kbd2);
            } else if (key.includes('/')) {
                // Multiple keys like "+/-"
                const parts = key.split('/');
                parts.forEach((k, i) => {
                    if (i > 0) span.append('/');
                    const kbd = document.createElement('kbd');
                    kbd.textContent = k;
                    span.appendChild(kbd);
                });
            } else {
                const kbd = document.createElement('kbd');
                kbd.textContent = key;
                span.appendChild(kbd);
            }
            span.append(` ${desc}`);
            container.appendChild(span);
        }

        // Click + arrow keys
        const clickSpan = document.createElement('span');
        clickSpan.textContent = 'Click sticker + ';
        for (const arrow of ['\u2190', '\u2192', '\u2191', '\u2193']) {
            const kbd = document.createElement('kbd');
            kbd.textContent = arrow;
            clickSpan.appendChild(kbd);
        }
        container.appendChild(clickSpan);
    }

    _updateLayerDisplay() {
        if (this._layerDisplay) this._layerDisplay.textContent = `Layer: ${this.selectedDepth}`;
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
     * Refresh the step controls + highlight the upcoming move. Called from
     * the engine after queue mutations (playNext, playPrev, playAll, etc.).
     */
    updateStepUI() {
        const eng = this.engine;
        const hasMore = eng.pendingTokens.length > 0;
        const hasPlayed = eng.pendingIndex > 0;
        const hasSequence = eng.allTokens.length > 0;
        if (this._stepNext) this._stepNext.hidden = !hasMore;
        if (this._stepPrev) this._stepPrev.hidden = !hasPlayed;
        if (this._stepAll)  this._stepAll.hidden  = !hasMore;

        if (this._solverMoves) {
            const idx = eng.pendingIndex;
            const spans = this._solverMoves.querySelectorAll('.solver-move');
            spans.forEach((sp, i) => {
                sp.classList.toggle('played', i < idx);
                sp.classList.toggle('next', i === idx && hasMore);
            });
            if (hasMore && idx < spans.length) {
                spans[idx].scrollIntoView({ block: 'nearest', inline: 'center' });
            }
        }

        // Show position while there's an active sequence.
        if (hasSequence && this._solverStatus) {
            const total = eng.allTokens.length;
            const done = eng.pendingIndex;
            if (done < total) {
                this._solverStatus.textContent =
                    `Step ${done + 1}/${total} — next: ${eng.allTokens[done]}`;
            } else {
                this._solverStatus.textContent = `Done (${total} moves)`;
            }
        }
    }

    _updateSpeed(delta) {
        const anim = this.engine.animation;
        anim.setSpeed(Math.max(SPEED_MIN, Math.min(SPEED_MAX, anim.moveDuration + delta)));
        if (this._speedSlider) this._speedSlider.value = speedToSlider(anim.moveDuration);
    }

    _onKeyDown(e) {
        const engine = this.engine;
        const puzzle = engine.puzzle;
        const config = engine.config;

        if (e.key === ' ') { e.preventDefault(); engine.scramble(); return; }
        if (e.key === 'Escape') {
            this.selected = null;
            engine.paintMode.exit();
            this._updatePaintToggleUI();
            engine.reset();
            engine.clearPending();
            this.setSolverStatus('');
            this.clearSolverMoves();
            return;
        }
        if (e.key === 's' || e.key === 'S') { e.preventDefault(); engine.solve(); return; }
        if (e.key === 'g' || e.key === 'G') { e.preventDefault(); engine.goToState(); return; }
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); engine.playNext(); return; }
        if (e.key === 'b' || e.key === 'B') { e.preventDefault(); engine.playPrev(); return; }

        // Arrow keys: rotate selected sticker's layer
        if (this.selected && e.key.startsWith('Arrow')) {
            e.preventDefault();
            let screenDir;
            if (e.key === 'ArrowRight')     screenDir = [1, 0];
            else if (e.key === 'ArrowLeft') screenDir = [-1, 0];
            else if (e.key === 'ArrowDown') screenDir = [0, 1];
            else if (e.key === 'ArrowUp')   screenDir = [0, -1];
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
                // 2D view arrow keys (cube trefoil view)
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
            if (move) engine.animation.queueMove(move);
            return;
        }

        if (e.key === '=' || e.key === '+') { this._updateSpeed(-50); return; }
        if (e.key === '-' || e.key === '_') { this._updateSpeed(50); return; }

        // Number keys 0-9: set layer depth
        const num = parseInt(e.key);
        if (num >= 0 && num <= 9) {
            const N = config.N || 3;
            this.selectedDepth = Math.min(num, N);
            config.selectedDepth = this.selectedDepth;
            this._updateLayerDisplay();
            return;
        }

        // Face moves via puzzle.baseMoves
        const baseKey = e.key.toLowerCase();
        const bm = puzzle.baseMoves[baseKey];
        if (bm) {
            e.preventDefault();
            config.selectedDepth = this.selectedDepth;
            const move = puzzle.resolveMove(bm, e.shiftKey, config);
            engine.animation.queueMove(move);
        }
    }
}
