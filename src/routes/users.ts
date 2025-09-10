// src/routes/users.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

/**
 * Prefix definido no server: /me
 * Endpoints aqui viram, por exemplo:
 *  - GET    /me/favorites
 *  - POST   /me/favorites/:productId
 *  - DELETE /me/favorites/:productId
 *  - GET    /me/addresses
 *  - POST   /me/addresses
 *  - PATCH  /me/addresses/:id
 *  - DELETE /me/addresses/:id
 */
export default async function userRoutes(app: FastifyInstance) {
  /**
   * FAVORITES
   */
  app.get('/favorites', { preHandler: [app.auth] }, async (req) => {
    const userId = (req.user as any).sub;
    const favs = await prisma.favorite.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
    return favs;
  });

  app.post('/favorites/:productId', { preHandler: [app.auth] }, async (req, reply) => {
    const { productId } = z.object({ productId: z.string() }).parse((req as any).params);
    const userId = (req.user as any).sub;

    // upsert-like: se já existir, retorna 200; se não, cria
    try {
      await prisma.favorite.create({ data: { userId, productId } });
      return reply.code(201).send({ ok: true });
    } catch {
      // conflito de unique (userId, productId) -> já existe
      return reply.send({ ok: true });
    }
  });

  app.delete('/favorites/:productId', { preHandler: [app.auth] }, async (req, reply) => {
    const { productId } = z.object({ productId: z.string() }).parse((req as any).params);
    const userId = (req.user as any).sub;

    await prisma.favorite.delete({
      where: { userId_productId: { userId, productId } },
    });
    return reply.code(204).send();
  });

  /**
   * ADDRESSES
   */
  const addressInput = z.object({
    street: z.string().min(2),
    number: z.string().min(1),
    district: z.string().min(2),
    city: z.string().min(2),
    state: z.string().min(2),
    zip: z.string().min(5),
  });

  app.get('/addresses', { preHandler: [app.auth] }, async (req) => {
    const userId = (req.user as any).sub;
    return prisma.address.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/addresses', { preHandler: [app.auth] }, async (req, reply) => {
    const body = addressInput.parse(req.body);
    const userId = (req.user as any).sub;

    const created = await prisma.address.create({
      data: { userId, ...body },
    });
    return reply.code(201).send(created);
  });

  app.patch('/addresses/:id', { preHandler: [app.auth] }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse((req as any).params);
    const body = addressInput.partial().parse(req.body);
    const userId = (req.user as any).sub;

    // garante que o endereço é do usuário
    const address = await prisma.address.findUnique({ where: { id: params.id } });
    if (!address || address.userId !== userId) return reply.code(404).send({ error: 'not_found' });

    const updated = await prisma.address.update({
      where: { id: params.id },
      data: body,
    });
    return updated;
  });

  app.delete('/addresses/:id', { preHandler: [app.auth] }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse((req as any).params);
    const userId = (req.user as any).sub;

    const address = await prisma.address.findUnique({ where: { id } });
    if (!address || address.userId !== userId) return reply.code(404).send({ error: 'not_found' });

    await prisma.address.delete({ where: { id } });
    return reply.code(204).send();
  });
}
