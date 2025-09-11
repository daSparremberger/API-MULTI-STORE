// src/routes/catalog.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { Store } from '@prisma/client';

/**
 * Payloads
 */
const ingredientInput = z.object({
  name: z.string().min(2),
  description: z.string().nullish(),
});

const derivativeInput = z.object({
  name: z.string().min(2),            // ex.: "Sem lactose", "Contém nozes"
  description: z.string().nullish(),
});

// Este payload é para o painel de Super Admin, não para o cliente final.
// O cliente não cria produtos.
const productInput = z.object({
  name: z.string().min(2),
  code: z.string().min(1),
  description: z.string().nullish(),
  photoUrl: z.string().url().nullish(),
  costPriceCents: z.number().int().nonnegative(),
  salePriceCents: z.number().int().nonnegative(),
  ingredientIds: z.array(z.string()).default([]),
  derivativeIds: z.array(z.string()).default([]),
  nutrition: z
    .object({
      servingSize: z.string().nullish(),
      energyKcal: z.number().int().nullish(),
      carbs: z.string().nullish(),
      protein: z.string().nullish(),
      fatTotal: z.string().nullish(),
      fatSaturated: z.string().nullish(),
      fatTrans: z.string().nullish(),
      fiber: z.string().nullish(),
      sodium: z.string().nullish(),
    })
    .partial()
    .nullish(),
});

export default async function catalogRoutes(app: FastifyInstance) {
  // O detector de loja é essencial para saber de qual inventário puxar a quantidade
  app.addHook('preHandler', app.storeDetector);

  /**
   * ==========================================================
   * Rotas Públicas (para o cliente da loja/franquia)
   * ==========================================================
   */

  // Listar produtos para o cliente final (não precisa de auth)
  app.get('/products', async (req) => {
    const q = z
      .object({ search: z.string().optional() })
      .parse((req as any).query ?? {});
    const store = (req as any).store as Store;

    const products = await prisma.product.findMany({
      where: q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: {
        // Inclui apenas o inventário da loja atual
        inventory: {
          where: { storeId: store.id }
        },
        ingredients: { include: { ingredient: true } },
        derivatives: { include: { derivative: true } },
        nutrition: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Mapeia para um formato mais amigável, colocando a quantidade no topo do objeto
    return products.map(p => {
      const { inventory, ...productData } = p;
      return {
        ...productData,
        quantity: inventory[0]?.quantity ?? 0
      };
    });
  });

  // Detalhe do produto
  app.get('/products/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse((req as any).params);
    const store = (req as any).store as Store;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        inventory: { where: { storeId: store.id } },
        ingredients: { include: { ingredient: true } },
        derivatives: { include: { derivative: true } },
        nutrition: true,
      },
    });

    if (!product) return reply.code(404).send({ error: 'not_found' });

    const { inventory, ...productData } = product;
    return {
      ...productData,
      quantity: inventory[0]?.quantity ?? 0,
    };
  });

  /**
   * ==========================================================
   * Rotas de Catálogo Global (para o painel de Super Admin)
   * ==========================================================
   * Estas rotas não precisam do `storeDetector` e devem ser
   * movidas para /admin e protegidas por role futuramente.
   */

  app.get('/ingredients', async () => {
    return prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
  });

  app.get('/derivatives', async () => {
    return prisma.derivative.findMany({ orderBy: { name: 'asc' } });
  });
}