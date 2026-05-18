// dwalton76 notation: `<count?><U|R|F|D|L|B><w?><'|2?>`
//   R, R', R2     — outer face: 90°, 90° CCW, 180°
//   Rw / 2Rw / 2R — wide: layers 1..2
//   3Rw / 3R      — wide: layers 1..3
//   3Rw' / 3Rw2   — wide CCW / wide 180°
// M/E/S slice moves are not supported; the solver doesn't emit them.

const LETTER_TO_KEY = {
    U: 'u', D: 'd',
    L: 'l', R: 'r',
    F: 'f', B: 'b',
};

// Engine's Y axis is inverted (-Y is the top), so U/D rotations flip
// direction at the decode boundary. L/R/F/B match standard convention.
const INVERTED_LETTERS = new Set(['U', 'D']);

const NOTATION_RE = /^(\d*)([URFDLB])(w?)(2?)('?)$/;

export function decodeMove(notation, puzzle, config) {
    const m = NOTATION_RE.exec(notation.trim());
    if (!m) return [];
    const [, countStr, letter, wide, double, inverse] = m;

    const baseMove = puzzle.baseMoves[LETTER_TO_KEY[letter]];
    if (!baseMove) return [];

    const half = (config.N - 1) / 2;
    let dir = inverse ? -baseMove.dir : baseMove.dir;
    if (INVERTED_LETTERS.has(letter)) dir = -dir;

    const rowsToRotate = countStr
        ? parseInt(countStr, 10)
        : (wide ? 2 : 1);

    const moves = [];
    for (let d = 1; d <= rowsToRotate; d++) {
        const layer = baseMove.side * (half - (d - 1));
        moves.push({ axis: baseMove.axis, layer, dir });
    }

    if (double) {
        // 180° = same 90° queued twice; use distinct objects so the
        // engine's identity-based move-boundary detection sees two events.
        return [...moves, ...moves.map(m => ({ ...m }))];
    }
    return moves;
}

export function decodeMoveList(notations, puzzle, config) {
    const out = [];
    for (const tok of notations) {
        for (const m of decodeMove(tok, puzzle, config)) out.push(m);
    }
    return out;
}

export function invertNotation(tok) {
    const m = NOTATION_RE.exec(tok.trim());
    if (!m) return null;
    const [, countStr, letter, wide, double, inverse] = m;
    if (double) return tok.trim();
    const head = `${countStr}${letter}${wide}`;
    return inverse ? head : `${head}'`;
}

export function invertMoveList(notations) {
    const out = [];
    for (let i = notations.length - 1; i >= 0; i--) {
        const inv = invertNotation(notations[i]);
        if (inv != null) out.push(inv);
    }
    return out;
}
