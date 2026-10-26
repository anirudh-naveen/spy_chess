import { customAlphabet } from 'nanoid';
import type { Color, ServerMsg } from '@spy/shared';
import { pool } from './db.js';
import { Game, type Seat } from './game.js';

const gameId = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 10);

/** Finished games stay in memory briefly so late viewers don't hit the database. */
const EVICT_AFTER_MS = 10 * 60 * 1000;

export interface Conn {
  playerId: string | null;
  send(msg: ServerMsg): void;
}

/** Owns every live game and the set of connections watching each one. */
export class GameManager {
  private games = new Map<string, Game>();
  private watchers = new Map<string, Set<Conn>>();
  private online = new Map<string, number>();

  isOnline = (playerId: string) => (this.online.get(playerId) ?? 0) > 0;

  connected(playerId: string) {
    this.online.set(playerId, (this.online.get(playerId) ?? 0) + 1);
    this.broadcastPresence(playerId);
  }

  disconnected(conn: Conn) {
    for (const set of this.watchers.values()) set.delete(conn);
    if (!conn.playerId) return;
    const n = (this.online.get(conn.playerId) ?? 1) - 1;
    if (n <= 0) this.online.delete(conn.playerId);
    else this.online.set(conn.playerId, n);
    this.broadcastPresence(conn.playerId);
  }

  /** Loads unfinished games after a restart. */
  async restore() {
    const rows = (await pool.query(`SELECT * FROM games WHERE status IN ('waiting', 'setup', 'play')`)).rows;
    for (const row of rows) {
      try {
        this.games.set(row.id, Game.fromRow(row, await this.loadMarks(row.id), this.changed));
      } catch (e) {
        console.error(`could not restore game ${row.id}`, e);
      }
    }
    if (rows.length) console.log(`restored ${rows.length} game(s)`);
  }

  async get(id: string): Promise<Game | null> {
    const live = this.games.get(id);
    if (live) return live;
    if (typeof id !== 'string' || !/^[a-z0-9]{6,20}$/.test(id)) return null;
    const row = (await pool.query('SELECT * FROM games WHERE id = $1', [id])).rows[0];
    if (!row || !row.runtime) return null;
    const g = Game.fromRow(row, await this.loadMarks(id), this.changed);
    this.games.set(id, g);
    if (g.phase === 'over') this.scheduleEvict(g);
    return g;
  }

  async createInvite(creator: Seat, color: Color | 'random'): Promise<Game> {
    const g = new Game(gameId(), false, creator.id, this.changed);
    const c: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    g.seats[c] = creator;
    this.games.set(g.id, g);
    await g.save();
    return g;
  }

  createMatch(a: Seat, b: Seat): Game {
    const g = new Game(gameId(), true, null, this.changed);
    const [w, bl] = Math.random() < 0.5 ? [a, b] : [b, a];
    g.seats = { w, b: bl };
    this.games.set(g.id, g);
    g.startSetup();
    return g;
  }

  /** A player's unfinished rated game, if any. */
  activeRatedGame(playerId: string): Game | null {
    for (const g of this.games.values()) {
      if (g.rated && g.phase !== 'over' && g.colorOf(playerId)) return g;
    }
    return null;
  }

  watch(conn: Conn, game: Game) {
    let set = this.watchers.get(game.id);
    if (!set) this.watchers.set(game.id, (set = new Set()));
    set.add(conn);
    conn.send({ t: 'game.state', game: game.snapshot(conn.playerId ?? undefined, this.isOnline) });
  }

  unwatch(conn: Conn, id: string) {
    this.watchers.get(id)?.delete(conn);
  }

  private changed = (game: Game) => {
    for (const conn of this.watchers.get(game.id) ?? []) {
      conn.send({ t: 'game.state', game: game.snapshot(conn.playerId ?? undefined, this.isOnline) });
    }
    if (game.phase === 'over') this.scheduleEvict(game);
  };

  private broadcastPresence(playerId: string) {
    for (const g of this.games.values()) {
      if (g.phase !== 'over' && g.colorOf(playerId)) this.changed(g);
    }
  }

  private evicting = new Set<string>();

  private scheduleEvict(game: Game) {
    if (this.evicting.has(game.id)) return;
    this.evicting.add(game.id);
    setTimeout(() => {
      this.evicting.delete(game.id);
      if (this.games.get(game.id) === game && game.phase === 'over') {
        game.dispose();
        this.games.delete(game.id);
        this.watchers.delete(game.id);
      }
    }, EVICT_AFTER_MS).unref();
  }

  private async loadMarks(id: string) {
    return (await pool.query('SELECT player, piece_id, guess FROM marks WHERE game_id = $1', [id])).rows;
  }
}
