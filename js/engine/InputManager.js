import { worldToScreen } from './math.js';

const SPEED_MIN = 50, SPEED_MAX = 1000;
function sliderToSpeed(v) { return SPEED_MIN + SPEED_MAX - v; }
function speedToSlider(d) { return SPEED_MIN + SPEED_MAX - d; }

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
                this.selected = hit || null;
            });
        }
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
                    puzzle.onConfigChange(config);
                    this.engine.onConfigChange(param.key);
                });
                label.appendChild(input);
                label.append(` ${param.label}`);
            } else {
                label.textContent = `${param.label}: `;
                input = document.createElement('input');
                input.type = param.type || 'number';
                input.min = param.min;
                input.max = param.max;
                input.value = config[param.key] || param.default;
                input.style.cssText = 'width:3em;text-align:center;';
                input.addEventListener('change', () => {
                    const max = param.key === 'borderWidth' ? Math.ceil(config.N / 2) : param.max;
                    config[param.key] = Math.max(param.min, Math.min(max, parseInt(input.value) || param.default));
                    input.value = config[param.key];
                    puzzle.onConfigChange(config);
                    this.selected = null;
                    this.selectedDepth = 1;
                    this._updateLayerDisplay();
                    this.engine.onConfigChange(param.key);
                });
                label.appendChild(input);
            }
            this['_input_' + param.key] = input;
            container.appendChild(label);
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
            ['1-9', 'Layer depth'],
            ['Space', 'Scramble'],
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
        if (e.key === 'Escape') { this.selected = null; engine.reset(); return; }

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
            const m = selPiece.m;
            const fi = this.selected.faceIndex;
            const faceAxis = this.selected.faceAxis;
            const tangentAxes = [0, 1, 2].filter(i => i !== faceAxis);

            let bestAxis = tangentAxes[0], bestDir = 1, bestDot = -Infinity;
            for (const rotAxis of tangentAxes) {
                if (this.selected.from === '3d') {
                    const [a, b] = [0, 1, 2].filter(i => i !== rotAxis);
                    const vel = [0, 0, 0];
                    vel[a] = -m[b];
                    vel[b] = m[a];
                    const [sx, sy] = worldToScreen(vel[0], vel[1], vel[2], engine.renderer.viewYaw, engine.renderer.viewPitch);
                    const dot = sx * screenDir[0] + sy * screenDir[1];
                    if (Math.abs(dot) > bestDot) {
                        bestDot = Math.abs(dot);
                        bestAxis = rotAxis;
                        bestDir = dot > 0 ? 1 : -1;
                    }
                } else if (engine.view2d) {
                    const disp = engine.view2d.computeArrowDirection(selPiece, fi, rotAxis, config);
                    const dot = disp[0] * screenDir[0] + disp[1] * screenDir[1];
                    if (Math.abs(dot) > bestDot) {
                        bestDot = Math.abs(dot);
                        bestAxis = rotAxis;
                        bestDir = dot > 0 ? 1 : -1;
                    }
                }
            }
            engine.animation.queueMove({ axis: bestAxis, layer: m[bestAxis], dir: bestDir });
            return;
        }

        if (e.key === '=' || e.key === '+') { this._updateSpeed(-50); return; }
        if (e.key === '-' || e.key === '_') { this._updateSpeed(50); return; }

        // Number keys 1-9: set layer depth
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
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
