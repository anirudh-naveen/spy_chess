import { describe, expect, it } from 'vitest';
import {
  type Board,
  type GameState,
  type Layout,
  applyMove,
  boardFromLayouts,
  defaultLayout,
  emptyBoard,
  legalMoves,
  newGame,
  randomLayout,
  replay,
  toIndex,
  validateLayout,
} from '../src/index.js';

function place(board: Board, sq: string, color: 'w' | 'b', type: any, moved = false) {
  board[toIndex(sq)] = { id: `${color}:${sq}`, color, type, moved };
}

function play(state: GameState, from: string, to: string, promo?: any): GameState {
  const n = applyMove(state, { from, to, promo });
  if (typeof n === 'string') throw new Error(n);
  return n;
}

describe('setup', () => {
  it('accepts the default and random layouts', () => {
    expect(validateLayout('w', defaultLayout('w'))).toBeNull();
    expect(validateLayout('b', defaultLayout('b'))).toBeNull();
    for (let i = 0; i < 20; i++) {
      expect(validateLayout('w', randomLayout('w'))).toBeNull();
      expect(validateLayout('b', randomLayout('b'))).toBeNull();
    }
  });

  it('rejects pieces off the home ranks', () => {
    const l: Layout = { ...defaultLayout('w') };
    delete l['a1'];
    l['a3'] = 'r';
    expect(validateLayout('w', l)).toMatch(/home ranks/);
    expect(validateLayout('b', defaultLayout('w'))).toMatch(/home ranks/);
  });

  it('rejects wrong piece counts', () => {
    const l: Layout = { ...defaultLayout('w'), e1: 'q' };
    expect(validateLayout('w', l)).toMatch(/Expected/);
    expect(validateLayout('w', { a1: 'k' })).toMatch(/16/);
    expect(validateLayout('w', null)).not.toBeNull();
  });

  it('builds ids from starting squares', () => {
    const b = boardFromLayouts(defaultLayout('w'), defaultLayout('b'));
    expect(b[toIndex('e1')]).toMatchObject({ id: 'w:e1', type: 'k' });
    expect(b[toIndex('d8')]).toMatchObject({ id: 'b:d8', type: 'q' });
  });
});

describe('movement', () => {
  it('pawns on the back rank can double-step on their first move', () => {
    const b = emptyBoard();
    place(b, 'c1', 'w', 'p');
    place(b, 'h8', 'b', 'k');
    place(b, 'a1', 'w', 'k');
    const s = newGame(b);
    expect(legalMoves(s, 'c1').sort()).toEqual(['c2', 'c3']);
    const s2 = play(play(s, 'c1', 'c3'), 'h8', 'h7');
    expect(legalMoves(s2, 'c3')).toEqual(['c4']);
  });

  it('black pawns move down the board', () => {
    const b = boardFromLayouts(defaultLayout('w'), defaultLayout('b'));
    const s = play(newGame(b), 'e2', 'e4');
    expect(legalMoves(s, 'e7').sort()).toEqual(['e5', 'e6']);
  });

  it('pawns cannot capture forward or jump over pieces', () => {
    const b = emptyBoard();
    place(b, 'e2', 'w', 'p');
    place(b, 'e3', 'b', 'n');
    place(b, 'd3', 'b', 'p');
    place(b, 'a1', 'w', 'k');
    place(b, 'h8', 'b', 'k');
    expect(legalMoves(newGame(b), 'e2')).toEqual(['d3']);
  });

  it('sliders stop at blockers and capture enemies', () => {
    const b = emptyBoard();
    place(b, 'a1', 'w', 'r');
    place(b, 'a4', 'b', 'n');
    place(b, 'c1', 'w', 'k');
    place(b, 'h8', 'b', 'k');
    expect(legalMoves(newGame(b), 'a1').sort()).toEqual(['a2', 'a3', 'a4', 'b1']);
  });

  it('knights jump', () => {
    const b = boardFromLayouts(defaultLayout('w'), defaultLayout('b'));
    expect(legalMoves(newGame(b), 'g1').sort()).toEqual(['f3', 'h3']);
  });

  it('there is no castling', () => {
    const b = emptyBoard();
    place(b, 'e1', 'w', 'k');
    place(b, 'h1', 'w', 'r');
    place(b, 'h8', 'b', 'k');
    expect(legalMoves(newGame(b), 'e1')).not.toContain('g1');
  });

  it('kings may move into attack (no check rule)', () => {
    const b = emptyBoard();
    place(b, 'e1', 'w', 'k');
    place(b, 'd8', 'b', 'r');
    place(b, 'h8', 'b', 'k');
    expect(legalMoves(newGame(b), 'e1')).toContain('d1');
  });

  it('rejects moves out of turn and illegal moves', () => {
    const s = newGame(boardFromLayouts(defaultLayout('w'), defaultLayout('b')));
    expect(applyMove(s, { from: 'e7', to: 'e5' })).toBe('Not your turn');
    expect(applyMove(s, { from: 'e2', to: 'e5' })).toBe('Illegal move');
    expect(applyMove(s, { from: 'e4', to: 'e5' })).toBe('No piece on that square');
  });
});

describe('game end', () => {
  it('capturing the king wins', () => {
    const b = emptyBoard();
    place(b, 'e1', 'w', 'k');
    place(b, 'a2', 'w', 'r');
    place(b, 'a8', 'b', 'k');
    place(b, 'h7', 'b', 'p');
    const s = play(newGame(b), 'a2', 'a8');
    expect(s.result).toEqual({ winner: 'w', reason: 'king-captured' });
    expect(s.moves.at(-1)?.captured).toBe('k');
    expect(applyMove(s, { from: 'h7', to: 'h6' })).toBe('Game is over');
  });

  it('bare kings is a draw', () => {
    const b = emptyBoard();
    place(b, 'e1', 'w', 'k');
    place(b, 'e2', 'b', 'p', true);
    place(b, 'a8', 'b', 'k');
    const s = play(newGame(b), 'e1', 'e2');
    expect(s.result).toEqual({ winner: null, reason: 'insufficient' });
  });

  it('no legal moves is a draw', () => {
    // Black pawns move toward rank 1, so pawns on rank 1 are stuck, and the rest are blocked by their own side.
    const b = emptyBoard();
    place(b, 'a1', 'b', 'k');
    place(b, 'b1', 'b', 'p', true);
    place(b, 'c1', 'b', 'p', true);
    place(b, 'a2', 'b', 'p', true);
    place(b, 'b2', 'b', 'p', true);
    place(b, 'h8', 'w', 'k');
    place(b, 'h5', 'w', 'r');
    const s = play(newGame(b), 'h5', 'h6');
    expect(s.result).toEqual({ winner: null, reason: 'no-moves' });
  });
});

describe('replay', () => {
  it('reconstructs state from moves', () => {
    const b = boardFromLayouts(defaultLayout('w'), defaultLayout('b'));
    const s = replay(b, [
      { from: 'e2', to: 'e4' },
      { from: 'd7', to: 'd5' },
      { from: 'e4', to: 'd5' },
    ]);
    expect(s.turn).toBe('b');
    expect(s.captured).toEqual([{ id: 'b:d7', color: 'b', type: 'p' }]);
    expect(s.board[toIndex('d5')]?.id).toBe('w:e2');
  });

  it('promotes, defaulting to a queen', () => {
    const b = emptyBoard();
    place(b, 'a7', 'w', 'p', true);
    place(b, 'e1', 'w', 'k');
    place(b, 'h8', 'b', 'k');
    place(b, 'h2', 'b', 'p', true);
    const s = play(newGame(b), 'a7', 'a8', 'n');
    expect(s.board[toIndex('a8')]?.type).toBe('n');
    expect(s.moves[0].promo).toBe('n');
    const s2 = play(newGame(b), 'a7', 'a8');
    expect(s2.board[toIndex('a8')]?.type).toBe('q');
  });
});
