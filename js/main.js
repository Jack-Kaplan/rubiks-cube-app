/**
 * Puzzle Visualizer — Entry Point
 */
import { PuzzleEngine } from './engine/PuzzleEngine.js';
import { CubePuzzle } from './puzzles/cube/CubePuzzle.js';

const canvas3d = document.getElementById('cube');
const canvas2d = document.getElementById('trefoil');
const engine = new PuzzleEngine(canvas3d, canvas2d);

engine.loadPuzzle(new CubePuzzle());
engine.start();
