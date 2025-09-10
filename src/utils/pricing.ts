// src/utils/pricing.ts

/**
 * Soma dos itens (unitPriceCents * quantity)
 */
export function calcSubtotal(items: { unitPriceCents: number; quantity: number }[]) {
  return items.reduce((acc, it) => acc + it.unitPriceCents * it.quantity, 0);
}

/**
 * Aplica cupom ao subtotal.
 * - PERCENT: value é porcentagem (ex.: 10 => 10%)
 * - FIXED: value é valor fixo em CENTAVOS
 */
export function applyCoupon(
  subtotalCents: number,
  coupon?: { type: 'PERCENT' | 'FIXED'; value: number }
) {
  if (!coupon) return { discountCents: 0, totalCents: subtotalCents };

  let discountCents = 0;
  if (coupon.type === 'PERCENT') {
    discountCents = Math.floor((subtotalCents * coupon.value) / 100);
  } else {
    discountCents = coupon.value;
  }

  if (discountCents < 0) discountCents = 0;
  if (discountCents > subtotalCents) discountCents = subtotalCents;

  return {
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}
