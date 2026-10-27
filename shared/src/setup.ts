import {
  type Board,
  type Color,
  type GameMode,
  type Layout,
  type PieceType,
  PIECE_COUNTS,
  emptyBoard,
  homeRanks,
  rankOf,
  toIndex,
  toSquare,
} from './board.js';
import { ARMADA_MAX_PAWNS, ARMADA_TOTAL, ARMADA_TYPES, PIECE_INFO, squadPoints } from './pieces.js';

const STANDARD_BACK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
// 28 points behind a full row of 8 pawns: exactly 36.
const ARMADA_BACK: PieceType[] = ['r', 'n', 'j', 'q', 'k', 'm', 'g', 'b'];

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function rankSquares(rank: number): string[] {
  return Array.from({ length: 8 }, (_, f) => toSquare(rank * 8 + f));
}

/** Back rank pieces in file order, with a row of pawns in front. */
function withPawns(c: Color, back: PieceType[]): Layout {
  const [backRank, frontRank] = homeRanks(c);
  const layout: Layout = {};
  rankSquares(backRank).forEach((sq, i) => (layout[sq] = back[i]));
  rankSquares(frontRank).forEach((sq) => (layout[sq] = 'p'));
  return layout;
}

/** The starting arrangement shown on the setup screen. */
export function defaultLayout(c: Color, mode: GameMode = 'standard'): Layout {
  return withPawns(c, mode === 'armada' ? ARMADA_BACK : STANDARD_BACK);
}

/**
 * Standard: all 16 pieces shuffled over both home ranks.
 * Armada: the king, a random mix of distinct pieces and pawns worth exactly the armada total,
 * scattered over both home ranks.
 */
export function randomLayout(c: Color, mode: GameMode = 'standard', rand: () => number = Math.random): Layout {
  if (mode === 'armada') {
    for (;;) {
      const picks: PieceType[] = ['k'];
      let spent = 0;
      for (const t of shuffle(ARMADA_TYPES.filter((t) => t !== 'k'), rand)) {
        // Leave room for a few pawns so most draws can land exactly on the total.
        if (spent + PIECE_INFO[t].value <= ARMADA_TOTAL - 2 && picks.length < 12 && rand() < 0.75) {
          picks.push(t);
          spent += PIECE_INFO[t].value;
        }
      }
      const pawns = ARMADA_TOTAL - spent;
      if (pawns > ARMADA_MAX_PAWNS || picks.length + pawns > 16) continue;
      for (let i = 0; i < pawns; i++) picks.push('p');
      const layout: Layout = {};
      shuffle(homeSquares(c), rand)
        .slice(0, picks.length)
        .forEach((sq, i) => (layout[sq] = picks[i]));
      return layout;
    }
  }
  const pieces: PieceType[] = [];
  for (const [t, n] of Object.entries(PIECE_COUNTS) as [PieceType, number][]) {
    for (let i = 0; i < n; i++) pieces.push(t);
  }
  const layout: Layout = {};
  const squares = homeSquares(c);
  shuffle(pieces, rand).forEach((t, i) => (layout[squares[i]] = t));
  return layout;
}

export function homeSquares(c: Color): string[] {
  return homeRanks(c).flatMap(rankSquares);
}

/** Squares a player may arrange pieces on during setup: both home ranks, in either mode. */
export function setupSquares(c: Color, _mode: GameMode = 'standard'): string[] {
  return homeSquares(c);
}

/** Returns null when the layout is valid, otherwise a reason. */
export function validateLayout(c: Color, layout: unknown, mode: GameMode = 'standard'): string | null {
  if (!layout || typeof layout !== 'object') return 'Layout must be an object';
  const entries = Object.entries(layout as Record<string, unknown>);
  // Standard fills both ranks; an armada may leave squares empty.
  if (mode === 'standard' ? entries.length !== 16 : entries.length > 16) return 'Layout must place exactly 16 pieces';
  const ranks = homeRanks(c);
  const counts: Record<string, number> = {};
  for (const [sq, t] of entries) {
    const i = toIndex(sq);
    if (i < 0) return `Bad square ${sq}`;
    if (!ranks.includes(rankOf(i))) return `${sq} is not on your home ranks`;
    if (typeof t !== 'string') return `Bad piece on ${sq}`;
    const allowed = mode === 'armada' ? t === 'p' || ARMADA_TYPES.includes(t as PieceType) : t in PIECE_COUNTS;
    if (!allowed) return `Bad piece on ${sq}`;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  if (mode === 'armada') {
    if (counts.k !== 1) return 'Your armada needs exactly one king';
    for (const t of ARMADA_TYPES) if ((counts[t] ?? 0) > 1) return 'An armada can include at most one of each piece';
    if ((counts.p ?? 0) > ARMADA_MAX_PAWNS) return `An armada can have at most ${ARMADA_MAX_PAWNS} pawns`;
    const worth = squadPoints(layout as Layout);
    if (worth !== ARMADA_TOTAL) return `Your armada is worth ${worth} points; it must total exactly ${ARMADA_TOTAL}`;
    return null;
  }
  for (const [t, n] of Object.entries(PIECE_COUNTS)) {
    if (counts[t] !== n) return `Expected ${n} of piece ${t}`;
  }
  return null;
}

/** Builds the starting board from two validated layouts. */
export function boardFromLayouts(white: Layout, black: Layout): Board {
  const board = emptyBoard();
  for (const [color, layout] of [['w', white], ['b', black]] as const) {
    for (const [sq, type] of Object.entries(layout)) {
      board[toIndex(sq)] = { id: `${color}:${sq}`, color, type, moved: false };
    }
  }
  return board;
}
