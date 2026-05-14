import { ease } from './math.js';

/**
 * Generic move animation queue. Manages a FIFO queue of moves,
 * processes one at a time with configurable easing and duration.
 */
export class AnimationQueue {
    constructor() {
        this.queue = [];
        this.current = null;
        this.moveStart = 0;
        this.moveDuration = 300;
        // Monotonic counter incremented every time a move finishes (progress
        // reaches 1 and applyRotation runs). The PuzzleEngine uses this to
        // drive its step counter — robust against the same move object
        // appearing more than once in the queue.
        this.completedCount = 0;
    }

    queueMove(move) {
        this.queue.push(move);
    }

    /**
     * Advance animation state. Call once per frame.
     * When a move completes, calls puzzle.applyRotation(pieces, move).
     * @returns {{ current: Object|null, progress: number }}
     */
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
        // completedCount intentionally not reset — it's monotonic so the
        // engine can take snapshots across clears without losing track.
    }

    setSpeed(duration) {
        this.moveDuration = duration;
    }

    get isAnimating() {
        return this.current !== null || this.queue.length > 0;
    }
}
