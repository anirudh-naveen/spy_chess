import type { Color, GameMode, Layout, PieceType, Square } from './board.js';
import type { Stakes } from './elo.js';
import type { Result } from './rules.js';
import type { GameView } from './view.js';

/** Single time control for now: 10+0. */
export const INITIAL_CLOCK_MS = 10 * 60 * 1000;
export const SETUP_MS = 60 * 1000;
/** Each side must make its first move within this window or the game is aborted. */
export const FIRST_MOVE_MS = 30 * 1000;
/** A player offline this long during play loses, if their opponent is still connected. */
export const ABANDON_MS = 60 * 1000;

export type Guess = PieceType;

export interface ModeRating {
  rating: number;
  games: number;
}

export interface PublicUser {
  id: string;
  name: string;
  guest: boolean;
  /** Registered users only: one rating per mode. */
  ratings?: Record<GameMode, ModeRating>;
}

export type GamePhase = 'waiting' | 'setup' | 'play' | 'over';

export interface SeatInfo {
  name: string;
  guest: boolean;
  rating?: number;
  connected: boolean;
}

export interface RatingChange {
  before: number;
  after: number;
}

/** Everything one viewer is allowed to know about a game. */
export interface GameSnapshot {
  id: string;
  rated: boolean;
  mode: GameMode;
  phase: GamePhase;
  you: Color | null;
  players: Record<Color, SeatInfo | null>;
  /** Server clock at send time, so clients can correct for skew. */
  serverNow: number;
  setup: {
    deadline: number;
    ready: Record<Color, boolean>;
    /** Your own current layout, never the opponent's. */
    yourLayout: Layout | null;
  } | null;
  view: GameView | null;
  clocks: Record<Color, number>;
  /** Whose clock is running, and since when (server time). */
  clockRunning: { color: Color; since: number } | null;
  /** Deadline for the pending first move, if any. */
  firstMoveDeadline: number | null;
  drawOffer: Color | null;
  /** When a disconnected player will lose by abandonment, per color. */
  abandonDeadline: Record<Color, number | null>;
  /** Your private marks: enemy piece id -> guessed type. */
  marks: Record<string, Guess>;
  stakes: Stakes | null;
  ratingChange: Record<Color, RatingChange> | null;
  result: Result | null;
}

export type ClientMsg =
  | { t: 'hello'; token: string }
  | { t: 'queue.join'; mode: GameMode }
  | { t: 'queue.leave' }
  | { t: 'game.join'; id: string }
  | { t: 'game.leave'; id: string }
  | { t: 'setup.submit'; id: string; layout: Layout; final: boolean }
  | { t: 'move'; id: string; from: Square; to: Square; promo?: PieceType }
  | { t: 'resign'; id: string }
  | { t: 'draw.offer'; id: string }
  | { t: 'draw.accept'; id: string }
  | { t: 'draw.decline'; id: string }
  | { t: 'mark'; id: string; pieceId: string; guess: Guess | null }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'hello.ok'; user: PublicUser }
  | { t: 'queue.status'; searching: boolean; since: number | null; mode: GameMode | null }
  | { t: 'match.found'; id: string }
  | { t: 'game.state'; game: GameSnapshot }
  | { t: 'error'; message: string; id?: string }
  | { t: 'pong' };
