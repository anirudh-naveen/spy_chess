import type { Color, PieceType } from './board.js';
import type { GameState, MoveRecord, Result } from './rules.js';

export interface PieceView {
  id: string;
  color: Color;
  /** 'bulb' for enemy pieces while the game is in progress. */
  type: PieceType | 'bulb';
}

export interface GameView {
  board: (PieceView | null)[];
  turn: Color;
  moves: MoveRecord[];
  captured: { color: Color; type: PieceType }[];
  result: Result | null;
  /** The color this view was built for, or null for a spectator. */
  you: Color | null;
}

/**
 * The only way game state should leave the server. Enemy piece types and
 * enemy promotion choices are hidden until the game ends.
 */
export function redactFor(state: GameState, viewer: Color | null): GameView {
  const reveal = state.result !== null;
  return {
    board: state.board.map((p) =>
      p ? { id: p.id, color: p.color, type: reveal || p.color === viewer ? p.type : 'bulb' } : null,
    ),
    turn: state.turn,
    moves: state.moves.map((m) => {
      if (reveal || m.color === viewer || !m.promo) return { ...m };
      const { promo: _hidden, ...rest } = m;
      return rest;
    }),
    captured: state.captured.map((c) => ({ ...c })),
    result: state.result,
    you: viewer,
  };
}
