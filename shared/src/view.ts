import type { Color, PieceType } from './board.js';
import type { GameState, MoveRecord, Result } from './rules.js';

export interface PieceView {
  id: string;
  color: Color;
  /** 'bulb' for enemy pieces while the game is in progress. */
  type: PieceType | 'bulb';
  /** Set on an enemy piece the viewer has identified with a scout. */
  confirmed?: true;
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
 * enemy promotion choices are hidden until the game ends, except pieces the
 * viewer's scouts have confirmed.
 */
export function redactFor(state: GameState, viewer: Color | null): GameView {
  const reveal = state.result !== null;
  const scouted = new Set(viewer ? state.revealed[viewer] : []);
  return {
    board: state.board.map((p) => {
      if (!p) return null;
      if (reveal || p.color === viewer) return { id: p.id, color: p.color, type: p.type };
      if (scouted.has(p.id)) return { id: p.id, color: p.color, type: p.type, confirmed: true };
      return { id: p.id, color: p.color, type: 'bulb' };
    }),
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
