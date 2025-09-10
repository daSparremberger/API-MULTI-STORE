// src/routes/webhooks.ts
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { env } from '../env.js';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Normaliza o header:
 * - aceita "sha256=<hex>" ou apenas "<hex>"
 */
function parseIncomingSignature(sigHeader: unknown) {
  if (typeof sigHeader !== 'string') return null;
  const s = sigHeader.trim();
  if (s.startsWith('sha256=')) return s.slice('sha256='.length);
  return s;
}

/**
 * Calcula HMAC-SHA256 do corpo cru.
 */
function computeSignature(raw: Buffer, secret: string) {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

/**
 * Compara de forma segura (contra timing attacks).
 */
function safeEqual(a: string, b: string) {
  try {
    const A = Buffer.from(a, 'hex');
    const B = Buffer.from(b, 'hex');
    if (A.length !== B.length) return false;
    return timingSafeEqual(A, B);
  } catch {
    return false;
  }
}

export default async function webhookRoutes(app: FastifyInstance) {
  // Escopo isolado com parser específico p/ manter rawBody
  await app.register(async (scope) => {
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
      // guarda o raw body
      (req as any).rawBody = body as Buffer;

      // tenta parsear JSON (caso não seja JSON, mantemos {} e tratamos adiante)
      try {
        const str = body?.toString('utf8') ?? '';
        const parsed = str ? JSON.parse(str) : {};
        done(null, parsed);
      } catch {
        done(null, {} as any);
      }
    });

    scope.post('/webhooks/abacatepay', async (req: FastifyRequest, reply: FastifyReply) => {
      const secret = env.ABACATEPAY_WEBHOOK_SECRET; // já existe no seu .env:contentReference[oaicite:2]{index=2}
      const raw = (req as any).rawBody as Buffer | undefined;
      const incoming = parseIncomingSignature((req.headers as any)['x-abacate-signature']);

      if (!secret || !raw || !incoming) {
        return reply.code(401).send({ error: 'invalid_signature' });
      }

      const expected = computeSignature(raw, secret);
      if (!safeEqual(incoming, expected)) {
        return reply.code(401).send({ error: 'invalid_signature' });
      }

      const evt = req.body as any;
      const type = evt?.type;
      const data = evt?.data ?? {};

      if (type === 'billing.paid') {
        const billingId: string | undefined = data.id;
        if (!billingId) return reply.code(400).send({ error: 'no_billing_id' });

        const order = await prisma.order.findFirst({ where: { abacateBillingId: billingId } });
        if (!order) return reply.send({ ok: true }); // desconhecido; idempotente

        if (order.status !== 'PAID') {
          await prisma.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: order.id },
              data: { status: 'PAID', abacateStatus: 'PAID' },
            });

            if (order.pointsRedeemed && order.pointsRedeemed > 0) {
              await tx.userPointsAccount.upsert({
                where: { userId: order.userId },
                update: { balance: { decrement: order.pointsRedeemed } },
                create: { userId: order.userId, balance: 0 - order.pointsRedeemed },
              });
              await tx.userPointsTransaction.create({
                data: { userId: order.userId, orderId: order.id, points: -order.pointsRedeemed, reason: 'REDEEM_ORDER' },
              });
            }

            if (order.pointsEarned && order.pointsEarned > 0) {
              await tx.userPointsAccount.upsert({
                where: { userId: order.userId },
                update: { balance: { increment: order.pointsEarned } },
                create: { userId: order.userId, balance: order.pointsEarned },
              });
              await tx.userPointsTransaction.create({
                data: { userId: order.userId, orderId: order.id, points: order.pointsEarned, reason: 'EARN_ORDER' },
              });
            }

            if (order.couponCode) {
              const coupon = await tx.coupon.findUnique({ where: { code: order.couponCode } });
              if (coupon) {
                await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
                await tx.couponRedemption.create({
                  data: {
                    couponId: coupon.id,
                    orderId: order.id,
                    userId: order.userId,
                    amountDiscountCents: order.discountCents,
                  },
                });

                if (order.influencerId) {
                  const influencerPoints = Math.floor(order.discountCents / 10);
                  if (influencerPoints > 0) {
                    await tx.influencerPointsAccount.upsert({
                      where: { influencerId: order.influencerId },
                      update: { balance: { increment: influencerPoints } },
                      create: { influencerId: order.influencerId, balance: influencerPoints },
                    });
                    await tx.influencerPointsTransaction.create({
                      data: { influencerId: order.influencerId, orderId: order.id, points: influencerPoints, reason: 'INFLUENCER_BONUS' },
                    });
                  }
                }
              }
            }
          });
        }

        return reply.send({ ok: true });
      }

      return reply.send({ ok: true, ignored: true });
    });
  });
}
