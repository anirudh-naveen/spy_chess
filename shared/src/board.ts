export type Color = 'w' | 'b';
export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

/** Algebraic square name, e.g. "e4". */
export type Square = string;

export interface Piece {
  /** Stable id for the life of the game. Derived from the starting square, so it carries no hidden information. */
  id: string;
  color: Color;
  type: PieceType;
  moved: boolean;
}

/** 64 entries, index = rank * 8 + file, a1 = 0, h8 = 63. */
export type Board = (Piece | null)[];

/** A player's starting arrangement: square -> piece type, on their own two home ranks. */
export type Layout = Record<Square, PieceType>;

export const PIECE_COUNTS: Record<PieceType, number> = { k: 1, q: 1, r: 2, b: 2, n: 2, p: 8 };

export const FILES = 'abcdefgh';

export function other(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

export function toIndex(sq: Square): number {
  if (typeof sq !== 'string' || sq.length !== 2) return -1;
  const f = FILES.indexOf(sq[0]);
  const r = sq.charCodeAt(1) - 49;
  if (f < 0 || r < 0 || r > 7) return -1;
  return r * 8 + f;
}

export function toSquare(i: number): Square {
  return FILES[i % 8] + String((i >> 3) + 1);
}

export function fileOf(i: number): number {
  return i % 8;
}

export function rankOf(i: number): number {
  return i >> 3;
}

/** Ranks (0-based) a color may place pieces on during setup. */
export function homeRanks(c: Color): [number, number] {
  return c === 'w' ? [0, 1] : [7, 6];
}

export function emptyBoard(): Board {
  return new Array(64).fill(null);
}
