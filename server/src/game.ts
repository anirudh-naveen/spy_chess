import {
  type Color,
  type GamePhase,
  type GameSnapshot,
  type GameState,
  type Guess,
  type Layout,
  type MoveInput,
  type RatingChange,
  type Result,
  FIRST_MOVE_MS,
  INITIAL_CLOCK_MS,
  PROMOTION_TYPES,
  SETUP_MS,
  applyMove,
  boardFromLayouts,
  other,
  randomLayout,
  ratingDelta,
  redactFor,
  replay,
  stakes,
  validateLayout,
} from '@spy/shared';
import { pool, tx } from './db.js';

export interface Seat {
  /** Player id: a user uuid or a "g_..." guest id. */
  id: string;
  name: string;
  guest: boolean;
  /** Rating and game count when the game was created (rated games only). */
  rating?: number;
  games?: number;
}

const GUESS_TYPES = new Set<Guess>(['k', 'q', 'r', 'b', 'n', 'p']);

/** Persisted alongside the game row so a live game can be restored after a restart. */
interface Runtime {
  seats: Record<Color, Seat | null>;
  ready: Record<Color, boolean>;
  setupDeadline: number;
  turnStart: number | null;
  firstMoveDeadline: number | null;
  drawOffer: Color | null;
  ratingChange: Record<Color, RatingChange> | null;
  savedAt: number;
}

type Listener = (game: Game) => void;

export class Game {
  phase: GamePhase = 'waiting';
  seats: Record<Color, Seat | null> = { w: null, b: null };
  layouts: Record<Color, Layout | null> = { w: null, b: null };
  ready: Record<Color, boolean> = { w: false, b: false };
  setupDeadline = 0;
  state: GameState | null = null;
  clocks: Record<Color, number> = { w: INITIAL_CLOCK_MS, b: INITIAL_CLOCK_MS };
  /** When the side to move's clock started. Null until both sides have made a first move. */
  turnStart: number | null = null;
  firstMoveDeadline: number | null = null;
  drawOffer: Color | null = null;
  ratingChange: Record<Color, RatingChange> | null = null;
  /** player id -> enemy piece id -> guess */
  marks = new Map<string, Map<string, Guess>>();

  private timer: NodeJS.Timeout | null = null;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    readonly id: string,
    readonly rated: boolean,
    readonly creator: string | null,
    private readonly onChange: Listener,
  ) {}

  colorOf(playerId: string | undefined): Color | null {
    if (!playerId) return null;
    if (this.seats.w?.id === playerId) return 'w';
    if (this.seats.b?.id === playerId) return 'b';
    return null;
  }

  get result(): Result | null {
    return this.state?.result ?? null;
  }

  // ---- lifecycle ---------------------------------------------------------

  /** Seats a second player in a waiting invite game. Returns false if not possible. */
  seat(who: Seat): boolean {
    if (this.phase !== 'waiting' || this.colorOf(who.id)) return false;
    const open: Color | null = !this.seats.w ? 'w' : !this.seats.b ? 'b' : null;
    if (!open) return false;
    this.seats[open] = who;
    this.startSetup();
    return true;
  }

  startSetup(now = Date.now()) {
    this.phase = 'setup';
    this.setupDeadline = now + SETUP_MS;
    this.commit();
  }

  submitLayout(color: Color, layout: Layout, final: boolean): string | null {
    if (this.phase !== 'setup') return 'Setup is over';
    if (this.ready[color]) return 'Your setup is already locked in';
    const err = validateLayout(color, layout);
    if (err) return err;
    this.layouts[color] = { ...layout };
    if (final) this.ready[color] = true;
    if (this.ready.w && this.ready.b) this.startPlay();
    else if (final) this.commit();
    else this.save();
    return null;
  }

  private startPlay(now = Date.now()) {
    for (const c of ['w', 'b'] as const) {
      if (!this.layouts[c] || validateLayout(c, this.layouts[c]) !== null) this.layouts[c] = randomLayout(c);
      this.ready[c] = true;
    }
    this.state = { board: boardFromLayouts(this.layouts.w!, this.layouts.b!), turn: 'w', moves: [], captured: [], result: null };
    this.phase = 'play';
    this.firstMoveDeadline = now + FIRST_MOVE_MS;
    this.commit();
  }

  move(color: Color, input: MoveInput, now = Date.now()): string | null {
    if (this.phase !== 'play' || !this.state) return 'The game is not in progress';
    if (this.state.turn !== color) return 'Not your turn';
    if (input.promo !== undefined && !PROMOTION_TYPES.includes(input.promo)) return 'Bad promotion piece';

    // Charge the mover's clock first; a flagged player can't sneak a move in.
    if (this.turnStart !== null) {
      const left = this.clocks[color] - (now - this.turnStart);
      if (left <= 0) {
        this.clocks[color] = 0;
        this.timeout(color);
        return 'Out of time';
      }
    }

    const next = applyMove(this.state, { from: input.from, to: input.to, promo: input.promo });
    if (typeof next === 'string') return next;

    if (this.turnStart !== null) this.clocks[color] -= now - this.turnStart;
    this.state = next;
    if (this.drawOffer && this.drawOffer !== color) this.drawOffer = null;

    const n = next.moves.length;
    if (n === 1) {
      this.firstMoveDeadline = now + FIRST_MOVE_MS;
    } else if (n === 2) {
      this.firstMoveDeadline = null;
      this.turnStart = now;
    } else {
      this.turnStart = now;
    }

    if (next.result) {
      void this.finish(next.result);
      return null;
    }
    this.commit();
    return null;
  }

  resign(color: Color) {
    if (this.phase === 'over' || this.phase === 'waiting') return;
    // Leaving before any move is played just cancels the game.
    if (this.phase === 'setup' || !this.state || this.state.moves.length === 0) {
      return this.abort();
    }
    void this.finish({ winner: other(color), reason: 'resign' });
  }

  offerDraw(color: Color): string | null {
    if (this.phase !== 'play' || !this.state?.moves.length) return 'You can offer a draw after the first move';
    if (this.drawOffer === other(color)) return this.acceptDraw(color);
    this.drawOffer = color;
    this.commit();
    return null;
  }

  acceptDraw(color: Color): string | null {
    if (this.phase !== 'play' || this.drawOffer !== other(color)) return 'No draw offer to accept';
    void this.finish({ winner: null, reason: 'agreement' });
    return null;
  }

  declineDraw(color: Color) {
    if (this.drawOffer === other(color)) {
      this.drawOffer = null;
      this.commit();
    }
  }

  mark(playerId: string, color: Color, pieceId: string, guess: Guess | null): string | null {
    if (typeof pieceId !== 'string' || !pieceId.startsWith(`${other(color)}:`)) return 'You can only mark enemy pieces';
    if (guess !== null && !GUESS_TYPES.has(guess)) return 'Bad guess';
    let m = this.marks.get(playerId);
    if (!m) this.marks.set(playerId, (m = new Map()));
    if (guess) m.set(pieceId, guess);
    else m.delete(pieceId);
    const q = guess
      ? pool.query(
          `INSERT INTO marks (game_id, player, piece_id, guess) VALUES ($1, $2, $3, $4)
           ON CONFLICT (game_id, player, piece_id) DO UPDATE SET guess = EXCLUDED.guess`,
          [this.id, playerId, pieceId, guess],
        )
      : pool.query('DELETE FROM marks WHERE game_id = $1 AND player = $2 AND piece_id = $3', [this.id, playerId, pieceId]);
    q.catch((e) => console.error('mark save failed', e));
    this.onChange(this);
    return null;
  }

  private abort() {
    if (!this.state) {
      // Still in setup: there's no board yet, so build an empty result-only state.
      this.state = { board: [], turn: 'w', moves: [], captured: [], result: null };
    }
    void this.finish({ winner: null, reason: 'abort' });
  }

  private timeout(color: Color) {
    const opp = other(color);
    const oppHasMaterial = this.state!.board.some((p) => p && p.color === opp && p.type !== 'k');
    void this.finish({ winner: oppHasMaterial ? opp : null, reason: 'timeout' });
  }

  private async finish(result: Result) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    if (this.turnStart !== null && this.state && result.reason !== 'timeout') {
      // Charge whoever is on move for the time used so far. After a game-ending move this is ~0.
      this.clocks[this.state.turn] = Math.max(0, this.clocks[this.state.turn] - (Date.now() - this.turnStart));
    }
    this.state = { ...this.state!, result };
    this.turnStart = null;
    this.firstMoveDeadline = null;
    this.drawOffer = null;
    this.clearTimer();

    if (this.rated && result.reason !== 'abort') {
      try {
        this.ratingChange = await applyRatings(this, result);
      } catch (e) {
        console.error('rating update failed', e);
      }
    }
    this.commit();
  }

  // ---- deadlines ---------------------------------------------------------

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    this.clearTimer();
    const at = this.nextDeadline();
    if (at === null) return;
    this.timer = setTimeout(() => this.onDeadline(), Math.max(0, at - Date.now()) + 10);
  }

  private nextDeadline(): number | null {
    if (this.phase === 'setup') return this.setupDeadline;
    if (this.phase !== 'play' || !this.state) return null;
    if (this.firstMoveDeadline !== null) return this.firstMoveDeadline;
    if (this.turnStart !== null) return this.turnStart + this.clocks[this.state.turn];
    return null;
  }

  private onDeadline(now = Date.now()) {
    this.timer = null;
    if (this.phase === 'setup' && now >= this.setupDeadline) return this.startPlay(now);
    if (this.phase === 'play' && this.state) {
      if (this.firstMoveDeadline !== null && now >= this.firstMoveDeadline) return this.abort();
      if (this.turnStart !== null && now - this.turnStart >= this.clocks[this.state.turn]) {
        this.clocks[this.state.turn] = 0;
        return this.timeout(this.state.turn);
      }
    }
    this.schedule();
  }

  // ---- views & persistence ----------------------------------------------

  snapshot(viewerId: string | undefined, online: (playerId: string) => boolean): GameSnapshot {
    const you = this.colorOf(viewerId);
    const seatInfo = (c: Color) => {
      const s = this.seats[c];
      return s ? { name: s.name, guest: s.guest, rating: s.rating, connected: online(s.id) } : null;
    };
    const mine = you ? this.seats[you] : null;
    const theirs = you ? this.seats[other(you)] : null;
    return {
      id: this.id,
      rated: this.rated,
      phase: this.phase,
      you,
      players: { w: seatInfo('w'), b: seatInfo('b') },
      serverNow: Date.now(),
      setup:
        this.phase === 'setup'
          ? { deadline: this.setupDeadline, ready: { ...this.ready }, yourLayout: you ? this.layouts[you] : null }
          : null,
      view: this.state && this.phase !== 'setup' && this.state.board.length ? redactFor(this.state, you) : null,
      clocks: { ...this.clocks },
      clockRunning:
        this.phase === 'play' && this.turnStart !== null && this.state
          ? { color: this.state.turn, since: this.turnStart }
          : null,
      firstMoveDeadline: this.firstMoveDeadline,
      drawOffer: this.drawOffer,
      marks: viewerId && you ? Object.fromEntries(this.marks.get(viewerId) ?? []) : {},
      stakes:
        this.rated && mine?.rating !== undefined && theirs?.rating !== undefined && this.phase !== 'over'
          ? stakes(mine.rating, theirs.rating, mine.games ?? 0)
          : null,
      ratingChange: this.ratingChange,
      result: this.result,
    };
  }

  /** Persist, reschedule deadlines and notify watchers. */
  private commit() {
    this.schedule();
    this.save();
    this.onChange(this);
  }

  save() {
    this.saving = this.saving.then(() => this.write()).catch((e) => console.error(`save ${this.id} failed`, e));
    return this.saving;
  }

  private async write() {
    const runtime: Runtime = {
      seats: this.seats,
      ready: this.ready,
      setupDeadline: this.setupDeadline,
      turnStart: this.turnStart,
      firstMoveDeadline: this.firstMoveDeadline,
      drawOffer: this.drawOffer,
      ratingChange: this.ratingChange,
      savedAt: Date.now(),
    };
    const userId = (s: Seat | null) => (s && !s.guest ? s.id : null);
    await pool.query(
      `INSERT INTO games (id, rated, status, creator, white, black, white_name, black_name, white_user, black_user,
                          setup_white, setup_black, moves, clocks, runtime, result, ended_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, white = EXCLUDED.white, black = EXCLUDED.black,
         white_name = EXCLUDED.white_name, black_name = EXCLUDED.black_name,
         white_user = EXCLUDED.white_user, black_user = EXCLUDED.black_user,
         setup_white = EXCLUDED.setup_white, setup_black = EXCLUDED.setup_black,
         moves = EXCLUDED.moves, clocks = EXCLUDED.clocks, runtime = EXCLUDED.runtime,
         result = EXCLUDED.result, ended_at = EXCLUDED.ended_at`,
      [
        this.id,
        this.rated,
        this.phase,
        this.creator,
        this.seats.w?.id ?? null,
        this.seats.b?.id ?? null,
        this.seats.w?.name ?? null,
        this.seats.b?.name ?? null,
        userId(this.seats.w),
        userId(this.seats.b),
        JSON.stringify(this.layouts.w),
        JSON.stringify(this.layouts.b),
        JSON.stringify(this.state?.moves ?? []),
        JSON.stringify(this.clocks),
        JSON.stringify(runtime),
        JSON.stringify(this.result),
        this.phase === 'over' ? new Date() : null,
      ],
    );
  }

  /** Rebuilds a game from its database row. Time spent while the server was down is given back. */
  static fromRow(row: any, marks: { player: string; piece_id: string; guess: Guess }[], onChange: Listener): Game {
    const g = new Game(row.id, row.rated, row.creator, onChange);
    const rt: Runtime = row.runtime;
    const shift = (t: number | null) => (t === null ? null : t + (Date.now() - rt.savedAt));
    g.phase = row.status;
    g.seats = rt.seats;
    g.ready = rt.ready;
    g.layouts = { w: row.setup_white, b: row.setup_black };
    g.clocks = row.clocks ?? g.clocks;
    g.drawOffer = rt.drawOffer;
    g.ratingChange = rt.ratingChange;
    const live = row.status === 'setup' || row.status === 'play';
    g.setupDeadline = live ? shift(rt.setupDeadline)! : rt.setupDeadline;
    g.turnStart = live ? shift(rt.turnStart) : null;
    g.firstMoveDeadline = live ? shift(rt.firstMoveDeadline) : null;
    if (g.layouts.w && g.layouts.b && (row.status === 'play' || row.status === 'over')) {
      const s = replay(boardFromLayouts(g.layouts.w, g.layouts.b), row.moves);
      g.state = row.result ? { ...s, result: row.result } : s;
    } else if (row.result) {
      g.state = { board: [], turn: 'w', moves: [], captured: [], result: row.result };
    }
    for (const m of marks) {
      if (!g.marks.has(m.player)) g.marks.set(m.player, new Map());
      g.marks.get(m.player)!.set(m.piece_id, m.guess);
    }
    if (live) g.schedule();
    return g;
  }

  dispose() {
    this.clearTimer();
  }
}

/** Applies Elo to both players in one transaction, using their ratings at the moment the game ends. */
async function applyRatings(game: Game, result: Result): Promise<Record<Color, RatingChange>> {
  const w = game.seats.w!;
  const b = game.seats.b!;
  return tx(async (c) => {
    const rows = await c.query('SELECT id, rating, games_played FROM users WHERE id = ANY($1) FOR UPDATE', [[w.id, b.id]]);
    const byId = new Map(rows.rows.map((r) => [r.id, r]));
    const rw = byId.get(w.id);
    const rb = byId.get(b.id);
    if (!rw || !rb) throw new Error('rated game player missing');
    const scoreW = result.winner === 'w' ? 1 : result.winner === 'b' ? 0 : 0.5;
    const dW = ratingDelta(rw.rating, rb.rating, scoreW, rw.games_played);
    const dB = ratingDelta(rb.rating, rw.rating, 1 - scoreW, rb.games_played);
    const change = {
      w: { before: rw.rating, after: rw.rating + dW },
      b: { before: rb.rating, after: rb.rating + dB },
    };
    for (const [seat, ch] of [[w, change.w], [b, change.b]] as const) {
      await c.query('UPDATE users SET rating = $2, games_played = games_played + 1 WHERE id = $1', [seat.id, ch.after]);
    }
    // The game row must exist before rating_history can reference it.
    await c.query(
      `INSERT INTO games (id, rated, status) VALUES ($1, true, 'over') ON CONFLICT (id) DO NOTHING`,
      [game.id],
    );
    await c.query(
      'INSERT INTO rating_history (user_id, game_id, before, after) VALUES ($1,$2,$3,$4), ($5,$2,$6,$7)',
      [w.id, game.id, change.w.before, change.w.after, b.id, change.b.before, change.b.after],
    );
    return change;
  });
}
