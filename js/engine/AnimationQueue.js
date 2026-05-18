import { ease } from './math.js';

export class AnimationQueue {
    constructor() {
        this.queue = [];
        this.current = null;
        this.moveStart = 0;
        this.moveDuration = 300;
        // Monotonic; survives clear() so PuzzleEngine can detect completions
        // even when the same move object appears multiple times in the queue.
        this.completedCount = 0;
    }

    queueMove(move) {
        this.queue.push(move);
    }

    update(time, puzzle, pieces) {
        let progress = 0;
        if (this.current) {
            progress = (time - this.moveStart) / this.moveDuration;
            if (progress >= 1) {
                puzzle.applyRotation(pieces, this.current);
                this.current = null;
                this.completedCount++;
                progress = 0;
            }
        }
        if (!this.current && this.queue.length > 0) {
            this.current = this.queue.shift();
            this.moveStart = time;
            progress = 0;
        }
        return { current: this.current, progress: Math.min(progress, 1) };
    }

    clear() {
        this.queue = [];
        this.current = null;
    }

    setSpeed(duration) {
        this.moveDuration = duration;
    }

    get isAnimating() {
        return this.current !== null || this.queue.length > 0;
    }
}
