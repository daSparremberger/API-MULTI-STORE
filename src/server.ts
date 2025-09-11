// src/server.ts
import Fastify, { FastifyRequest } from 'fastify';
import cors from '@fastify/cors';

import { env } from './env.js';
import jwtPlugin from './plugins/jwt.js';
import storePlugin from './plugins/store.js';

// Rotas
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import orderRoutes from './routes/orders.js';
import webhookRoutes from './routes/webhooks.js';

// -------- Logger seguro (sem quebrar no container) --------
const wantPretty =
  (process.env.LOG_PRETTY ?? (env.NODE_ENV === 'development' ? 'true' : 'false')) === 'true';

const loggerOptions = wantPretty
  ? {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    }
  : {
      level: process.env.LOG_LEVEL ?? 'info',
    };

export const app = Fastify({ logger: loggerOptions });

// -------- CORS --------
await app.register(cors, {
  origin:
    env.NODE_ENV === 'development'
      ? true
      : (process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) ?? []),
  credentials: true,
});

// -------- Plugins --------
await app.register(jwtPlugin);
await app.register(storePlugin);

// -------- Rotas --------
await app.register(authRoutes, { prefix: '/auth' });
await app.register(catalogRoutes, { prefix: '/catalog' });
await app.register(orderRoutes, { prefix: '/orders' });
await app.register(webhookRoutes, { prefix: '/webhooks' });

// -------- Healthcheck & raiz --------
app.get('/_health', async () => ({
  status: 'ok',
  env: env.NODE_ENV,
}));

app.get('/', async (req: FastifyRequest) => {
  const store = (req as any).store as { id: string; name: string } | undefined;
  return {
    name: 'franquia-api',
    ok: true,
    store: store ? { id: store.id, name: store.name } : null,
  };
});

// -------- Boot --------
const port = Number(env.PORT ?? 3000);

try {
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`API up on :${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// -------- Shutdown gracioso --------
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  });
}
