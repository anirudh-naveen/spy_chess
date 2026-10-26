import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { authRoutes } from './auth.js';
import { config } from './config.js';
import { migrate } from './db.js';
import { GameManager } from './manager.js';
import { apiRoutes } from './routes.js';
import { wsRoutes } from './ws.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 64 * 1024 });

await app.register(cors, { origin: config.clientOrigins, methods: ['GET', 'POST'] });
await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

await migrate();
const manager = new GameManager();
await manager.restore();

authRoutes(app);
apiRoutes(app, manager);
await app.register(async (scoped) => wsRoutes(scoped, manager));

await app.listen({ port: config.port, host: '0.0.0.0' });
