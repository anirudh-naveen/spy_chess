import type { PieceType } from './board.js';

export interface PieceInfo {
  name: string;
  /** Material value, used for the material count and the armada budget. The king has none. */
  value: number;
  moves: string;
  /** Why you'd pick it over another piece of the same value. */
  role: string;
}

export const PIECE_INFO: Record<PieceType, PieceInfo> = {
  k: {
    name: 'King',
    value: 0,
    moves: 'One square in any direction.',
    role: 'Always in your armada. If it is captured, you lose.',
  },
  q: {
    name: 'Queen',
    value: 9,
    moves: 'Any distance in a straight line or diagonal.',
    role: 'The strongest slider, and the biggest bite out of your budget.',
  },
  c: {
    name: 'Chancellor',
    value: 8,
    moves: 'Moves as a rook or as a knight.',
    role: 'Rook power that can also jump into a crowded position.',
  },
  a: {
    name: 'Archbishop',
    value: 7,
    moves: 'Moves as a bishop or as a knight.',
    role: 'Covers both square colours, unlike a bishop, and forks like a knight.',
  },
  r: {
    name: 'Rook',
    value: 5,
    moves: 'Any distance in a straight line.',
    role: 'Controls whole files and ranks.',
  },
  j: {
    name: 'Jumper',
    value: 3,
    moves: 'Exactly two squares in any straight or diagonal direction, jumping over whatever is in between.',
    role: 'Hops clean over pawn walls and can never be blocked, but always lands two squares away.',
  },
  b: {
    name: 'Bishop',
    value: 3,
    moves: 'Any distance diagonally.',
    role: 'The only 3-pointer with long range in every diagonal. Stuck on one square colour.',
  },
  n: {
    name: 'Knight',
    value: 3,
    moves: 'An L: two squares one way and one to the side. Jumps over pieces.',
    role: 'The best short-range forker, and it reaches both square colours.',
  },
  m: {
    name: 'Camel',
    value: 3,
    moves: 'A long L: three squares one way and one to the side. Jumps over pieces.',
    role: 'Leaps deep into enemy lines in one move. Stuck on one square colour and weak up close.',
  },
  g: {
    name: 'Guard',
    value: 2,
    moves: 'One square in any direction, like a king. Scouts cannot reveal it.',
    role: 'A decoy king: it moves exactly like your king and is immune to scouts.',
  },
  l: {
    name: 'Lancer',
    value: 3,
    moves: 'Any distance straight forward, or one square sideways or backward.',
    role: 'The fastest attacker down a file, but slow to retreat.',
  },
  s: {
    name: 'Scout',
    value: 2,
    moves: 'Moves like a pawn but never promotes.',
    role: 'Any enemy piece next to it is revealed to you for good (except guards).',
  },
  p: {
    name: 'Pawn',
    value: 1,
    moves: 'One square forward, two on its first move. Captures diagonally forward.',
    role: 'Promotes on the last rank.',
  },
};

/** Most points an armada's back rank may spend, not counting the king. */
export const ARMADA_BUDGET = 30;

/** Points a layout spends: the summed value of its pieces other than the king and pawns. */
export function squadPoints(layout: Partial<Record<string, PieceType>>): number {
  let total = 0;
  for (const t of Object.values(layout)) if (t && t !== 'p') total += PIECE_INFO[t].value;
  return total;
}

/** The twelve back-rank pieces an armada is chosen from: at most one of each, king required. */
export const ARMADA_TYPES: PieceType[] = ['k', 'q', 'c', 'a', 'r', 'j', 'b', 'n', 'm', 'l', 'g', 's'];

/** Guesses offered when marking an enemy bulb in each mode. */
export const STANDARD_GUESSES: PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];
export const ARMADA_GUESSES: PieceType[] = [...ARMADA_TYPES, 'p'];
