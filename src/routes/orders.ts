// src/routes/orders.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { calcSubtotal, applyCoupon } from '../utils/pricing.js';
import { calculateShipping, type ShippingInput } from '../lib/shipping.js';
import { AbacatePay } from '../lib/abacatepay.js';
import { env } from '../env.js';

const POINT_VALUE_CENTS = 10;       // 1 ponto = R$0,10
const POINTS_PER_10_REAIS = 1000;   // 1 ponto a cada R$10,00 do SUBTOTAL

const checkoutInput = z.object({
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive()
  })).min(1),
  delivery: z.object({
    street: z.string(),
    number: z.string(),
    district: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string()
  }),
  couponCode: z.string().optional(),
  pointsRedeem: z.number().int().nonnegative().default(0)
});

type CheckoutInput = z.infer<typeof checkoutInput>;

type OrderItemSnapshot = {
  productId: string;
  nameSnapshot: string;
  codeSnapshot: string;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
};

export default async function orderRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.auth] }, async (req) => {
    const userId = (req.user as any).sub as string;
    return prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: true, delivery: true }
    });
  });

  app.post('/checkout', { preHandler: [app.auth] }, async (req, reply) => {
    const userId = (req.user as any).sub as string;
    const body: CheckoutInput = checkoutInput.parse(req.body);

    const productIds = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });

    if (products.length !== productIds.length) {
      const found = new Set(products.map((p) => p.id));
      const missing = productIds.filter((id) => !found.has(id));
      return reply.code(400).send({ error: 'invalid_products', missing });
    }

    const prodMap = new Map(products.map((p) => [p.id, p] as const));

    const itemsMapped: OrderItemSnapshot[] = body.items.map((i) => {
      const p = prodMap.get(i.productId)!;
      const unitPriceCents = p.salePriceCents;
      return {
        productId: p.id,
        nameSnapshot: p.name,
        codeSnapshot: p.code,
        unitPriceCents,
        quantity: i.quantity,
        totalCents: unitPriceCents * i.quantity
      };
    });

    const subtotalCents = calcSubtotal(itemsMapped);

    let discountCents = 0;
    let appliedCoupon: { code: string; type: 'PERCENT' | 'FIXED'; value: number; influencerId?: string } | undefined;

    if (body.couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: body.couponCode } });
      if (!coupon || !coupon.active) {
        return reply.code(400).send({ error: 'invalid_coupon' });
      }
      appliedCoupon = { code: coupon.code, type: coupon.type, value: coupon.value, influencerId: coupon.influencerId ?? undefined };
      const calc = applyCoupon(subtotalCents, { type: coupon.type, value: coupon.value });
      discountCents += calc.discountCents;
    }

    let pointsRedeemed = 0;
    if (body.pointsRedeem > 0) {
      const acc = await prisma.userPointsAccount.findUnique({ where: { userId } });
      const available = acc?.balance ?? 0;
      pointsRedeemed = Math.min(body.pointsRedeem, available);
      discountCents += pointsRedeemed * POINT_VALUE_CENTS;
    }

    const shippingInput: ShippingInput = { zip: body.delivery.zip, city: body.delivery.city, state: body.delivery.state, subtotalCents };
    const shippingCents = await calculateShipping(shippingInput);
    const totalCents = Math.max(subtotalCents - discountCents + shippingCents, 0);
    const pointsEarned = Math.floor(subtotalCents / POINTS_PER_10_REAIS);

    const order = await prisma.order.create({
      data: {
        userId, status: 'PENDING', subtotalCents, discountCents, shippingCents, totalCents, pointsEarned, pointsRedeemed,
        couponCode: appliedCoupon?.code ?? null,
        influencerId: appliedCoupon?.influencerId ?? null,
        items: { createMany: { data: itemsMapped } },
        delivery: { create: body.delivery }
      },
      include: { items: true }
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    let customerId = user?.abacateCustomerId || null;

    if (!customerId && user && user.phone) {
      try {
        const cust = await AbacatePay.createCustomer({
          name: user.name,
          email: user.email,
          taxId: user.cpf,
          cellphone: user.phone
        });
        customerId = cust.id;
        await prisma.user.update({ where: { id: user.id }, data: { abacateCustomerId: cust.id } });
      } catch (e) {
        req.log.error({ err: e }, 'AbacatePay createCustomer failed');
        return reply.code(500).send({ error: 'abacatepay_create_customer_failed', details: (e as Error).message });
      }
    }

    let billing: { id: string; url?: string } | null = null;

    if (customerId) {
      try {
        billing = await AbacatePay.createBilling({
          customerId,
          products: order.items.map((it) => ({
            externalId: it.codeSnapshot,
            name: it.nameSnapshot,
            description: `Produto: ${it.nameSnapshot}`,
            price: it.unitPriceCents,
            quantity: it.quantity
          })),
          coupons: appliedCoupon?.code ? [appliedCoupon.code] : undefined,
          allowCoupons: false,
          externalId: order.id,
          returnUrl: `${env.FRONTEND_URL}/checkout/success?orderId=${order.id}`,
          completionUrl: `${env.FRONTEND_URL}/checkout/completion?orderId=${order.id}`,
        });

        await prisma.order.update({
          where: { id: order.id },
          data: { abacateBillingId: billing.id, abacateStatus: 'CREATED' }
        });
      } catch (e) {
        req.log.error({ err: e }, 'AbacatePay createBilling failed');
        return reply.code(500).send({ error: 'abacatepay_create_billing_failed', details: (e as Error).message });
      }
    }

    return reply.code(201).send({
      orderId: order.id,
      totalCents,
      payment: billing ? { billingId: billing.id, url: billing.url ?? null } : null
    });
  });
}