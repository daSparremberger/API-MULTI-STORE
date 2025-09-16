// src/server.ts
import Fastify, { FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { Store } from '@prisma/client';

import { env } from './env.js';
import { prisma } from './lib/prisma.js';
import jwtPlugin from './plugins/jwt.js';
import storePlugin from './plugins/store.js';

// Rotas
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import orderRoutes from './routes/orders.js';
import webhookRoutes from './routes/webhooks.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';

const app = Fastify({
  logger: true
});

// --- CORREÇÃO AQUI ---
// Configuração de CORS mais explícita e robusta
await app.register(cors, {
  origin: [
    'http://localhost:5173', // Sua URL de desenvolvimento do front-end
    'https://forfitalimentos.com.br' 
  ],
  credentials: true,
});

// Plugins
await app.register(jwtPlugin);
await app.register(storePlugin);

// Rotas
await app.register(authRoutes, { prefix: '/auth' });
await app.register(catalogRoutes, { prefix: '/catalog' });
await app.register(orderRoutes, { prefix: '/orders' });
await app.register(userRoutes, { prefix: '/me' });
await app.register(webhookRoutes);
await app.register(adminRoutes, { prefix: '/admin' });

// Healthcheck
app.get('/health', async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { ok: true };
});

// Root
app.get('/', async (req: FastifyRequest) => {
  const store = (req as any).store as Store | null;
  return {
    name: 'franquia-api',
    ok: true,
    store: store ? { id: store.id, name: store.name } : null
  };
});

// Start
app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`API up on :${env.PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });