import {
  type Board,
  type Color,
  type Layout,
  type PieceType,
  PIECE_COUNTS,
  emptyBoard,
  homeRanks,
  rankOf,
  toIndex,
  toSquare,
} from './board.js';

const STANDARD_BACK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

/** The ordinary chess arrangement, used as the starting point of the setup screen. */
export function defaultLayout(c: Color): Layout {
  const [back, front] = homeRanks(c);
  const layout: Layout = {};
  for (let f = 0; f < 8; f++) {
    layout[toSquare(back * 8 + f)] = STANDARD_BACK[f];
    layout[toSquare(front * 8 + f)] = 'p';
  }
  return layout;
}

/** A uniformly shuffled arrangement of all 16 pieces over the home ranks. */
export function randomLayout(c: Color, rand: () => number = Math.random): Layout {
  const pieces: PieceType[] = [];
  for (const [t, n] of Object.entries(PIECE_COUNTS) as [PieceType, number][]) {
    for (let i = 0; i < n; i++) pieces.push(t);
  }
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  const squares = homeSquares(c);
  const layout: Layout = {};
  squares.forEach((sq, i) => (layout[sq] = pieces[i]));
  return layout;
}

export function homeSquares(c: Color): string[] {
  const ranks = homeRanks(c);
  const out: string[] = [];
  for (const r of ranks) for (let f = 0; f < 8; f++) out.push(toSquare(r * 8 + f));
  return out;
}

/** Returns null when the layout is valid, otherwise a reason. */
export function validateLayout(c: Color, layout: unknown): string | null {
  if (!layout || typeof layout !== 'object') return 'Layout must be an object';
  const entries = Object.entries(layout as Record<string, unknown>);
  if (entries.length !== 16) return 'Layout must place exactly 16 pieces';
  const ranks = homeRanks(c);
  const counts: Record<string, number> = {};
  for (const [sq, t] of entries) {
    const i = toIndex(sq);
    if (i < 0) return `Bad square ${sq}`;
    if (!ranks.includes(rankOf(i))) return `${sq} is not on your home ranks`;
    if (typeof t !== 'string' || !(t in PIECE_COUNTS)) return `Bad piece on ${sq}`;
    counts[t] = (counts[t] ?? 0) + 1;
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
