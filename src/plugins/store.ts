// Crie este arquivo em: src/plugins/store.ts

import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { Store } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    store: Store;
  }
  interface FastifyInstance {
    storeDetector: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function storeDetector(req: FastifyRequest, reply: FastifyReply) {
  const host = req.headers.host || ''; // ex: "cascavel.localhost:3000"
  const subdomain = host.split('.')[0];

  if (!subdomain) {
    return reply.code(400).send({ error: 'store_not_identified', message: 'Could not determine store from hostname.' });
  }

  const store = await prisma.store.findUnique({
    where: { subdomain },
  });

  if (!store) {
    return reply.code(404).send({ error: 'store_not_found', subdomain });
  }

  // Anexa o objeto da loja na requisição
  (req as any).store = store;
}

export default fp(async (app: FastifyInstance) => {
  app.decorate('storeDetector', storeDetector);
});