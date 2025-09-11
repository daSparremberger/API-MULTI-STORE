// src/routes/orders.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { calcSubtotal, applyCoupon } from '../utils/pricing.js';
import { calculateShipping, type ShippingInput } from '../lib/shipping.js';
import { AbacatePay } from '../lib/abacatepay.js';
import { env } from '../env.js';
import { Store } from '@prisma/client';

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
  // Middleware para garantir que uma loja foi identificada na requisição
  app.addHook('preHandler', app.storeDetector);
  app.addHook('preHandler', app.auth);

  app.get('/', async (req) => {
    const userId = (req.user as any).sub as string;
    const store = (req as any).store as Store;

    return prisma.order.findMany({
      where: { userId, storeId: store.id }, // Filtra pedidos da loja atual
      orderBy: { createdAt: 'desc' },
      include: { items: true, delivery: true }
    });
  });

  app.post('/checkout', async (req, reply) => {
    const userId = (req.user as any).sub as string;
    const store = (req as any).store as Store;
    const body: CheckoutInput = checkoutInput.parse(req.body);

    if (!store.abacatepayApiKey) {
      return reply.code(500).send({ error: 'store_payment_not_configured' });
    }

    const productIds = body.items.map((i) => i.productId);
    
    // Pega produtos e o inventário da loja atual em uma só chamada
    const productsWithInventory = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        inventory: {
          where: { storeId: store.id }
        }
      }
    });

    if (productsWithInventory.length !== productIds.length) {
      const found = new Set(productsWithInventory.map((p) => p.id));
      const missing = productIds.filter((id) => !found.has(id));
      return reply.code(400).send({ error: 'invalid_products', missing });
    }

    // Validação de estoque
    for (const item of body.items) {
      const product = productsWithInventory.find(p => p.id === item.productId);
      const stock = product?.inventory[0]?.quantity ?? 0;
      if (stock < item.quantity) {
        return reply.code(400).send({ error: 'insufficient_stock', productId: item.productId, available: stock });
      }
    }
    
    const prodMap = new Map(productsWithInventory.map((p) => [p.id, p] as const));

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
        userId,
        storeId: store.id, // Associa o pedido à loja
        status: 'PENDING',
        subtotalCents, discountCents, shippingCents, totalCents, pointsEarned, pointsRedeemed,
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
        }, { apiKey: store.abacatepayApiKey }); // Usa a chave da loja
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
        }, { apiKey: store.abacatepayApiKey }); // Usa a chave da loja

        await prisma.order.update({
          where: { id: order.id },
          data: { abacateBillingId: billing.id, abacateStatus: 'CREATED' }
        });

        // Decrementa o estoque na transação
        await prisma.$transaction(
          order.items.map(item => 
            prisma.storeInventory.update({
              where: { storeId_productId: { storeId: store.id, productId: item.productId } },
              data: { quantity: { decrement: item.quantity } }
            })
          )
        );

      } catch (e) {
        req.log.error({ err: e }, 'AbacatePay createBilling failed');
        // Rollback do pedido
        await prisma.order.delete({ where: { id: order.id }});
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