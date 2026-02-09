#!/usr/bin/env python3
"""
Run the Rubik's Cube Visualization server.
Usage: python run.py
"""

import uvicorn

if __name__ == "__main__":
    print("Starting Rubik's Cube Visualization...")
    print("Open http://localhost:8000 in your browser")
    print("Press Ctrl+C to stop\n")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
