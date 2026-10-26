export const START_RATING = 1000;
export const PROVISIONAL_GAMES = 30;

/** Expected score of a player rated `ra` against `rb`. */
export function expected(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

export function kFactor(gamesPlayed: number): number {
  return gamesPlayed < PROVISIONAL_GAMES ? 40 : 20;
}

/**
 * Whole-point rating change for a player. `score` is 1 (win), 0.5 (draw) or 0 (loss).
 * A decisive result always moves the rating by at least one point.
 */
export function ratingDelta(ra: number, rb: number, score: number, gamesPlayed: number): number {
  const d = Math.round(kFactor(gamesPlayed) * (score - expected(ra, rb)));
  if (score === 1) return Math.max(1, d);
  if (score === 0) return Math.min(-1, d);
  return d;
}

export interface Stakes {
  win: number;
  draw: number;
  loss: number;
}

/** What a player stands to gain or lose before the game, shown on the board. */
export function stakes(ra: number, rb: number, gamesPlayed: number): Stakes {
  return {
    win: ratingDelta(ra, rb, 1, gamesPlayed),
    draw: ratingDelta(ra, rb, 0.5, gamesPlayed),
    loss: ratingDelta(ra, rb, 0, gamesPlayed),
  };
}
