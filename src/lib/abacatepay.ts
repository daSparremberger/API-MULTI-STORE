// src/lib/abacatepay.ts
import { env } from '../env.js';

// Tipagem para a resposta padrão da API com o wrapper "data"
type AbacateApiResponse<T> = {
  data: T;
  error: null | any;
}

/**
 * Tipos base alinhados à nova documentação
 */
export type AbacateCustomerInput = {
  name: string;
  email: string;
  taxId: string;        // CPF/CNPJ
  cellphone: string;
};

export type AbacateCustomer = {
  id: string;           // cust_...
  metadata: {
    name: string;
    email: string;
    taxId: string;
    cellphone: string;
  }
};

export type BillingProduct = {
  externalId: string;   // product.code
  name: string;
  description?: string;
  price: number;        // CENTAVOS (mínimo 100)
  quantity: number;
};

export type AbacateBillingInput = {
  customerId: string;
  products: BillingProduct[];
  coupons?: string[];
  allowCoupons?: boolean;
  returnUrl: string;
  completionUrl: string;
  externalId?: string;
  customer?: {
    name: string;
    cellphone: string;
    email: string;
    taxId: string;
  };
};

export type AbacateBilling = {
  id: string;            // bill_...
  url: string;           // URL de pagamento
  status: string;
  amount: number;
};

export type CreateCouponInput = {
  code: string;
  notes?: string;
  maxRedeems: number;
  discountKind: 'PERCENTAGE' | 'FIXED';
  discount: number;
  metadata?: Record<string, any>;
};

/**
 * Helper para chamadas HTTP, agora tratando o wrapper "data"
 */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.ABACATEPAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.ABACATEPAY_API_KEY}`,
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AbacatePay ${path} ${res.status}: ${body}`);
  }

  const jsonResponse = await res.json() as AbacateApiResponse<T>;
  if (jsonResponse.error) {
    throw new Error(`AbacatePay API Error: ${JSON.stringify(jsonResponse.error)}`);
  }
  return jsonResponse.data;
}

/**
 * SDK minimalista alinhado à tua doc
 */
export const AbacatePay = {
  /**
   * Novo cliente
   * POST /customer/create
   */
  async createCustomer(input: AbacateCustomerInput): Promise<AbacateCustomer> {
    return api<AbacateCustomer>('/customer/create', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /**
   * Nova cobrança
   * POST /billing/create
   */
  async createBilling(input: AbacateBillingInput): Promise<AbacateBilling> {
    const payload = {
      frequency: 'ONE_TIME',
      methods: ['PIX'],
      ...input,
    };
    return api<AbacateBilling>('/billing/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Criar novo cupom
   * POST /coupon/create
   */
  async createCoupon(input: CreateCouponInput) {
    return api<{ id: string; code: string }>('/coupon/create', {
      method: 'POST',
      body: JSON.stringify({ data: input }), // A API de cupom exige um wrapper "data" no input
    });
  },

  /**
   * Listar cupons
   * GET /coupon/list
   */
  async listCoupons() {
    return api<Array<{ id: string; code: string }>>('/coupon/list', {
      method: 'GET',
    });
  },
};