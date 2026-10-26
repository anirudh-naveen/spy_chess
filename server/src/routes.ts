import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RATING_COLUMNS, USER_COLUMNS, identify, modeRating } from './auth.js';
import { pool } from './db.js';
import type { GameManager } from './manager.js';

const mode = z.enum(['standard', 'armada']).default('standard');
const inviteBody = z.object({ color: z.enum(['w', 'b', 'random']).default('random'), mode }).default({});

export function apiRoutes(app: FastifyInstance, manager: GameManager) {
  app.get('/health', async () => ({ ok: true }));

  // Invite games are unrated and open to guests.
  app.post('/invites', async (req, reply) => {
    const who = identify(req);
    if (!who) return reply.code(401).send({ error: 'Missing session' });
    const parsed = inviteBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Bad color' });
    const g = await manager.createInvite(
      { id: who.id, name: who.name, guest: who.guest },
      parsed.data.color,
      parsed.data.mode,
    );
    return { id: g.id };
  });

  app.get<{ Querystring: { mode?: string } }>('/leaderboard', async (req) => {
    const m = mode.catch('standard').parse(req.query.mode);
    const col = RATING_COLUMNS[m];
    const r = await pool.query(
      `SELECT username, ${col.rating} AS rating, ${col.games} AS games FROM users WHERE ${col.games} > 0
       ORDER BY ${col.rating} DESC, ${col.games} DESC LIMIT 50`,
    );
    return { mode: m, players: r.rows.map((u) => ({ name: u.username, rating: u.rating, gamesPlayed: u.games })) };
  });

  app.get<{ Params: { name: string } }>('/users/:name', async (req, reply) => {
    const u = (
      await pool.query(`SELECT ${USER_COLUMNS}, created_at FROM users WHERE lower(username) = lower($1)`, [
        req.params.name,
      ])
    ).rows[0];
    if (!u) return reply.code(404).send({ error: 'No such player' });

    const history = await pool.query(
      'SELECT mode, after AS rating, at FROM rating_history WHERE user_id = $1 ORDER BY at ASC LIMIT 1000',
      [u.id],
    );
    const games = await pool.query(
      `SELECT g.id, g.rated, g.mode, g.white_name, g.black_name, g.white_user, g.result, g.ended_at,
              h.before, h.after
         FROM games g
         LEFT JOIN rating_history h ON h.game_id = g.id AND h.user_id = $1
        WHERE (g.white_user = $1 OR g.black_user = $1) AND g.status = 'over'
          AND coalesce(g.result->>'reason', '') <> 'abort'
        ORDER BY g.ended_at DESC LIMIT 20`,
      [u.id],
    );

    return {
      user: {
        name: u.username,
        ratings: { standard: modeRating(u, 'standard'), armada: modeRating(u, 'armada') },
        joined: u.created_at,
      },
      history: history.rows.map((h) => ({ mode: h.mode, rating: h.rating, at: h.at })),
      games: games.rows.map((g) => {
        const color = g.white_user === u.id ? 'w' : 'b';
        const winner = g.result?.winner ?? null;
        return {
          id: g.id,
          rated: g.rated,
          mode: g.mode,
          color,
          opponent: color === 'w' ? g.black_name : g.white_name,
          outcome: winner === null ? 'draw' : winner === color ? 'win' : 'loss',
          reason: g.result?.reason ?? null,
          ratingChange: g.before !== null ? g.after - g.before : null,
          endedAt: g.ended_at,
        };
      }),
    };
  });
}
