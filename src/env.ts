// src/env.ts
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  // Email
  EMAIL_FROM: z.string().email(),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number(),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),

  // URLs
  APP_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),

  // AbacatePay
  ABACATEPAY_API_KEY: z.string(),
  ABACATEPAY_BASE_URL: z.string().url().default('https://api.abacatepay.com/v1'),
  ABACATEPAY_WEBHOOK_SECRET: z.string()
});

export const env = schema.parse(process.env);
