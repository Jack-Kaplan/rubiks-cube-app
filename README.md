# Rubik's Cube Visualization

A synchronized dual-view Rubik's Cube visualization featuring:
- **2D Trefoil Projection**: Jagarikin-style corner-centric layout showing all 54 stickers
- **3D Rotating Cube**: Traditional perspective view with continuous rotation

Based on the viral animation by Japanese artist @jagarikin (Twitter, November 2022).

## Quick Start

```bash
# Install dependencies (requires uv)
uv sync

# Run the server
uv run uvicorn main:app --reload

# Open in browser
open http://localhost:8000
```

## Controls

| Action | Trigger |
|--------|---------|
| Scramble | Click 3D view or press `Space` |
| Reset | Click 2D view or press `Escape` |
| Rotate Up face | `U` (clockwise) / `Shift+U` (counter) |
| Rotate Down face | `D` / `Shift+D` |
| Rotate Left face | `L` / `Shift+L` |
| Rotate Right face | `R` / `Shift+R` |
| Rotate Front face | `F` / `Shift+F` |
| Rotate Back face | `B` / `Shift+B` |

## Project Structure

```
rubiks-cube-app/
├── main.py                 # FastAPI server
├── pyproject.toml          # Python dependencies
├── templates/
│   └── index.html          # Main HTML page
└── static/
    ├── css/
    │   └── styles.css      # Application styles
    └── js/
        ├── main.js         # Application entry point
        ├── constants.js    # Configuration and colors
        ├── cube-state.js   # Cube state management
        ├── animation.js    # Animation system
        ├── renderer-2d.js  # 2D trefoil projection
        └── renderer-3d.js  # 3D cube rendering
```

## Technical Details

- **Framework**: FastAPI (Python) serving static JavaScript modules
- **Rendering**: HTML5 Canvas 2D API
- **Animation**: requestAnimationFrame with delta-time updates
- **Target**: 60 FPS on modern hardware

## Face Color Mapping

| Face | Color | 2D Position |
|------|-------|-------------|
| 0 | Yellow | Lower-right inner |
| 1 | Red | Bottom outer lobe |
| 2 | Green | Upper-left outer lobe |
| 3 | Cyan | Top inner |
| 4 | Magenta | Lower-left inner |
| 5 | Blue | Upper-right outer lobe |
