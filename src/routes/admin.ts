// src/routes/admin.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

// Schemas de validação para as rotas de admin
const storeInput = z.object({
  name: z.string().min(3),
  subdomain: z.string().min(3).regex(/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens'),
  city: z.string().min(2),
  state: z.string().length(2),
  abacatepayApiKey: z.string().optional(),
  abacatepayWebhookSecret: z.string().optional(),
});

const productInput = z.object({
  name: z.string().min(2),
  code: z.string().min(1),
  description: z.string().nullish(),
  photoUrl: z.string().url().nullish(),
  costPriceCents: z.number().int().nonnegative(),
  salePriceCents: z.number().int().nonnegative(),
});

const inventoryInput = z.object({
  productId: z.string(),
  quantity: z.number().int().nonnegative(),
});


export default async function adminRoutes(app: FastifyInstance) {
  // TODO: Adicionar um hook de verificação de role (ex: SUPER_ADMIN)
  // app.addHook('preHandler', app.auth);
  // app.addHook('preHandler', app.requireRole('SUPER_ADMIN'));

  /**
   * ===========================
   * Gerenciamento de Lojas (Stores)
   * ===========================
   */
  app.get('/stores', async () => {
    return prisma.store.findMany({
      orderBy: { name: 'asc' }
    });
  });

  app.post('/stores', async (req, reply) => {
    const body = storeInput.parse(req.body);
    const store = await prisma.store.create({ data: body });
    return reply.code(201).send(store);
  });

  /**
   * ===========================
   * Gerenciamento de Catálogo Global
   * ===========================
   */
  app.post('/products', async (req, reply) => {
    const body = productInput.parse(req.body);
    const product = await prisma.product.create({
      data: {
        name: body.name,
        code: body.code,
        description: body.description,
        photoUrl: body.photoUrl,
        costPriceCents: body.costPriceCents,
        salePriceCents: body.salePriceCents,
      },
    });
    return reply.code(201).send(product);
  });

  /**
   * ===========================
   * Gerenciamento de Estoque por Loja
   * ===========================
   */
  app.post('/stores/:storeId/inventory', async (req, reply) => {
    const { storeId } = z.object({ storeId: z.string() }).parse(req.params);
    const body = inventoryInput.parse(req.body);

    const updatedInventory = await prisma.storeInventory.upsert({
      where: { storeId_productId: { storeId, productId: body.productId } },
      create: {
        storeId,
        productId: body.productId,
        quantity: body.quantity,
      },
      update: {
        quantity: body.quantity,
      },
    });

    return updatedInventory;
  });
}