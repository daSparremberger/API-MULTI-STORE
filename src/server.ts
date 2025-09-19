// src/server.ts
import Fastify, { FastifyRequest } from 'fastify'
import { Store } from '@prisma/client'

import { env } from './env.js'
import { prisma } from './lib/prisma.js'
import jwtPlugin from './plugins/jwt.js'
import storePlugin from './plugins/store.js'

// Rotas
import authRoutes from './routes/auth.js'
import catalogRoutes from './routes/catalog.js'
import orderRoutes from './routes/orders.js'
import webhookRoutes from './routes/webhooks.js'
import userRoutes from './routes/users.js'
import adminRoutes from './routes/admin.js'

const app = Fastify({ logger: true })

/**
 * CORS
 * - Dev: localhost/127.0.0.1 (Vite 5173 e preview 4173)
 * - Prod: forfitalimentos.com.br e subdomínios
 * - Extras: env.FRONT_ORIGINS (separado por vírgula)
 */
const extraOrigins =
  (env as any).FRONT_ORIGINS?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? []

const allowList: (string | RegExp)[] = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173', // vite preview
  /https:\/\/(www\.)?forfitalimentos\.com\.br$/,
  /https:\/\/[a-z0-9-]+\.forfitalimentos\.com\.br$/,
  ...extraOrigins
]

// Dynamic import + cast (evita o overload error TS2769)
const { default: fastifyCors } = await import('@fastify/cors')

await app.register(fastifyCors as any, {
  origin: allowList,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
} as any)

// Plugins
await app.register(jwtPlugin)
await app.register(storePlugin)

// Rotas
await app.register(authRoutes, { prefix: '/auth' })
await app.register(catalogRoutes, { prefix: '/catalog' })
await app.register(orderRoutes, { prefix: '/orders' })
await app.register(userRoutes, { prefix: '/me' })
await app.register(webhookRoutes)
await app.register(adminRoutes, { prefix: '/admin' })

// Healthcheck
app.get('/health', async () => {
  await prisma.$queryRaw`SELECT 1`
  return { ok: true }
})

// Root
app.get('/', async (req: FastifyRequest) => {
  const store = (req as any).store as Store | null
  return {
    name: 'franquia-api',
    ok: true,
    store: store ? { id: store.id, name: store.name } : null
  }
})

// Start
app
  .listen({ port: env.PORT ?? 3000, host: '0.0.0.0' })
  .then(() => app.log.info(`API up on :${env.PORT ?? 3000}`))
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
