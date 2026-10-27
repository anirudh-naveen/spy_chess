import { describe, expect, it } from 'vitest';
import {
  applyMove,
  boardFromLayouts,
  emptyBoard,
  newGame,
  randomLayout,
  redactFor,
  toIndex,
  type GameState,
} from '../src/index.js';

function play(s: GameState, from: string, to: string, promo?: any): GameState {
  const n = applyMove(s, { from, to, promo });
  if (typeof n === 'string') throw new Error(n);
  return n;
}

describe('redactFor', () => {
  const state = newGame(boardFromLayouts(randomLayout('w'), randomLayout('b')));

  it('shows own pieces and hides every enemy piece', () => {
    for (const viewer of ['w', 'b'] as const) {
      const v = redactFor(state, viewer);
      for (const p of v.board) {
        if (!p) continue;
        if (p.color === viewer) expect(p.type).not.toBe('bulb');
        else expect(p.type).toBe('bulb');
      }
    }
  });

  it('never serializes enemy piece types', () => {
    const json = JSON.stringify(redactFor(state, 'w'));
    const enemyTypes = JSON.parse(json).board.filter((p: any) => p?.color === 'b').map((p: any) => p.type);
    expect(new Set(enemyTypes)).toEqual(new Set(['bulb']));
    expect(json).not.toContain('"moved"');
  });

  it('spectators see only bulbs', () => {
    const v = redactFor(state, null);
    expect(v.board.filter(Boolean).every((p) => p!.type === 'bulb')).toBe(true);
  });

  it('hides enemy promotion choices until the game ends', () => {
    const b = emptyBoard();
    b[toIndex('a7')] = { id: 'w:a7', color: 'w', type: 'p', moved: true };
    b[toIndex('e1')] = { id: 'w:e1', color: 'w', type: 'k', moved: false };
    b[toIndex('h8')] = { id: 'b:h8', color: 'b', type: 'k', moved: false };
    b[toIndex('h3')] = { id: 'b:h3', color: 'b', type: 'p', moved: true };
    const s = play(newGame(b), 'a7', 'a8', 'n');
    expect(redactFor(s, 'w').moves[0].promo).toBe('n');
    expect(redactFor(s, 'b').moves[0].promo).toBeUndefined();
    expect(JSON.stringify(redactFor(s, 'b'))).not.toContain('promo');
  });

  it('reveals everything once the game is over', () => {
    const v = redactFor({ ...state, result: { winner: 'w', reason: 'resign' } }, 'w');
    expect(v.board.filter(Boolean).some((p) => p!.type === 'bulb')).toBe(false);
  });

  it('keeps captured enemy pieces veiled from the capturer', () => {
    const b = emptyBoard();
    b[toIndex('e1')] = { id: 'w:e1', color: 'w', type: 'k', moved: false };
    b[toIndex('d4')] = { id: 'w:d4', color: 'w', type: 'r', moved: true };
    b[toIndex('d7')] = { id: 'b:d7', color: 'b', type: 'n', moved: true };
    b[toIndex('h8')] = { id: 'b:h8', color: 'b', type: 'k', moved: false };
    const s = play(newGame(b), 'd4', 'd7');
    const forWhite = redactFor(s, 'w');
    expect(forWhite.captured).toEqual([{ id: 'b:d7', color: 'b', type: 'bulb' }]);
    expect(forWhite.moves[0].captured).toBe('bulb');
    expect(JSON.stringify(forWhite)).not.toContain('"n"');
    // The loser knows what they lost.
    expect(redactFor(s, 'b').captured[0].type).toBe('n');
    expect(redactFor(s, 'b').moves[0].captured).toBe('n');
    expect(redactFor(s, null).captured[0].type).toBe('bulb');
    // Everything comes out at the end.
    expect(redactFor({ ...s, result: { winner: 'w', reason: 'resign' } }, 'w').captured[0].type).toBe('n');
  });
});
