import { type Color, type PieceType, other } from './board.js';
import type { GameState, MoveRecord, Result } from './rules.js';

export interface PieceView {
  id: string;
  color: Color;
  /** 'bulb' for enemy pieces while the game is in progress. */
  type: PieceType | 'bulb';
  /** Set on an enemy piece the viewer has identified with a scout. */
  confirmed?: true;
}

/** A move as a viewer sees it: the type of a piece they captured stays veiled. */
export type MoveView = Omit<MoveRecord, 'captured'> & { captured?: PieceType | 'bulb' };

export interface CapturedView {
  id: string;
  color: Color;
  type: PieceType | 'bulb';
}

export interface GameView {
  board: (PieceView | null)[];
  turn: Color;
  moves: MoveView[];
  /** Captured pieces. Ones the viewer took stay bulbs unless a scout confirmed them. */
  captured: CapturedView[];
  result: Result | null;
  /** The color this view was built for, or null for a spectator. */
  you: Color | null;
}

/**
 * The only way game state should leave the server. Enemy piece types (on the
 * board and once captured) and enemy promotion choices are hidden until the game
 * ends, except pieces the viewer's scouts have confirmed.
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
      const out: MoveView = { ...m };
      if (!reveal && m.color !== viewer) delete out.promo;
      // Only the owner of a captured piece knows what it was.
      if (!reveal && out.captured && other(m.color) !== viewer) out.captured = 'bulb';
      return out;
    }),
    captured: state.captured.map((c) => ({
      id: c.id,
      color: c.color,
      type: reveal || c.color === viewer || scouted.has(c.id) ? c.type : 'bulb',
    })),
    result: state.result,
    you: viewer,
  };
}
