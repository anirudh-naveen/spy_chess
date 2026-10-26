import type { Color, PieceType } from '@spy/shared';

// cburnett piece set by Colin M.L. Burnett, CC BY-SA 3.0. Bulbs are our own.
const files = import.meta.glob('./assets/pieces/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;

export function pieceUrl(color: Color, type: PieceType | 'bulb'): string {
  return files[`./assets/pieces/${color}${type}.svg`];
}

export const PIECE_NAMES: Record<PieceType, string> = {
  k: 'King',
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
  p: 'Pawn',
};
