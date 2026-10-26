import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { identify } from './auth.js';
import { pool } from './db.js';
import type { GameManager } from './manager.js';

const inviteBody = z.object({ color: z.enum(['w', 'b', 'random']).default('random') }).default({});

export function apiRoutes(app: FastifyInstance, manager: GameManager) {
  app.get('/health', async () => ({ ok: true }));

  // Invite games are unrated and open to guests.
  app.post('/invites', async (req, reply) => {
    const who = identify(req);
    if (!who) return reply.code(401).send({ error: 'Missing session' });
    const parsed = inviteBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Bad color' });
    const g = await manager.createInvite({ id: who.id, name: who.name, guest: who.guest }, parsed.data.color);
    return { id: g.id };
  });

  app.get('/leaderboard', async () => {
    const r = await pool.query(
      `SELECT username, rating, games_played FROM users WHERE games_played > 0
       ORDER BY rating DESC, games_played DESC LIMIT 50`,
    );
    return { players: r.rows.map((u) => ({ name: u.username, rating: u.rating, gamesPlayed: u.games_played })) };
  });

  app.get<{ Params: { name: string } }>('/users/:name', async (req, reply) => {
    const u = (
      await pool.query('SELECT id, username, rating, games_played, created_at FROM users WHERE lower(username) = lower($1)', [
        req.params.name,
      ])
    ).rows[0];
    if (!u) return reply.code(404).send({ error: 'No such player' });

    const history = await pool.query(
      'SELECT after AS rating, at FROM rating_history WHERE user_id = $1 ORDER BY at ASC LIMIT 500',
      [u.id],
    );
    const games = await pool.query(
      `SELECT g.id, g.rated, g.white_name, g.black_name, g.white_user, g.result, g.ended_at,
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
        rating: u.rating,
        gamesPlayed: u.games_played,
        joined: u.created_at,
      },
      history: history.rows.map((h) => ({ rating: h.rating, at: h.at })),
      games: games.rows.map((g) => {
        const color = g.white_user === u.id ? 'w' : 'b';
        const winner = g.result?.winner ?? null;
        return {
          id: g.id,
          rated: g.rated,
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
