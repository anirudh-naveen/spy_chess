import { hash, verify } from '@node-rs/argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import type { PublicUser } from '@spy/shared';
import { config } from './config.js';
import { pool } from './db.js';

/** Who is making a request: a registered user or a guest. */
export interface Identity {
  id: string;
  name: string;
  guest: boolean;
}

interface TokenPayload {
  sub: string;
  name: string;
  guest: boolean;
}

const guestSuffix = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5);
const guestId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

export function signToken(who: Identity): string {
  const payload: TokenPayload = { sub: who.id, name: who.name, guest: who.guest };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: who.guest ? '30d' : '60d' });
}

export function verifyToken(token: string | undefined | null): Identity | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret) as TokenPayload;
    return { id: p.sub, name: p.name, guest: !!p.guest };
  } catch {
    return null;
  }
}

export function identify(req: FastifyRequest): Identity | null {
  const h = req.headers.authorization;
  return verifyToken(h?.startsWith('Bearer ') ? h.slice(7) : null);
}

interface UserRow {
  id: string;
  username: string;
  rating: number;
  games_played: number;
}

export function publicUser(u: UserRow): PublicUser {
  return { id: u.id, name: u.username, guest: false, rating: u.rating, gamesPlayed: u.games_played };
}

export async function loadUser(id: string): Promise<UserRow | null> {
  const r = await pool.query('SELECT id, username, rating, games_played FROM users WHERE id = $1', [id]);
  return r.rows[0] ?? null;
}

/** PublicUser for any identity; registered users get their current rating. */
export async function describe(who: Identity): Promise<PublicUser | null> {
  if (who.guest) return { id: who.id, name: who.name, guest: true };
  const u = await loadUser(who.id);
  return u ? publicUser(u) : null;
}

const signupBody = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_-]{3,20}$/, 'Username must be 3–20 letters, numbers, _ or -'),
  email: z.string().trim().email('Enter a valid email').max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

const loginBody = z.object({
  login: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

export function authRoutes(app: FastifyInstance) {
  app.post('/auth/signup', async (req, reply) => {
    const parsed = signupBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { username, email, password } = parsed.data;
    const taken = await pool.query(
      'SELECT lower(username) = lower($1) AS name_taken FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)',
      [username, email],
    );
    if (taken.rows.length) {
      return reply
        .code(409)
        .send({ error: taken.rows.some((r) => r.name_taken) ? 'Username is taken' : 'Email is already registered' });
    }
    const r = await pool.query(
      'INSERT INTO users (username, email, pass_hash) VALUES ($1, $2, $3) RETURNING id, username, rating, games_played',
      [username, email, await hash(password)],
    );
    const user = r.rows[0] as UserRow;
    return { token: signToken({ id: user.id, name: user.username, guest: false }), user: publicUser(user) };
  });

  app.post('/auth/login', async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter your username and password' });
    const { login, password } = parsed.data;
    const r = await pool.query(
      'SELECT id, username, rating, games_played, pass_hash FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)',
      [login],
    );
    const row = r.rows[0];
    if (!row || !(await verify(row.pass_hash, password))) {
      return reply.code(401).send({ error: 'Wrong username or password' });
    }
    return { token: signToken({ id: row.id, name: row.username, guest: false }), user: publicUser(row) };
  });

  app.post('/auth/guest', async () => {
    const who: Identity = { id: `g_${guestId()}`, name: `Guest-${guestSuffix()}`, guest: true };
    return { token: signToken(who), user: { id: who.id, name: who.name, guest: true } satisfies PublicUser };
  });

  app.get('/me', async (req, reply) => {
    const who = identify(req);
    if (!who) return reply.code(401).send({ error: 'Not signed in' });
    const u = await describe(who);
    if (!u) return reply.code(401).send({ error: 'Account not found' });
    return { user: u };
  });
}
