import { ABANDON_MS } from '@spy/shared';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  port: Number(process.env.PORT ?? 8080),
  /** Overridable so tests don't wait a full minute. */
  abandonMs: Number(process.env.ABANDON_MS ?? ABANDON_MS),
};
