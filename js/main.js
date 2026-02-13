/**
 * Puzzle Visualizer — Entry Point
 * Loads the selected puzzle and starts the engine.
 */
import { PuzzleEngine } from './engine/PuzzleEngine.js';
import { CubePuzzle } from './puzzles/cube/CubePuzzle.js';
import { PyraminxPuzzle } from './puzzles/pyraminx/PyraminxPuzzle.js';
import { MegaminxPuzzle } from './puzzles/megaminx/MegaminxPuzzle.js';

// Registry of available puzzles
const PUZZLES = {
    cube: () => new CubePuzzle(),
    pyraminx: () => new PyraminxPuzzle(),
    megaminx: () => new MegaminxPuzzle(),
};

const canvas3d = document.getElementById('cube');
const canvas2d = document.getElementById('trefoil');
const engine = new PuzzleEngine(canvas3d, canvas2d);

// Load default puzzle
engine.loadPuzzle(PUZZLES.cube());
engine.start();

// Puzzle selector
const selector = document.getElementById('puzzle-select');
if (selector) {
    // Populate options from registry
    for (const [id, factory] of Object.entries(PUZZLES)) {
        const puzzle = factory();
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = puzzle.name;
        selector.appendChild(opt);
    }
    selector.addEventListener('change', () => {
        const factory = PUZZLES[selector.value];
        if (factory) engine.loadPuzzle(factory());
    });
}
