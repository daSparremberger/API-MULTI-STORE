// src/lib/points.ts
import { Prisma, PointsReason } from '@prisma/client';

// Regra de negócio: 1 ponto a cada R$ 10,00 gastos no subtotal.
const CENTS_PER_CUSTOMER_POINT = 1000;

// Regra de negócio: 2 pontos para o influencer a cada R$ 10,00 gastos.
const CENTS_PER_INFLUENCER_POINT = 500;


export async function awardPointsForOrder(tx: Prisma.TransactionClient, order: { id: string; userId: string; subtotalCents: number }) {
  if (order.subtotalCents <= 0) return 0;

  const pointsToAward = Math.floor(order.subtotalCents / CENTS_PER_CUSTOMER_POINT);
  if (pointsToAward <= 0) return 0;

  console.log(`[Points] Concedendo ${pointsToAward} pontos para o usuário ${order.userId}`);

  await tx.userPointsAccount.upsert({
    where: { userId: order.userId },
    create: { userId: order.userId, balance: pointsToAward },
    update: { balance: { increment: pointsToAward } },
  });

  await tx.userPointsTransaction.create({
    data: {
      userId: order.userId,
      orderId: order.id,
      points: pointsToAward,
      reason: PointsReason.EARN_ORDER,
    },
  });

  return pointsToAward;
}

export async function awardPointsToInfluencer(tx: Prisma.TransactionClient, order: { id: string; influencerId: string; subtotalCents: number }) {
  if (order.subtotalCents <= 0) return 0;

  const pointsToAward = Math.floor(order.subtotalCents / CENTS_PER_INFLUENCER_POINT);
  if (pointsToAward <= 0) return 0;
  
  console.log(`[Points] Concedendo ${pointsToAward} pontos para o influencer ${order.influencerId}`);

  await tx.influencerPointsAccount.upsert({
    where: { influencerId: order.influencerId },
    create: { influencerId: order.influencerId, balance: pointsToAward },
    update: { balance: { increment: pointsToAward } },
  });

  await tx.influencerPointsTransaction.create({
    data: {
      influencerId: order.influencerId,
      orderId: order.id,
      points: pointsToAward,
      reason: PointsReason.INFLUENCER_BONUS,
    },
  });

  return pointsToAward;
}