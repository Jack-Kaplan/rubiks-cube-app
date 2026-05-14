# Puzzle Visualizer

A Rubik's Cube visualization engine with synchronized 2D and 3D views.

## Features

- **3D Rotating View**: Perspective rendering with mouse-drag rotation
- **2D Trefoil Projection**: Jagarikin-style corner-centric layout showing all 54 stickers
- **N×N×N Support**: Configurable cube size from 1×1×1 to 11×11×11
- **Smooth Animations**: Cosine-eased move queue at 60 FPS
- **Click-to-Rotate**: Select any sticker and use arrow keys to rotate its layer
- **Plugin Architecture**: Add new puzzle types by extending `PuzzleDefinition`

Based on the viral animation by Japanese artist @jagarikin (Twitter, November 2022).

## Quick Start

The app ships as a single Docker image that serves both the frontend and
the solver API on one port.

```bash
docker build -t cube-solver .
docker run -p 8000:8000 cube-solver
```

Then open http://localhost:8000.

For frontend-only development without the solver, any static file server
will do (`python3 -m http.server 8000`); the `S` / `G` keys will fail
gracefully with "Solver error" until a backend is reachable.

## Controls

| Action | Trigger |
|--------|---------|
| Scramble | `Space` |
| Solve (current → solved) | `S` (requires solver backend — see below) |
| Go-to (solved → current) | `G` (resets to solved, then plays inverse-solve to reach the current state) |
| Step / Next / Back | `Step` button + `N` next, `B` back — walk through a solve / pattern one move at a time |
| Reset | `Escape` |
| Rotate face | `U` `D` `L` `R` `F` `B` (clockwise) / `Shift` + key (counter) |
| Select layer depth | `1`-`9` |
| Rotate sticker | Click sticker + arrow keys |
| Adjust speed | `+` / `-` or slider |
| Orbit 3D view | Mouse drag on 3D canvas |

Controls are dynamically generated from each puzzle's move definitions.

## Solver

`S` ("solve") posts the current state to the solver and animates it back
to solved. `G` ("go to") asks the solver for the same move sequence, then
plays its **inverse** starting from a freshly-solved cube — so it acts
out a path *from* solved *to* the current state.

Under the hood: `kociemba` is used for 3×3 and `dwalton76/rubiks-cube-NxNxN-solver`
for other sizes. The single Docker image serves both the frontend and the
solver API on one port; see [Quick Start](#quick-start). Solves are async
with polling — large cubes (N≥8) can take a minute or more.

## Patterns

Pick a target pattern from the dropdown and click **Go**, and the cube
will animate from solved to that pattern. Built-in presets:

| Pattern | Sizes |
|---|---|
| Bullseye | N=4, 5, 7–11 (concentric rings of different colors per face) |
| Dots | N=4 |
| Cube in Cube | N=3 |
| Pi | N=3 |

For an arbitrary target, click **Paint** to enter paint mode: the cube
snaps to solved, and clicking any sticker cycles its color through the
6 face colors. Click **Go** when you're done and the solver finds a path
to your painted state (assuming it's reachable — invalid configurations
surface as a solver error).

Click **Paint** again or press `Esc` to leave paint mode without applying.

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
    ├── puzzles/
    │   ├── PuzzleDefinition.js         # Base class / interface contract
    │   └── cube/
    │       ├── CubeConstants.js        # Colors, face definitions, geometry tables
    │       ├── CubePuzzle.js           # Rubik's Cube implementation
    │       └── CubeTrefoilView.js      # 2D trefoil rendering (cube-specific)
    ├── solver/                         # frontend half of the solver feature
    │   ├── FaceletEncoder.js           # pieces → URFDLB facelet string
    │   ├── MoveDecoder.js              # "Uw" / "3R'" / ... → engine move objects
    │   └── SolverClient.js             # POST + poll the backend
    ├── patterns/                       # pattern presets + paint mode
    │   ├── PatternRegistry.js          # bullseye, dots, cube-in-cube, pi
    │   └── PaintMode.js                # click-to-cycle sticker colors
    └── config.js                       # SOLVER_URL etc.
```

Solver backend lives in [`backend/`](backend/) (Python + FastAPI, Dockerized).

## Technical Details

- **Rendering**: HTML5 Canvas 2D API, painter's algorithm with backface culling
- **Animation**: `requestAnimationFrame` with delta-time, cosine ease-in-out
- **Modules**: ES modules (no build step, no dependencies)
- **2D Views**: Optional per-puzzle — only the cube has one (trefoil projection)
