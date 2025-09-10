// prisma/seed.ts
// Seed idempotente: cria ingredientes, derivados, um produto exemplo,
// um influencer + cupom e um usuário dev com endereço.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertIngredient(name: string, description?: string) {
  return prisma.ingredient.upsert({
    where: { name },
    update: { description: description ?? null },
    create: { name, description: description ?? null },
  });
}

async function upsertDerivative(name: string, description?: string) {
  return prisma.derivative.upsert({
    where: { name },
    update: { description: description ?? null },
    create: { name, description: description ?? null },
  });
}

async function upsertInfluencer(name: string, handle?: string) {
  // não há unique em handle, então usamos name para idempotência
  const existing = await prisma.influencer.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.influencer.create({
    data: { name, handle: handle ?? null },
  });
}

async function upsertCoupon(code: string, data: { type: 'PERCENT' | 'FIXED'; value: number; influencerId?: string | null }) {
  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) {
    return prisma.coupon.update({
      where: { id: existing.id },
      data: {
        type: data.type,
        value: data.value,
        influencerId: data.influencerId ?? null,
        active: true,
      },
    });
  }
  return prisma.coupon.create({
    data: {
      code,
      type: data.type,
      value: data.value,
      influencerId: data.influencerId ?? null,
      active: true,
    },
  });
}

async function upsertUser(email: string, data: {
  name: string;
  cpf: string;
  phone?: string | null;
  password: string;
}) {
  const passwordHash = await bcrypt.hash(data.password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        cpf: data.cpf,
        phone: data.phone ?? null,
        passwordHash,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      },
    });
  }
  return prisma.user.create({
    data: {
      name: data.name,
      email,
      cpf: data.cpf,
      phone: data.phone ?? null,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });
}

async function upsertProduct(code: string, data: {
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  costPriceCents: number;
  salePriceCents: number;
  quantity: number;
  ingredientIds?: string[];
  derivativeIds?: string[];
  nutrition?: {
    servingSize?: string | null;
    energyKcal?: number | null;
    carbs?: string | null;
    protein?: string | null;
    fatTotal?: string | null;
    fatSaturated?: string | null;
    fatTrans?: string | null;
    fiber?: string | null;
    sodium?: string | null;
  } | null;
}) {
  const existing = await prisma.product.findUnique({ where: { code } });

  if (existing) {
    // atualiza e substitui relações N:N e tabela de nutrição
    return prisma.product.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        description: data.description ?? null,
        photoUrl: data.photoUrl ?? null,
        costPriceCents: data.costPriceCents,
        salePriceCents: data.salePriceCents,
        quantity: data.quantity,
        ingredients: data.ingredientIds
          ? {
              deleteMany: {},
              create: data.ingredientIds.map((ingredientId) => ({ ingredientId })),
            }
          : undefined,
        derivatives: data.derivativeIds
          ? {
              deleteMany: {},
              create: data.derivativeIds.map((derivativeId) => ({ derivativeId })),
            }
          : undefined,
        nutrition:
          data.nutrition !== undefined
            ? data.nutrition
              ? {
                  upsert: {
                    create: {
                      servingSize: data.nutrition.servingSize ?? null,
                      energyKcal: data.nutrition.energyKcal ?? null,
                      carbs: data.nutrition.carbs ?? null,
                      protein: data.nutrition.protein ?? null,
                      fatTotal: data.nutrition.fatTotal ?? null,
                      fatSaturated: data.nutrition.fatSaturated ?? null,
                      fatTrans: data.nutrition.fatTrans ?? null,
                      fiber: data.nutrition.fiber ?? null,
                      sodium: data.nutrition.sodium ?? null,
                    },
                    update: {
                      servingSize: data.nutrition.servingSize ?? null,
                      energyKcal: data.nutrition.energyKcal ?? null,
                      carbs: data.nutrition.carbs ?? null,
                      protein: data.nutrition.protein ?? null,
                      fatTotal: data.nutrition.fatTotal ?? null,
                      fatSaturated: data.nutrition.fatSaturated ?? null,
                      fatTrans: data.nutrition.fatTrans ?? null,
                      fiber: data.nutrition.fiber ?? null,
                      sodium: data.nutrition.sodium ?? null,
                    },
                  },
                }
              : { delete: true }
            : undefined,
      },
      include: {
        ingredients: { include: { ingredient: true } },
        derivatives: { include: { derivative: true } },
        nutrition: true,
      },
    });
  }

  // cria novo
  return prisma.product.create({
    data: {
      name: data.name,
      code,
      description: data.description ?? null,
      photoUrl: data.photoUrl ?? null,
      costPriceCents: data.costPriceCents,
      salePriceCents: data.salePriceCents,
      quantity: data.quantity,
      ingredients: data.ingredientIds
        ? { create: data.ingredientIds.map((ingredientId) => ({ ingredientId })) }
        : undefined,
      derivatives: data.derivativeIds
        ? { create: data.derivativeIds.map((derivativeId) => ({ derivativeId })) }
        : undefined,
      nutrition: data.nutrition
        ? {
            create: {
              servingSize: data.nutrition.servingSize ?? null,
              energyKcal: data.nutrition.energyKcal ?? null,
              carbs: data.nutrition.carbs ?? null,
              protein: data.nutrition.protein ?? null,
              fatTotal: data.nutrition.fatTotal ?? null,
              fatSaturated: data.nutrition.fatSaturated ?? null,
              fatTrans: data.nutrition.fatTrans ?? null,
              fiber: data.nutrition.fiber ?? null,
              sodium: data.nutrition.sodium ?? null,
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
}

async function main() {
  console.log('🌱 Seeding...');

  // Ingredientes
  const frango = await upsertIngredient('Frango', 'Peito de frango grelhado');
  const arroz = await upsertIngredient('Arroz', 'Arroz integral cozido');
  const nozes = await upsertIngredient('Nozes', 'Contém alérgenos');

  // Derivados / Atributos
  const semLactose = await upsertDerivative('Sem lactose');
  const contemNozes = await upsertDerivative('Contém nozes');

  // Influencer + Cupom
  const influencer = await upsertInfluencer('Larissa', '@larissa.fit');
  await upsertCoupon('LARISSA10', {
    type: 'PERCENT',
    value: 10, // 10% off
    influencerId: influencer.id,
  });

  // Usuário dev
  const dev = await upsertUser('dev@example.com', {
    name: 'Usuário Dev',
    cpf: '00011122233',
    phone: '(45) 99999-0000',
    password: 'password123',
  });

  // Endereço do usuário dev (cria um, se não houver nenhum)
  const hasAddress = await prisma.address.findFirst({ where: { userId: dev.id } });
  if (!hasAddress) {
    await prisma.address.create({
      data: {
        userId: dev.id,
        street: 'Rua Exemplo',
        number: '123',
        district: 'Centro',
        city: 'Cascavel',
        state: 'PR',
        zip: '85800-000',
      },
    });
  }

  // Produto exemplo
  const produto = await upsertProduct('FF-001', {
    name: 'Frango grelhado com arroz integral',
    description: 'Bandeja 300 g',
    photoUrl: null,
    costPriceCents: 1250, // R$ 12,50
    salePriceCents: 2790, // R$ 27,90
    quantity: 50,
    ingredientIds: [frango.id, arroz.id, nozes.id],
    derivativeIds: [semLactose.id, contemNozes.id],
    nutrition: {
      servingSize: '300 g',
      energyKcal: 320,
      carbs: '18.20',
      protein: '32.50',
      fatTotal: '9.10',
      fatSaturated: '2.10',
      fatTrans: '0.00',
      fiber: '3.40',
      sodium: '420.00',
    },
  });

  console.log('✅ Ingredientes:', [frango.name, arroz.name, nozes.name].join(', '));
  console.log('✅ Derivados:', [semLactose.name, contemNozes.name].join(', '));
  console.log('✅ Influencer + Cupom: LARISSA10');
  console.log('✅ Usuário dev:', dev.email);
  console.log('✅ Produto:', produto.name, '-', produto.code);

  console.log('🌱 Seed finalizado!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
