// src/types/fastify-auth.d.ts
import 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    // Middleware que valida o Access Token (registrado em plugins/jwt.ts)
    auth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
