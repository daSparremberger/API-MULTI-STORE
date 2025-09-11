// prisma/seed.ts
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Funções upsert (idempotentes)
async function upsertStore(subdomain: string, data: { name: string; city: string; state: string; abacatepayApiKey?: string; abacatepayWebhookSecret?: string; }) {
  return prisma.store.upsert({
    where: { subdomain },
    update: data,
    create: { subdomain, ...data },
  });
}

async function upsertUser(email: string, data: { name: string; cpf: string; password?: string; role: UserRole; storeId?: string | null }) {
  const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : 'dummy_hash_for_seed';
  return prisma.user.upsert({
    where: { email },
    update: { name: data.name, cpf: data.cpf, role: data.role, storeId: data.storeId },
    create: {
      email,
      name: data.name,
      cpf: data.cpf,
      passwordHash,
      emailVerifiedAt: new Date(),
      role: data.role,
      storeId: data.storeId,
    },
  });
}

async function upsertProduct(code: string, data: { name: string; costPriceCents: number; salePriceCents: number }) {
  return prisma.product.upsert({
    where: { code },
    update: data,
    create: { code, ...data },
  });
}

async function setInventory(storeId: string, productId: string, quantity: number) {
  return prisma.storeInventory.upsert({
    where: { storeId_productId: { storeId, productId } },
    update: { quantity },
    create: { storeId, productId, quantity },
  });
}

async function main() {
  console.log('🌱 Seeding...');

  // 1. Cria a loja principal (franquia de Cascavel)
  const storeCascavel = await upsertStore('cascavel', {
    name: 'Forfit - Cascavel',
    city: 'Cascavel',
    state: 'PR',
    abacatepayApiKey: 'abc_dev_wLmb4QxBnbfr5P2xGE4smusY', // Chave de teste
    abacatepayWebhookSecret: 'a82fdc9c77b04d12aa7fbb08d2214' // Segredo de teste
  });
  console.log(`✅ Loja criada: ${storeCascavel.name}`);

  // 2. Cria um Super Admin (geral) e um Admin para a loja de Cascavel
  const superAdmin = await upsertUser('superadmin@forfit.com.br', {
    name: 'Super Admin',
    cpf: '00000000000',
    password: 'superpassword123',
    role: UserRole.SUPER_ADMIN,
  });
  console.log(`✅ Super Admin criado: ${superAdmin.email}`);

  const adminCascavel = await upsertUser('admin.cascavel@forfit.com.br', {
    name: 'Admin Cascavel',
    cpf: '11111111111',
    password: 'adminpassword123',
    role: UserRole.ADMIN,
    storeId: storeCascavel.id,
  });
  console.log(`✅ Admin da loja criado: ${adminCascavel.email}`);

  // 3. Cria um cliente de exemplo
  const customer = await upsertUser('cliente@example.com', {
    name: 'Cliente Exemplo',
    cpf: '22222222222',
    password: 'password123',
    role: UserRole.CUSTOMER,
  });
  console.log(`✅ Cliente criado: ${customer.email}`);

  // 4. Cria um produto global
  const produtoFrango = await upsertProduct('FF-001', {
    name: 'Frango grelhado com arroz integral',
    costPriceCents: 1250,
    salePriceCents: 2790,
  });
  console.log(`✅ Produto global criado: ${produtoFrango.name}`);

  // 5. Define o estoque deste produto para a loja de Cascavel
  await setInventory(storeCascavel.id, produtoFrango.id, 50);
  console.log(`✅ Estoque definido para ${produtoFrango.name} em ${storeCascavel.name}: 50 unidades`);


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