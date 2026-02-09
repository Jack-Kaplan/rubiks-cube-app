"""
Rubik's Cube 2D/3D Visualization Server
FastAPI application serving the interactive Rubik's Cube visualization.
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI(
    title="Rubik's Cube Visualization",
    description="Jagarikin-style trefoil projection with synchronized 3D view"
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    """Serve the main HTML page."""
    return FileResponse("templates/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
