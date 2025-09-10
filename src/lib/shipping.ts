// src/lib/shipping.ts

/**
 * Regras simples de frete para DEV (ajuste à sua logística real):
 * - Base PR: R$ 12,00
 * - Base fora do PR: R$ 18,00
 * - Frete grátis a partir de R$ 150,00 (somente PR neste exemplo)
 */

export const BASE_PR_CENTS = 1200;
export const BASE_OUT_PR_CENTS = 1800;
export const FREE_SHIPPING_THRESHOLD_PR_CENTS = 15000; // R$ 150,00

export type ShippingInput = {
  zip: string;           // CEP (qualquer formato; só para futura integração)
  city: string;
  state: string;         // UF, ex.: "PR"
  subtotalCents?: number;
};

function isParana(uf: string) {
  return (uf || '').trim().toUpperCase() === 'PR';
}

/**
 * Calcula o frete em centavos.
 * Em produção, troque por integração com sua transportadora/correios.
 */
export async function calculateShipping(input: ShippingInput): Promise<number> {
  const ufIsPR = isParana(input.state);

  // Frete grátis se for PR e atingir o teto
  if (ufIsPR && (input.subtotalCents ?? 0) >= FREE_SHIPPING_THRESHOLD_PR_CENTS) {
    return 0;
  }

  return ufIsPR ? BASE_PR_CENTS : BASE_OUT_PR_CENTS;
}
