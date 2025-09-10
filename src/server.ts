// src/server.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.js';
import { prisma } from './lib/prisma.js';
import jwtPlugin from './plugins/jwt.js';

// Importação das rotas
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import catalogRoutes from './routes/catalog.js';
import orderRoutes from './routes/orders.js';

async function bootstrap() {
  const app = Fastify({
    logger: {
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  });

  await app.register(cors, {
    origin: true, // Em produção, mude para env.FRONTEND_URL
    credentials: true,
  });

  await app.register(jwtPlugin);

  // Rotas
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(userRoutes, { prefix: '/me' });
  await app.register(catalogRoutes, { prefix: '/products' });
  await app.register(orderRoutes, { prefix: '/orders' });

  // Health Check
  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, timestamp: new Date().toISOString() };
  });

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();