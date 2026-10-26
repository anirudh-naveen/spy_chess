import {
  type Board,
  type Color,
  type Piece,
  type PieceType,
  type Square,
  fileOf,
  other,
  rankOf,
  toIndex,
  toSquare,
} from './board.js';

export type ResultReason =
  | 'king-captured'
  | 'resign'
  | 'timeout'
  | 'abandon'
  | 'agreement'
  | 'no-moves'
  | 'insufficient'
  | 'abort';

export interface Result {
  /** null means a draw (or an abort). */
  winner: Color | null;
  reason: ResultReason;
}

export interface MoveRecord {
  from: Square;
  to: Square;
  color: Color;
  /** Id of the moving piece. */
  pieceId: string;
  /** Type of the captured piece; captures are revealed to both players. */
  captured?: PieceType;
  /** Promotion choice. Hidden from the opponent until the game ends. */
  promo?: PieceType;
}

export interface GameState {
  board: Board;
  turn: Color;
  moves: MoveRecord[];
  captured: { color: Color; type: PieceType }[];
  result: Result | null;
  /** Enemy piece ids each side has confirmed with a scout. */
  revealed: Record<Color, string[]>;
}

export interface MoveInput {
  from: Square;
  to: Square;
  promo?: PieceType;
}

export const PROMOTION_TYPES: PieceType[] = ['q', 'r', 'b', 'n'];

const KNIGHT: [number, number][] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING: [number, number][] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const CAMEL: [number, number][] = [
  [1, 3], [3, 1], [3, -1], [1, -3], [-1, -3], [-3, -1], [-3, 1], [-1, 3],
];
const JUMPER: [number, number][] = KING.flatMap(([df, dr]) => [[df, dr], [df * 2, dr * 2]] as [number, number][]);
const ROOK_DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export function newGame(board: Board): GameState {
  return { board, turn: 'w', moves: [], captured: [], result: null, revealed: scan(board, { w: [], b: [] }) };
}

/** Adds every enemy piece (except guards) next to one of a side's scouts to that side's revealed list. */
export function scan(board: Board, revealed: Record<Color, string[]>): Record<Color, string[]> {
  const out = { w: new Set(revealed.w), b: new Set(revealed.b) };
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.type !== 's') continue;
    for (const [df, dr] of KING) {
      const j = at(fileOf(i) + df, rankOf(i) + dr);
      const t = j >= 0 ? board[j] : null;
      // Guards are cloaked from scouts.
      if (t && t.color !== p.color && t.type !== 'g') out[p.color].add(t.id);
    }
  }
  return { w: [...out.w], b: [...out.b] };
}

function at(f: number, r: number): number {
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f;
}

export function pawnDir(c: Color): number {
  return c === 'w' ? 1 : -1;
}

export function lastRank(c: Color): number {
  return c === 'w' ? 7 : 0;
}

/**
 * Target indices for the piece on `from`. King-capture rules: no check
 * filtering, so pseudo-legal moves are the legal moves. No castling, no en passant.
 */
export function targetsFrom(board: Board, from: number): number[] {
  const p = board[from];
  if (!p) return [];
  const f = fileOf(from);
  const r = rankOf(from);
  const out: number[] = [];

  const tryStep = (df: number, dr: number) => {
    const i = at(f + df, r + dr);
    if (i < 0) return;
    const t = board[i];
    if (!t || t.color !== p.color) out.push(i);
  };
  const slide = (dirs: [number, number][]) => {
    for (const [df, dr] of dirs) {
      for (let k = 1; k < 8; k++) {
        const i = at(f + df * k, r + dr * k);
        if (i < 0) break;
        const t = board[i];
        if (!t) {
          out.push(i);
          continue;
        }
        if (t.color !== p.color) out.push(i);
        break;
      }
    }
  };

  switch (p.type) {
    case 'n':
      KNIGHT.forEach(([df, dr]) => tryStep(df, dr));
      break;
    case 'k':
    case 'g':
      KING.forEach(([df, dr]) => tryStep(df, dr));
      break;
    case 'r':
      slide(ROOK_DIRS);
      break;
    case 'b':
      slide(BISHOP_DIRS);
      break;
    case 'q':
      slide(ROOK_DIRS);
      slide(BISHOP_DIRS);
      break;
    case 'c':
      slide(ROOK_DIRS);
      KNIGHT.forEach(([df, dr]) => tryStep(df, dr));
      break;
    case 'a':
      slide(BISHOP_DIRS);
      KNIGHT.forEach(([df, dr]) => tryStep(df, dr));
      break;
    case 'j':
      JUMPER.forEach(([df, dr]) => tryStep(df, dr));
      break;
    case 'm':
      CAMEL.forEach(([df, dr]) => tryStep(df, dr));
      break;
    case 'l': {
      const d = pawnDir(p.color);
      slide([[0, d]]);
      ([[1, 0], [-1, 0], [0, -d]] as [number, number][]).forEach(([df, dr]) => tryStep(df, dr));
      break;
    }
    case 's':
    case 'p': {
      const d = pawnDir(p.color);
      const one = at(f, r + d);
      if (one >= 0 && !board[one]) {
        out.push(one);
        const two = at(f, r + 2 * d);
        if (!p.moved && two >= 0 && !board[two]) out.push(two);
      }
      for (const df of [-1, 1]) {
        const i = at(f + df, r + d);
        if (i >= 0 && board[i] && board[i]!.color !== p.color) out.push(i);
      }
      break;
    }
  }
  return out;
}

/** Legal destination squares for the side to move from `from`. */
export function legalMoves(state: GameState, from: Square): Square[] {
  const i = toIndex(from);
  if (state.result || i < 0) return [];
  const p = state.board[i];
  if (!p || p.color !== state.turn) return [];
  return targetsFrom(state.board, i).map(toSquare);
}

export function hasAnyMove(board: Board, color: Color): boolean {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.color === color && targetsFrom(board, i).length > 0) return true;
  }
  return false;
}

export function needsPromotion(board: Board, from: Square, to: Square): boolean {
  const p = board[toIndex(from)];
  return !!p && p.type === 'p' && rankOf(toIndex(to)) === lastRank(p.color);
}

function onlyKings(board: Board): boolean {
  return board.every((p) => !p || p.type === 'k');
}

/**
 * Applies a move for the side to move. Returns the new state, or an error string.
 * Does not mutate the input.
 */
export function applyMove(state: GameState, move: MoveInput): GameState | string {
  if (state.result) return 'Game is over';
  const from = toIndex(move.from);
  const to = toIndex(move.to);
  if (from < 0 || to < 0) return 'Bad square';
  const piece = state.board[from];
  if (!piece) return 'No piece on that square';
  if (piece.color !== state.turn) return 'Not your turn';
  if (!targetsFrom(state.board, from).includes(to)) return 'Illegal move';

  const board = state.board.slice();
  const target = board[to];
  const moved: Piece = { ...piece, moved: true };

  const record: MoveRecord = { from: move.from, to: move.to, color: piece.color, pieceId: piece.id };

  if (piece.type === 'p' && rankOf(to) === lastRank(piece.color)) {
    const promo = move.promo ?? 'q';
    if (!PROMOTION_TYPES.includes(promo)) return 'Bad promotion piece';
    moved.type = promo;
    record.promo = promo;
  }

  board[from] = null;
  board[to] = moved;

  const captured = state.captured.slice();
  if (target) {
    record.captured = target.type;
    captured.push({ color: target.color, type: target.type });
  }

  // A promoted piece is unknown again, even to a scout that had confirmed the pawn.
  const opp = other(piece.color);
  const revealed = {
    ...state.revealed,
    [opp]: record.promo ? state.revealed[opp].filter((id) => id !== piece.id) : state.revealed[opp],
  } as Record<Color, string[]>;

  const next: GameState = {
    board,
    turn: other(state.turn),
    moves: [...state.moves, record],
    captured,
    result: null,
    revealed: scan(board, revealed),
  };

  if (target?.type === 'k') {
    next.result = { winner: piece.color, reason: 'king-captured' };
  } else if (onlyKings(board)) {
    next.result = { winner: null, reason: 'insufficient' };
  } else if (!hasAnyMove(board, next.turn)) {
    next.result = { winner: null, reason: 'no-moves' };
  }
  return next;
}

/** Rebuilds a game from its starting board and move list. */
export function replay(board: Board, moves: MoveInput[]): GameState {
  let s = newGame(board);
  for (const m of moves) {
    const n = applyMove(s, m);
    if (typeof n === 'string') throw new Error(`Replay failed at ${m.from}-${m.to}: ${n}`);
    s = n;
  }
  return s;
}
