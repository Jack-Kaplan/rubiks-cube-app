# Puzzle Visualizer

A modular puzzle visualization engine with synchronized 2D and 3D views. Currently ships with a Rubik's Cube, with an architecture designed for adding new platonic solid puzzles (Pyraminx, Megaminx, Skewb, etc.).

## Features

- **3D Rotating View**: Perspective rendering with mouse-drag rotation
- **2D Trefoil Projection** (Cube): Jagarikin-style corner-centric layout showing all 54 stickers
- **N×N×N Support**: Configurable cube size from 1×1×1 to 10×10×10
- **Smooth Animations**: Cosine-eased move queue at 60 FPS
- **Click-to-Rotate**: Select any sticker and use arrow keys to rotate its layer
- **Plugin Architecture**: Add new puzzle types by extending `PuzzleDefinition`

Based on the viral animation by Japanese artist @jagarikin (Twitter, November 2022).

## Quick Start

ES modules require an HTTP server (`file://` won't work):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Controls

| Action | Trigger |
|--------|---------|
| Scramble | `Space` |
| Reset | `Escape` |
| Rotate face | `U` `D` `L` `R` `F` `B` (clockwise) / `Shift` + key (counter) |
| Select layer depth | `1`-`9` |
| Rotate sticker | Click sticker + arrow keys |
| Adjust speed | `+` / `-` or slider |
| Orbit 3D view | Mouse drag on 3D canvas |

Controls are dynamically generated from each puzzle's move definitions.

## Project Structure

```
rubiks-cube-app/
├── index.html
├── css/styles.css
└── js/
    ├── main.js                         # Entry point + puzzle registry
    ├── engine/
    │   ├── PuzzleEngine.js             # Orchestrator (render loop, wiring)
    │   ├── Renderer3D.js               # 3D projection, painter's algorithm, hit-testing
    │   ├── AnimationQueue.js           # Move queue with cosine easing
    │   ├── InputManager.js             # Keyboard, mouse, dynamic config UI
    │   └── math.js                     # Shared math utilities
    └── puzzles/
        ├── PuzzleDefinition.js         # Base class / interface contract
        └── cube/
            ├── CubeConstants.js        # Colors, face definitions, geometry tables
            ├── CubePuzzle.js           # Rubik's Cube implementation
            └── CubeTrefoilView.js      # 2D trefoil rendering (cube-specific)
```

## Adding a New Puzzle

1. Create a new directory under `js/puzzles/` (e.g., `js/puzzles/pyraminx/`)
2. Create a class extending `PuzzleDefinition` and implement the required methods:
   - **Identity**: `name`, `id`
   - **Geometry**: `faceCount`, `faceDefs`, `vertsPerFace`, `colors`
   - **State**: `createPieces(config)`, `applyRotation(pieces, move)`, `getStickerColor(piece, face, config)`
   - **Moves**: `baseMoves`, `resolveMove(baseMove, reversed, config)`, `generateScramble(config)`
   - **Rendering**: `getSpacing(config)`, `detectWorldFace(piece, verts, config)`, `moveAngle`
   - **Config**: `defaultConfig`, `configParams`
3. Register it in `js/main.js`:
   ```js
   import { PyraminxPuzzle } from './puzzles/pyraminx/PyraminxPuzzle.js';
   const PUZZLES = {
       cube: () => new CubePuzzle(),
       pyraminx: () => new PyraminxPuzzle(),
   };
   ```

The puzzle selector, config UI, and keyboard help all generate automatically from the definition.

## Technical Details

- **Rendering**: HTML5 Canvas 2D API, painter's algorithm with backface culling
- **Animation**: `requestAnimationFrame` with delta-time, cosine ease-in-out
- **Modules**: ES modules (no build step, no dependencies)
- **2D Views**: Optional per-puzzle — only the cube has one (trefoil projection)
