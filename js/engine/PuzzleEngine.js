import { Renderer3D } from './Renderer3D.js';
import { AnimationQueue } from './AnimationQueue.js';
import { InputManager } from './InputManager.js';

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
    }

    /**
     * Load a puzzle definition. Creates pieces, sets up 2D view if available.
     */
    loadPuzzle(puzzle, config) {
        this.puzzle = puzzle;
        this.config = config || { ...puzzle.defaultConfig };
        puzzle.onConfigChange(this.config);
        this.pieces = puzzle.createPieces(this.config);
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
