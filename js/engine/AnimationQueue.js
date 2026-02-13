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
