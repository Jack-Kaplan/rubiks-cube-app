# Rubik's Cube Visualization

A synchronized dual-view Rubik's Cube visualization featuring:
- **2D Trefoil Projection**: Jagarikin-style corner-centric layout showing all 54 stickers
- **3D Rotating Cube**: Traditional perspective view with continuous rotation

Based on the viral animation by Japanese artist @jagarikin (Twitter, November 2022).

## Quick Start

Open `index.html` in your browser, or serve with any static HTTP server:

```bash
# Option 1: Python
python -m http.server 8000

# Option 2: Node.js
npx http-server
```

Then open http://localhost:8000.

## Controls

| Action | Trigger |
|--------|---------|
| Scramble | `Space` |
| Reset | `Escape` |
| Rotate Up face | `U` (clockwise) / `Shift+U` (counter) |
| Rotate Down face | `D` / `Shift+D` |
| Rotate Left face | `L` / `Shift+L` |
| Rotate Right face | `R` / `Shift+R` |
| Rotate Front face | `F` / `Shift+F` |
| Rotate Back face | `B` / `Shift+B` |
| Select layer depth | `1`-`9` keys |
| Rotate sticker | Click sticker + `←`/`→`/`↑`/`↓` |
| Adjust speed | `+` / `-` keys or slider |
| Cube size | Size input (1-10) |
| Border width | Border input (1-2) |
| Toggle image mode | Image checkbox |

## Project Structure

```
rubiks-cube-app/
├── index.html              # Main HTML page
└── static/
    ├── css/
    │   └── styles.css      # Application styles
    └── js/
        └── main.js         # Single-file implementation (cube state, animation, 2D/3D rendering)
```

## Technical Details

- **Rendering**: HTML5 Canvas 2D API for both 2D and 3D views
- **Animation**: requestAnimationFrame with delta-time updates
- **Cube Support**: N×N×N cubes (configurable from 1×1×1 to 10×10×10)
- **Target**: 60 FPS on modern hardware

## Face Color Mapping

| Face | Color | Direction | 2D Position |
|------|-------|-----------|-------------|
| 0 | Yellow (#FFE135) | Top (Y-) | Inner face |
| 1 | Red (#FF3B30) | Bottom (Y+) | Outer lobe |
| 2 | Green (#32CD32) | Left (X-) | Outer lobe |
| 3 | Cyan (#00CFFF) | Right (X+) | Inner face |
| 4 | Pink (#FF69B4) | Front (Z+) | Inner face |
| 5 | Blue (#0066CC) | Back (Z-) | Outer lobe |
