import { describe, expect, it } from 'vitest';
import {
  ARMADA_TYPES,
  PIECE_INFO,
  type Board,
  type GameState,
  type Layout,
  ARMADA_BUDGET,
  applyMove,
  boardFromLayouts,
  defaultLayout,
  emptyBoard,
  legalMoves,
  newGame,
  randomLayout,
  redactFor,
  setupSquares,
  squadPoints,
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

/** A board with both kings tucked away, plus whatever the test places. */
function withKings(): Board {
  const b = emptyBoard();
  place(b, 'a1', 'w', 'k');
  place(b, 'h8', 'b', 'k');
  return b;
}

describe('armada roster', () => {
  it('has twelve back-rank types including the classic pieces', () => {
    expect(ARMADA_TYPES).toHaveLength(12);
    for (const t of ['k', 'q', 'r', 'b', 'n'] as const) expect(ARMADA_TYPES).toContain(t);
    for (const t of ARMADA_TYPES) expect(PIECE_INFO[t].name).toBeTruthy();
  });
});

describe('armada setup', () => {
  it('accepts the default and random layouts', () => {
    for (const c of ['w', 'b'] as const) {
      expect(validateLayout(c, defaultLayout(c, 'armada'), 'armada')).toBeNull();
      for (let i = 0; i < 30; i++) expect(validateLayout(c, randomLayout(c, 'armada'), 'armada')).toBeNull();
    }
  });

  it('only the back rank can be rearranged', () => {
    expect(setupSquares('w', 'armada')).toEqual(['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1']);
    expect(setupSquares('b', 'armada')).toHaveLength(8);
    expect(setupSquares('w', 'standard')).toHaveLength(16);
  });

  it('pawns must stay on the second rank', () => {
    const l: Layout = { ...defaultLayout('w', 'armada'), a1: 'p', a2: 'r' };
    expect(validateLayout('w', l, 'armada')).toMatch(/Pawns stay/);
  });

  it('allows at most one of each piece and requires a king', () => {
    const dup: Layout = { ...defaultLayout('w', 'armada'), a1: 'q' };
    expect(validateLayout('w', dup, 'armada')).toMatch(/at most one/);
    const noKing: Layout = { ...defaultLayout('w', 'armada'), e1: 'g' };
    expect(validateLayout('w', noKing, 'armada')).toMatch(/king/);
  });

  it('standard layouts are not valid armadas and vice versa', () => {
    expect(validateLayout('w', defaultLayout('w'), 'armada')).not.toBeNull();
    expect(validateLayout('w', defaultLayout('w', 'armada'), 'standard')).not.toBeNull();
  });
});

describe('armada movement', () => {
  it('chancellor moves as rook and knight', () => {
    const b = withKings();
    place(b, 'd4', 'w', 'c');
    const m = legalMoves(newGame(b), 'd4');
    expect(m).toContain('d8');
    expect(m).toContain('a4');
    expect(m).toContain('e6');
    expect(m).not.toContain('e5');
  });

  it('archbishop moves as bishop and knight', () => {
    const b = withKings();
    place(b, 'd4', 'w', 'a');
    const m = legalMoves(newGame(b), 'd4');
    expect(m).toContain('g7');
    expect(m).toContain('c6');
    expect(m).not.toContain('d5');
  });

  it('jumper lands exactly two squares away in every direction, over pieces', () => {
    const b = withKings();
    place(b, 'd4', 'w', 'j');
    place(b, 'd5', 'w', 'p'); // jumped over
    place(b, 'e5', 'b', 'p'); // jumped over, not capturable
    place(b, 'f6', 'b', 'n'); // capturable
    place(b, 'b4', 'w', 'p'); // own piece blocks the landing square
    expect(legalMoves(newGame(b), 'd4').sort()).toEqual(['b2', 'b6', 'd2', 'd6', 'f2', 'f4', 'f6']);
  });

  it('camel makes long L jumps', () => {
    const b = withKings();
    place(b, 'd4', 'w', 'm');
    expect(legalMoves(newGame(b), 'd4').sort()).toEqual(['a3', 'a5', 'c1', 'c7', 'e1', 'e7', 'g3', 'g5']);
  });

  it('guard steps like a king and its capture does not end the game', () => {
    const b = withKings();
    place(b, 'd4', 'w', 'g');
    place(b, 'd8', 'b', 'r');
    expect(legalMoves(newGame(b), 'd4')).toHaveLength(8);
    const s = play(play(newGame(b), 'a1', 'a2'), 'd8', 'd4');
    expect(s.result).toBeNull();
  });

  it('lancer slides forward and steps sideways or back', () => {
    const b = withKings();
    place(b, 'd4', 'w', 'l');
    place(b, 'd7', 'b', 'p');
    expect(legalMoves(newGame(b), 'd4').sort()).toEqual(['c4', 'd3', 'd5', 'd6', 'd7', 'e4']);
    const b2 = withKings();
    place(b2, 'd5', 'b', 'l');
    const s = play(newGame(b2), 'a1', 'a2');
    expect(legalMoves(s, 'd5').sort()).toEqual(['c5', 'd1', 'd2', 'd3', 'd4', 'd6', 'e5']);
  });

  it('scout moves like a pawn but does not promote', () => {
    const b = withKings();
    place(b, 'c1', 'w', 's');
    expect(legalMoves(newGame(b), 'c1').sort()).toEqual(['c2', 'c3']);
    const b2 = withKings();
    place(b2, 'c7', 'w', 's', true);
    const s = play(newGame(b2), 'c7', 'c8');
    expect(s.board[toIndex('c8')]?.type).toBe('s');
    expect(s.moves[0].promo).toBeUndefined();
  });
});

describe('scout reveals', () => {
  it('confirms enemy pieces that end up next to it, permanently', () => {
    const b = withKings();
    place(b, 'd4', 'w', 's', true);
    place(b, 'f6', 'b', 'n');
    let s = newGame(b);
    expect(redactFor(s, 'w').board[toIndex('f6')]?.type).toBe('bulb');

    s = play(s, 'd4', 'd5'); // scout now touches e6, not f6
    s = play(s, 'f6', 'e4'); // knight lands next to the scout
    const v = redactFor(s, 'w').board[toIndex('e4')];
    expect(v).toMatchObject({ type: 'n', confirmed: true });

    s = play(s, 'a1', 'a2');
    s = play(s, 'e4', 'g3'); // walks away but stays known
    expect(redactFor(s, 'w').board[toIndex('g3')]?.type).toBe('n');
  });

  it("does not reveal anything to the other side or to spectators", () => {
    const b = withKings();
    place(b, 'd4', 'w', 's', true);
    place(b, 'e5', 'b', 'q');
    const s = newGame(b);
    expect(redactFor(s, 'w').board[toIndex('e5')]?.type).toBe('q');
    expect(redactFor(s, 'b').board[toIndex('d4')]?.type).toBe('bulb');
    expect(redactFor(s, null).board[toIndex('e5')]?.type).toBe('bulb');
  });

  it('a confirmed pawn that promotes becomes unknown again', () => {
    const b = withKings();
    place(b, 'b6', 'w', 's', true);
    place(b, 'c2', 'b', 'p', true);
    place(b, 'b1', 'w', 's', true);
    let s = newGame(b);
    expect(redactFor(s, 'w').board[toIndex('c2')]?.type).toBe('p');
    s = play(s, 'a1', 'a2');
    s = play(s, 'c2', 'c1', 'q'); // promotes next to the b1 scout, so it is rescanned
    expect(redactFor(s, 'w').board[toIndex('c1')]?.type).toBe('q');

    const b2 = withKings();
    place(b2, 'b3', 'w', 's', true);
    place(b2, 'c2', 'b', 'p', true);
    let s2 = play(newGame(b2), 'a1', 'a2');
    s2 = play(s2, 'c2', 'c1', 'n'); // promotes away from any scout
    expect(redactFor(s2, 'w').board[toIndex('c1')]?.type).toBe('bulb');
  });

  it('works from a full armada start', () => {
    const s = newGame(boardFromLayouts(defaultLayout('w', 'armada'), defaultLayout('b', 'armada')));
    expect(s.revealed).toEqual({ w: [], b: [] });
  });
});

describe('armada balance', () => {
  it('scouts cannot reveal guards', () => {
    const b = withKings();
    place(b, 'd4', 'w', 's', true);
    place(b, 'e5', 'b', 'g');
    place(b, 'c5', 'b', 'n');
    const v = redactFor(newGame(b), 'w');
    expect(v.board[toIndex('e5')]?.type).toBe('bulb');
    expect(v.board[toIndex('c5')]?.type).toBe('n');
  });

  it('every same-value piece has its own role', () => {
    const byValue = new Map<number, string[]>();
    for (const t of ARMADA_TYPES) {
      const v = PIECE_INFO[t].value;
      byValue.set(v, [...(byValue.get(v) ?? []), PIECE_INFO[t].role]);
    }
    for (const roles of byValue.values()) expect(new Set(roles).size).toBe(roles.length);
  });

  it('squad points sum the non-king back rank', () => {
    expect(squadPoints(defaultLayout('w', 'armada'))).toBe(5 + 3 + 3 + 9 + 2 + 2 + 3);
  });

  it('armadas must fit the point budget', () => {
    expect(squadPoints(defaultLayout('w', 'armada'))).toBeLessThanOrEqual(ARMADA_BUDGET);
    for (let i = 0; i < 50; i++) expect(squadPoints(randomLayout('b', 'armada'))).toBeLessThanOrEqual(ARMADA_BUDGET);
    // Queen, chancellor and archbishop together can't fit with four more pieces.
    const heavy: Layout = { ...defaultLayout('w', 'armada'), a1: 'c', b1: 'a', c1: 'r' };
    expect(squadPoints(heavy)).toBeGreaterThan(ARMADA_BUDGET);
    expect(validateLayout('w', heavy, 'armada')).toMatch(/limit is 30/);
  });
});
