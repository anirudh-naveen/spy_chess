import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@spy/shared';
import { type Identity, loadUser, verifyToken } from './auth.js';
import type { Seat } from './game.js';
import type { Conn, GameManager } from './manager.js';
import { Matchmaker } from './matchmaking.js';

class Connection implements Conn {
  who: Identity | null = null;
  constructor(private ws: WebSocket) {}
  get playerId() {
    return this.who?.id ?? null;
  }
  send(msg: ServerMsg) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }
}

export function wsRoutes(app: FastifyInstance, manager: GameManager) {
  const byPlayer = new Map<string, Set<Connection>>();

  const matchmaker = new Matchmaker(manager, (ids, gameId) => {
    for (const id of ids) {
      for (const c of byPlayer.get(id) ?? []) {
        c.send({ t: 'queue.status', searching: false, since: null });
        c.send({ t: 'match.found', id: gameId });
      }
    }
  });

  app.get('/ws', { websocket: true }, (socket) => {
    const conn = new Connection(socket);

    // Handle one message at a time per connection, so "hello" finishes before anything that depends on it.
    let queue = Promise.resolve();
    socket.on('message', (raw) => {
      queue = queue.then(async () => {
        let msg: ClientMsg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return conn.send({ t: 'error', message: 'Bad message' });
        }
        try {
          await handle(conn, msg);
        } catch (e) {
          app.log.error(e);
          conn.send({ t: 'error', message: 'Something went wrong' });
        }
      });
    });

    socket.on('close', () => {
      manager.disconnected(conn);
      if (!conn.who) return;
      const set = byPlayer.get(conn.who.id);
      set?.delete(conn);
      if (set && set.size === 0) {
        byPlayer.delete(conn.who.id);
        matchmaker.leave(conn.who.id);
      }
    });
  });

  async function handle(conn: Connection, msg: ClientMsg) {
    if (msg.t === 'ping') return conn.send({ t: 'pong' });

    if (msg.t === 'hello') {
      if (conn.who) return;
      const who = verifyToken(msg.token);
      if (!who) return conn.send({ t: 'error', message: 'Session expired, please sign in again' });
      let user;
      if (!who.guest) {
        const u = await loadUser(who.id);
        if (!u) return conn.send({ t: 'error', message: 'Account not found' });
        user = { id: u.id, name: u.username, guest: false, rating: u.rating, gamesPlayed: u.games_played };
      } else {
        user = { id: who.id, name: who.name, guest: true };
      }
      conn.who = who;
      if (!byPlayer.has(who.id)) byPlayer.set(who.id, new Set());
      byPlayer.get(who.id)!.add(conn);
      manager.connected(who.id);
      conn.send({ t: 'hello.ok', user });
      const since = matchmaker.since(who.id);
      if (since) conn.send({ t: 'queue.status', searching: true, since });
      return;
    }

    const who = conn.who;

    if (msg.t === 'game.join') {
      const game = await manager.get(msg.id);
      if (!game) return conn.send({ t: 'error', message: 'Game not found', id: msg.id });
      if (who && game.phase === 'waiting' && !game.colorOf(who.id)) {
        game.seat({ id: who.id, name: who.name, guest: who.guest });
      }
      return manager.watch(conn, game);
    }
    if (msg.t === 'game.leave') return manager.unwatch(conn, msg.id);

    if (!who) return conn.send({ t: 'error', message: 'Not connected yet' });

    if (msg.t === 'queue.join') {
      if (who.guest) return conn.send({ t: 'error', message: 'Sign in to play rated games' });
      const active = manager.activeRatedGame(who.id);
      if (active) return conn.send({ t: 'match.found', id: active.id });
      const u = await loadUser(who.id);
      if (!u) return conn.send({ t: 'error', message: 'Account not found' });
      const seat: Seat & { rating: number; games: number } = {
        id: u.id,
        name: u.username,
        guest: false,
        rating: u.rating,
        games: u.games_played,
      };
      const since = matchmaker.join(seat);
      // join() may have matched immediately; only report searching if still queued.
      if (matchmaker.since(who.id)) {
        for (const c of byPlayer.get(who.id) ?? []) c.send({ t: 'queue.status', searching: true, since });
      }
      return;
    }
    if (msg.t === 'queue.leave') {
      matchmaker.leave(who.id);
      for (const c of byPlayer.get(who.id) ?? []) c.send({ t: 'queue.status', searching: false, since: null });
      return;
    }

    // Everything below acts on a game the sender is seated in.
    const game = await manager.get((msg as { id: string }).id);
    if (!game) return conn.send({ t: 'error', message: 'Game not found' });
    const color = game.colorOf(who.id);
    if (!color) return conn.send({ t: 'error', message: 'You are not playing in this game', id: game.id });

    let err: string | null | void = null;
    switch (msg.t) {
      case 'setup.submit':
        err = game.submitLayout(color, msg.layout, !!msg.final);
        break;
      case 'move':
        err = game.move(color, { from: msg.from, to: msg.to, promo: msg.promo });
        break;
      case 'resign':
        game.resign(color);
        break;
      case 'draw.offer':
        err = game.offerDraw(color);
        break;
      case 'draw.accept':
        err = game.acceptDraw(color);
        break;
      case 'draw.decline':
        game.declineDraw(color);
        break;
      case 'mark':
        err = game.mark(who.id, color, msg.pieceId, msg.guess);
        break;
      default:
        err = 'Unknown message';
    }
    if (err) {
      conn.send({ t: 'error', message: err, id: game.id });
      // Resync the sender so an optimistic UI can roll back.
      manager.watch(conn, game);
    }
  }
}
