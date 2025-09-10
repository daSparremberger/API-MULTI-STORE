// src/routes/favorites.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export default async function favoriteRoutes(app: FastifyInstance) {
  // listar meus favoritos
  app.get('/favorites', { preHandler: [app.auth] }, async (req) => {
    const userId = (req.user as any).sub;
    const favs = await prisma.favorite.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' }
    });
    return favs;
  });

  // adicionar
  app.post('/favorites/:productId', { preHandler: [app.auth] }, async (req, reply) => {
    const { productId } = z.object({ productId: z.string() }).parse((req as any).params);
    const userId = (req.user as any).sub;
    await prisma.favorite.create({ data: { userId, productId } });
    return reply.code(201).send({ ok: true });
  });

  // remover
  app.delete('/favorites/:productId', { preHandler: [app.auth] }, async (req, reply) => {
    const { productId } = z.object({ productId: z.string() }).parse((req as any).params);
    const userId = (req.user as any).sub;
    await prisma.favorite.delete({ where: { userId_productId: { userId, productId } } });
    return reply.code(204).send();
  });
}
