// prisma/seed.js
import { PrismaClient, UserRole, OrderStatus, CouponType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1) Loja base
  const store = await prisma.store.upsert({
    where: { subdomain: 'cascavel' },
    update: {},
    create: {
      name: 'ForFit - Cascavel',
      subdomain: 'cascavel',
      city: 'Cascavel',
      state: 'PR',
    },
  });

  // 2) Produtos
  const products = await Promise.all([
    prisma.product.upsert({
      where: { code: 'FF-001' },
      update: {},
      create: {
        name: 'Macarrão com Frango ao Molho de Queijo',
        code: 'FF-001',
        description: 'Cremoso, leve e saboroso',
        photoUrl: 'https://picsum.photos/seed/ff001/600/400',
        costPriceCents: 1200,
        salePriceCents: 2390,
      },
    }),
    prisma.product.upsert({
      where: { code: 'FF-002' },
      update: {},
      create: {
        name: 'Lasagna de Abobrinha Low Carb',
        code: 'FF-002',
        description: 'Camadas de abobrinha, molho de tomate e queijo',
        photoUrl: 'https://picsum.photos/seed/ff002/600/400',
        costPriceCents: 1500,
        salePriceCents: 2890,
      },
    }),
    prisma.product.upsert({
      where: { code: 'FF-003' },
      update: {},
      create: {
        name: 'Sopa de Mandioquinha',
        code: 'FF-003',
        description: 'Conforto em forma de sopa',
        photoUrl: 'https://picsum.photos/seed/ff003/600/400',
        costPriceCents: 900,
        salePriceCents: 1990,
      },
    }),
  ]);

  // 3) Estoque por loja
  for (const p of products) {
    await prisma.storeInventory.upsert({
      where: { storeId_productId: { storeId: store.id, productId: p.id } },
      update: { quantity: 50 },
      create: {
        storeId: store.id,
        productId: p.id,
        quantity: 50,
      },
    });
  }

  // 4) Promo simples
  const promo = await prisma.promotion.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      costPriceCents: 0,
      salePriceCents: 0,
      items: {
        create: [
          { productId: products[0].id, quantity: 1 },
          { productId: products[1].id, quantity: 1 },
        ],
      },
    },
  });

  // 5) Usuário ADMIN (hash de senha)
  const adminEmail = 'samuel@testeadmin.com';
  const adminPass = '410203Sa@';
  const passwordHash = await bcrypt.hash(adminPass, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: UserRole.ADMIN,
      storeId: store.id,
    },
    create: {
      name: 'Samuel Admin',
      cpf: '00000000191', // CPF de teste (não válido) apenas para seed
      email: adminEmail,
      passwordHash,
      phone: '(45) 99999-9999',
      role: UserRole.ADMIN,
      storeId: store.id,
      emailVerifiedAt: new Date(),
    },
  });

  // 6) Conta de pontos do usuário (exemplo)
  await prisma.userPointsAccount.upsert({
    where: { userId: admin.id },
    update: { balance: 100 },
    create: {
      userId: admin.id,
      balance: 100,
    },
  });

  console.log('Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Seed falhou:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
