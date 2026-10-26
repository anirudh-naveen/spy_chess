import type { GameManager } from './manager.js';
import type { Seat } from './game.js';

interface Entry {
  seat: Seat & { rating: number; games: number };
  since: number;
}

const BASE_WINDOW = 100;
const WIDEN_BY = 50;
const WIDEN_EVERY_MS = 5000;

/** Rated queue: pairs the closest ratings, widening the acceptable gap the longer someone waits. */
export class Matchmaker {
  private queue = new Map<string, Entry>();
  private timer: NodeJS.Timeout;

  constructor(
    private manager: GameManager,
    private onMatch: (playerIds: [string, string], gameId: string) => void,
  ) {
    this.timer = setInterval(() => this.pair(), 1000);
    this.timer.unref();
  }

  join(seat: Entry['seat']): number {
    const existing = this.queue.get(seat.id);
    if (existing) return existing.since;
    const since = Date.now();
    this.queue.set(seat.id, { seat, since });
    this.pair();
    return since;
  }

  leave(playerId: string) {
    this.queue.delete(playerId);
  }

  since(playerId: string): number | null {
    return this.queue.get(playerId)?.since ?? null;
  }

  private window(e: Entry, now: number) {
    return BASE_WINDOW + WIDEN_BY * Math.floor((now - e.since) / WIDEN_EVERY_MS);
  }

  private pair(now = Date.now()) {
    const waiting = [...this.queue.values()].sort((a, b) => a.since - b.since);
    const taken = new Set<string>();
    for (const a of waiting) {
      if (taken.has(a.seat.id)) continue;
      let best: Entry | null = null;
      for (const b of waiting) {
        if (b === a || taken.has(b.seat.id)) continue;
        const gap = Math.abs(a.seat.rating - b.seat.rating);
        if (gap > Math.min(this.window(a, now), this.window(b, now))) continue;
        if (!best || gap < Math.abs(a.seat.rating - best.seat.rating)) best = b;
      }
      if (!best) continue;
      taken.add(a.seat.id).add(best.seat.id);
      this.queue.delete(a.seat.id);
      this.queue.delete(best.seat.id);
      const g = this.manager.createMatch(a.seat, best.seat);
      this.onMatch([a.seat.id, best.seat.id], g.id);
    }
  }
}
