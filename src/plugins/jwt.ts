// src/plugins/jwt.ts
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { env } from '../env.js';

export default fp(async (app) => {
  await app.register(cookie);

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: 'refreshToken', // usado em /auth/refresh
      signed: false,
    },
  });

  // Middleware simples de auth: exige Access Token válido
  app.decorate('auth', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
});
