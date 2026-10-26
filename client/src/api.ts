import type { PublicUser } from '@spy/shared';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8080';
export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

export class ApiError extends Error {}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: {
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export type AuthResponse = { token: string; user: PublicUser };

export interface Profile {
  user: { name: string; rating: number; gamesPlayed: number; joined: string };
  history: { rating: number; at: string }[];
  games: {
    id: string;
    rated: boolean;
    color: 'w' | 'b';
    opponent: string | null;
    outcome: 'win' | 'loss' | 'draw';
    reason: string | null;
    ratingChange: number | null;
    endedAt: string;
  }[];
}

export interface LeaderboardRow {
  name: string;
  rating: number;
  gamesPlayed: number;
}
