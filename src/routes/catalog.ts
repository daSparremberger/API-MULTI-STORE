// src/routes/catalog.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

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

const productInput = z.object({
  name: z.string().min(2),
  code: z.string().min(1),
  description: z.string().nullish(),
  photoUrl: z.string().url().nullish(),
  costPriceCents: z.number().int().nonnegative(),
  salePriceCents: z.number().int().nonnegative(),
  quantity: z.number().int().nonnegative().default(0),

  ingredientIds: z.array(z.string()).default([]),
  derivativeIds: z.array(z.string()).default([]),

  nutrition: z
    .object({
      servingSize: z.string().nullish(),
      energyKcal: z.number().int().nullish(),
      // Decimals como string para evitar problemas de precisão
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
  /**
   * INGREDIENTS
   */
  app.get('/ingredients', async () => {
    return prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
  });

  app.post('/ingredients', async (req, reply) => {
    const body = ingredientInput.parse(req.body);
    const created = await prisma.ingredient.create({
      data: { name: body.name, description: body.description ?? null },
    });
    return reply.code(201).send(created);
  });

  /**
   * DERIVATIVES (atributos / alergênicos, etc.)
   */
  app.get('/derivatives', async () => {
    return prisma.derivative.findMany({ orderBy: { name: 'asc' } });
  });

  app.post('/derivatives', async (req, reply) => {
    const body = derivativeInput.parse(req.body);
    const created = await prisma.derivative.create({
      data: { name: body.name, description: body.description ?? null },
    });
    return reply.code(201).send(created);
  });

  /**
   * PRODUCTS
   */
  // Listar (com busca opcional)
  app.get('/', async (req) => {
    const q = z
      .object({ search: z.string().optional() })
      .parse((req as any).query ?? {});

    return prisma.product.findMany({
      where: q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: {
        ingredients: { include: { ingredient: true } },
        derivatives: { include: { derivative: true } },
        nutrition: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  // Criar
  app.post('/', async (req, reply) => {
    const body = productInput.parse(req.body);

    const created = await prisma.product.create({
      data: {
        name: body.name,
        code: body.code,
        description: body.description ?? null,
        photoUrl: body.photoUrl ?? null,
        costPriceCents: body.costPriceCents,
        salePriceCents: body.salePriceCents,
        quantity: body.quantity,

        // N:N
        ingredients: {
          create: body.ingredientIds.map((ingredientId) => ({ ingredientId })),
        },
        derivatives: {
          create: body.derivativeIds.map((derivativeId) => ({ derivativeId })),
        },

        // 1:1
        nutrition: body.nutrition
          ? {
              create: {
                servingSize: body.nutrition.servingSize ?? null,
                energyKcal: body.nutrition.energyKcal ?? null,
                carbs: body.nutrition.carbs ?? null,
                protein: body.nutrition.protein ?? null,
                fatTotal: body.nutrition.fatTotal ?? null,
                fatSaturated: body.nutrition.fatSaturated ?? null,
                fatTrans: body.nutrition.fatTrans ?? null,
                fiber: body.nutrition.fiber ?? null,
                sodium: body.nutrition.sodium ?? null,
              },
            }
          : undefined,
      },
      include: {
        ingredients: { include: { ingredient: true } },
        derivatives: { include: { derivative: true } },
        nutrition: true,
      },
    });

    return reply.code(201).send(created);
  });

  // Detalhe
  app.get('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse((req as any).params);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        ingredients: { include: { ingredient: true } },
        derivatives: { include: { derivative: true } },
        nutrition: true,
      },
    });

    if (!product) return reply.code(404).send({ error: 'not_found' });
    return product;
  });

  // Atualizar (parcial)
  app.patch('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse((req as any).params);
    const body = productInput.partial().parse(req.body);

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl } : {}),
        ...(body.costPriceCents !== undefined ? { costPriceCents: body.costPriceCents } : {}),
        ...(body.salePriceCents !== undefined ? { salePriceCents: body.salePriceCents } : {}),
        ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),

        ...(body.ingredientIds
          ? {
              ingredients: {
                deleteMany: {},
                create: body.ingredientIds.map((ingredientId) => ({ ingredientId })),
              },
            }
          : {}),

        ...(body.derivativeIds
          ? {
              derivatives: {
                deleteMany: {},
                create: body.derivativeIds.map((derivativeId) => ({ derivativeId })),
              },
            }
          : {}),

        ...(body.nutrition !== undefined
          ? body.nutrition
            ? {
                nutrition: {
                  upsert: {
                    create: {
                      servingSize: body.nutrition.servingSize ?? null,
                      energyKcal: body.nutrition.energyKcal ?? null,
                      carbs: body.nutrition.carbs ?? null,
                      protein: body.nutrition.protein ?? null,
                      fatTotal: body.nutrition.fatTotal ?? null,
                      fatSaturated: body.nutrition.fatSaturated ?? null,
                      fatTrans: body.nutrition.fatTrans ?? null,
                      fiber: body.nutrition.fiber ?? null,
                      sodium: body.nutrition.sodium ?? null,
                    },
                    update: {
                      servingSize: body.nutrition.servingSize ?? null,
                      energyKcal: body.nutrition.energyKcal ?? null,
                      carbs: body.nutrition.carbs ?? null,
                      protein: body.nutrition.protein ?? null,
                      fatTotal: body.nutrition.fatTotal ?? null,
                      fatSaturated: body.nutrition.fatSaturated ?? null,
                      fatTrans: body.nutrition.fatTrans ?? null,
                      fiber: body.nutrition.fiber ?? null,
                      sodium: body.nutrition.sodium ?? null,
                    },
                  },
                },
              }
            : { nutrition: { delete: true } }
          : {}),
      },
      include: {
        ingredients: { include: { ingredient: true } },
        derivatives: { include: { derivative: true } },
        nutrition: true,
      },
    });

    return updated;
  });

  // Remover
  app.delete('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse((req as any).params);
    await prisma.product.delete({ where: { id } });
    return reply.code(204).send();
  });
}
