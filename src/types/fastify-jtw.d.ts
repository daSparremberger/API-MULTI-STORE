// src/types/fastify-jwt.d.ts
import '@fastify/jwt';

declare module '@fastify/jwt' {
  // Tipamos apenas o payload assinado e verificado pelo Fastify JWT.
  // Para acessar o usuário: (req.user as any).sub / .email
  interface FastifyJWT {
    payload: { sub: string; email: string };
  }
}
