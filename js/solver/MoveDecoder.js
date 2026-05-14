/**
 * Decode a single dwalton76-style move notation token into one or more
 * engine moves of the form `{axis, layer, dir}` that AnimationQueue.queueMove
 * accepts.
 *
 * Notation grammar matches `rotate_guts` in dwalton76's solver:
 *
 *     <count?> <U|R|F|D|L|B> <w?> <'|2>?
 *
 * If a digit prefix is present OR a `w` suffix is present, the move is a
 * "wide" turn rotating layers 1..rows_to_rotate together. Otherwise it's
 * a single outer-layer turn.
 *
 *     count present      → rows_to_rotate = count
 *     w present, no digit → rows_to_rotate = 2
 *     neither            → rows_to_rotate = 1  (single outer layer)
 *
 * Examples:
 *     R       outer R face, 90° CW
 *     R'      outer R face, 90° CCW
 *     R2      outer R face, 180°
 *     Rw      wide R: layers 1..2 turn together (90° CW)
 *     2R      wide R: layers 1..2 (same as Rw)
 *     2Rw     wide R: layers 1..2 (same as Rw)
 *     3R      wide R: layers 1..3
 *     3Rw'    wide R: layers 1..3, CCW
 *     3Rw2    wide R: layers 1..3, 180°
 *
 * Note: this notation does NOT support "slice-only" turns (e.g., the
 * middle slice). dwalton76 does not emit them; M/E/S aren't handled.
 *
 * Layer math mirrors CubePuzzle.resolveMove():
 *     layer = side * (half - (depth - 1))
 *   where `side` and `axis` come from CubePuzzle.baseMoves[letter].
 */

// Map face-letter → CubePuzzle.baseMoves key.
const LETTER_TO_KEY = {
    U: 'u', D: 'd',
    L: 'l', R: 'r',
    F: 'f', B: 'b',
};

// The engine's Y axis is inverted: -Y is the top of the cube, so "CW from
// outside" rotates the opposite way around the Y axis compared to standard
// URFDLB convention. L/R/F/B match the solver out of the box; U/D need their
// rotation direction flipped at the decode boundary.
const INVERTED_LETTERS = new Set(['U', 'D']);

const NOTATION_RE = /^(\d*)([URFDLB])(w?)(2?)('?)$/;

/**
 * Parse a notation token and return an array of engine moves.
 * Returns [] for unrecognized tokens (e.g., whole-cube rotations like
 * `x`/`y`/`z`, which the solver shouldn't emit but we ignore defensively).
 */
export function decodeMove(notation, puzzle, config) {
    const m = NOTATION_RE.exec(notation.trim());
    if (!m) return [];
    const [, countStr, letter, wide, double, inverse] = m;

    const baseMove = puzzle.baseMoves[LETTER_TO_KEY[letter]];
    if (!baseMove) return [];

    const half = (config.N - 1) / 2;
    let dir = inverse ? -baseMove.dir : baseMove.dir;
    if (INVERTED_LETTERS.has(letter)) dir = -dir;

    // dwalton76 convention: a digit prefix OR a 'w' suffix marks the move
    // as wide; otherwise it's a single outer-layer turn. The leading digit
    // (if any) sets the depth; bare 'w' implies depth=2.
    const rowsToRotate = countStr
        ? parseInt(countStr, 10)
        : (wide ? 2 : 1);

    const moves = [];
    for (let d = 1; d <= rowsToRotate; d++) {
        const layer = baseMove.side * (half - (d - 1));
        moves.push({ axis: baseMove.axis, layer, dir });
    }

    if (double) {
        // 180° = same 90° move queued twice. AnimationQueue plays each at
        // moveAngle (π/2) so two consecutive plays produce a half-turn.
        return [...moves, ...moves];
    }
    return moves;
}

/**
 * Decode a list of notation tokens into a flat list of engine moves.
 */
export function decodeMoveList(notations, puzzle, config) {
    const out = [];
    for (const tok of notations) {
        for (const m of decodeMove(tok, puzzle, config)) out.push(m);
    }
    return out;
}

/**
 * Invert a notation token: `R` → `R'`, `R'` → `R`, `R2` → `R2`,
 * `3Rw` → `3Rw'`, `3Rw'` → `3Rw`, `3Rw2` → `3Rw2`.
 * Returns null for tokens the grammar doesn't recognize.
 */
export function invertNotation(tok) {
    const m = NOTATION_RE.exec(tok.trim());
    if (!m) return null;
    const [, countStr, letter, wide, double, inverse] = m;
    if (double) return tok.trim();                      // 180° is self-inverse
    const head = `${countStr}${letter}${wide}`;
    return inverse ? head : `${head}'`;
}

/**
 * Invert a full move sequence: reverse order and invert each token.
 * Unrecognized tokens are skipped (defensive).
 */
export function invertMoveList(notations) {
    const out = [];
    for (let i = notations.length - 1; i >= 0; i--) {
        const inv = invertNotation(notations[i]);
        if (inv != null) out.push(inv);
    }
    return out;
}
