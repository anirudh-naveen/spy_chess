// Runs a throwaway Postgres for local development (no Docker needed).
// Data lives in server/.pgdata. Matches DATABASE_URL in .env.example.
import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const dir = new URL('../.pgdata', import.meta.url).pathname;
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: 5433, persistent: true });

const fresh = !existsSync(dir);
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('spychess');
console.log('Postgres running on localhost:5433 (db spychess). Ctrl+C to stop.');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
