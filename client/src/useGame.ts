import { useCallback, useEffect, useState } from 'react';
import {
  type Board,
  type Color,
  type GameSnapshot,
  type GameView,
  targetsFrom,
  toIndex,
  toSquare,
} from '@spy/shared';
import { socket } from './socket';

export interface LiveGame {
  game: GameSnapshot | null;
  /** serverNow - localNow when the snapshot arrived. */
  offset: number;
  error: string | null;
  notFound: boolean;
  /** Local, optimistic update until the server's next snapshot arrives. */
  patch(fn: (g: GameSnapshot) => GameSnapshot): void;
}

export function useGame(id: string): LiveGame {
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setGame(null);
    setNotFound(false);
    const off = socket.on((m) => {
      if (m.t === 'game.state' && m.game.id === id) {
        setGame(m.game);
        setOffset(m.game.serverNow - Date.now());
        setNotFound(false);
      } else if (m.t === 'error' && (m.id === id || m.id === undefined)) {
        if (m.message === 'Game not found') setNotFound(true);
        else setError(m.message);
      }
    });
    socket.watch(id);
    return () => {
      off();
      socket.unwatch(id);
    };
  }, [id]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  const patch = useCallback((fn: (g: GameSnapshot) => GameSnapshot) => setGame((g) => (g ? fn(g) : g)), []);

  return { game, offset, error, notFound, patch };
}

/**
 * Engine board for computing our own legal moves. Enemy types don't affect
 * where our pieces can go, so bulbs stand in as pawns.
 */
export function engineBoard(view: GameView): Board {
  const moved = new Set(view.moves.map((m) => m.pieceId));
  return view.board.map((p) =>
    p ? { id: p.id, color: p.color, type: p.type === 'bulb' ? 'p' : p.type, moved: moved.has(p.id) } : null,
  );
}

export function destsFor(view: GameView, you: Color | null) {
  const board = engineBoard(view);
  return (from: string) => {
    const i = toIndex(from);
    const p = board[i];
    if (!p || p.color !== you || view.turn !== you || view.result) return [];
    return targetsFrom(board, i).map(toSquare);
  };
}

/** Remaining time for a color, in ms, accounting for a running clock. */
export function remaining(game: GameSnapshot, color: Color, offset: number, now = Date.now()): number {
  const base = game.clocks[color];
  const run = game.clockRunning;
  if (run && run.color === color && game.phase === 'play') return Math.max(0, base - (now + offset - run.since));
  return base;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (ms < 10000) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `0:${String(Math.floor(ms / 1000)).padStart(2, '0')}.${tenths}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function useNow(intervalMs = 100) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
