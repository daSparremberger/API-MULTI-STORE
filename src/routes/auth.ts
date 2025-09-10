// src/routes/auth.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../env.js';
import { hashPassword, verifyPassword, randomToken, sha256 } from '../utils/crypto.js';
import { AbacatePay } from '../lib/abacatepay.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendResendVerificationEmail
} from '../lib/email-templates.js';

function signAccessToken(app: FastifyInstance, user: { id: string; email: string }) {
  return app.jwt.sign(
    { sub: user.id, email: user.email },
    { expiresIn: env.ACCESS_TOKEN_TTL }
  );
}

function parseDurationMs(s: string) {
  const m = s.match(/^(\d+)([smhd])$/);
  if (!m) return 15 * 60 * 1000;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's': return n * 1000;
    case 'm': return n * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'd': return n * 24 * 60 * 60 * 1000;
    default:  return 15 * 60 * 1000;
  }
}

async function issueRefreshToken(userId: string, ip?: string, ua?: string) {
  const token = randomToken(48);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + parseDurationMs(env.REFRESH_TOKEN_TTL));

  await prisma.refreshToken.create({
    data: { userId, tokenHash, ip, userAgent: ua, expiresAt },
  });

  return { token, expiresAt };
}

export default async function authRoutes(app: FastifyInstance) {
  // Registro + criação de cliente no AbacatePay (não bloqueante)
  app.post('/register', async (req, reply) => {
    const body = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      cpf: z.string().min(11).max(14),
      password: z.string().min(8),
      phone: z.string().optional(),
    }).parse(req.body);

    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) return reply.code(409).send({ error: 'email_in_use' });

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        cpf: body.cpf,
        phone: body.phone ?? null,
        passwordHash,
      },
      select: { id: true, email: true, name: true },
    });

    // Token de verificação de e-mail (24h)
    const tokenPlain = randomToken(32);
    const tokenHash = sha256(tokenPlain);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    // Chama a função de envio de e-mail do arquivo de templates
    await sendVerificationEmail({ name: user.name, email: user.email }, tokenPlain);

    // Cria customer no AbacatePay (best-effort, apenas se o telefone for fornecido)
    if (body.phone) {
      try {
        const cust = await AbacatePay.createCustomer({
          name: user.name,
          email: user.email,
          taxId: body.cpf,
          cellphone: body.phone,
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { abacateCustomerId: cust.id },
        });
      } catch (e) {
        req.log.warn({ err: e }, 'abacatepay:createCustomer failed');
      }
    }

    return reply.code(201).send({ ok: true, message: 'verification_sent' });
  });

  // Verificar e-mail com redirecionamento para o front-end
  app.get('/verify-email', async (req, reply) => {
    const q = z.object({
      token: z.string().min(10),
      email: z.string().email(),
    }).parse((req as any).query);

    try {
      const user = await prisma.user.findUnique({ where: { email: q.email } });
      if (!user) {
        return reply.redirect(`${env.FRONTEND_URL}/verification-result?success=false&error=invalid`);
      }

      const tokenHash = sha256(q.token);
      const t = await prisma.emailVerificationToken.findFirst({
        where: { userId: user.id, tokenHash },
      });
      if (!t || t.expiresAt < new Date()) {
        return reply.redirect(`${env.FRONTEND_URL}/verification-result?success=false&error=expired`);
      }

      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } }),
        prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
      ]);

      return reply.redirect(`${env.FRONTEND_URL}/verification-result?success=true`);
    } catch (error) {
      req.log.error(error, 'Email verification failed');
      return reply.redirect(`${env.FRONTEND_URL}/verification-result?success=false&error=server_error`);
    }
  });

  // Reenviar confirmação
  app.post('/resend-verification', async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email }, select: {id: true, email: true, name: true, emailVerifiedAt: true} });

    if (!user) return reply.send({ ok: true });
    if (user.emailVerifiedAt) return reply.send({ ok: true, alreadyVerified: true });

    await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });

    const tokenPlain = randomToken(32);
    const tokenHash = sha256(tokenPlain);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    await sendResendVerificationEmail({ name: user.name, email: user.email }, tokenPlain);

    return reply.send({ ok: true, message: 'verification_sent' });
  });

  // Login
  app.post('/login', async (req, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return reply.code(401).send({ error: 'invalid_credentials' });

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: 'invalid_credentials' });

    if (!user.emailVerifiedAt) return reply.code(403).send({ error: 'email_not_verified' });

    const accessToken = signAccessToken(app, { id: user.id, email: user.email });
    const { token: refreshToken, expiresAt } = await issueRefreshToken(
      user.id,
      req.ip,
      req.headers['user-agent']
    );

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/auth/refresh',
      expires: expiresAt,
    });

    return reply.send({
      accessToken,
      user: { id: user.id, name: user.name, email: user.email },
    });
  });

  // Refresh (via cookie ou body)
  app.post('/refresh', async (req, reply) => {
    const body = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {});
    const tokenPlain = body.refreshToken ?? (req as any).cookies?.['refreshToken'];
    if (!tokenPlain) return reply.code(401).send({ error: 'no_refresh_token' });

    const tokenHash = sha256(tokenPlain);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'invalid_refresh' });
    }

    await prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });

    const { token: newRefresh, expiresAt } = await issueRefreshToken(
      stored.userId,
      req.ip,
      req.headers['user-agent']
    );

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) return reply.code(401).send({ error: 'user_not_found' });

    const accessToken = signAccessToken(app, { id: user.id, email: user.email });

    reply.setCookie('refreshToken', newRefresh, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/auth/refresh',
      expires: expiresAt,
    });

    return reply.send({ accessToken });
  });

  // Logout (revoga refresh tokens)
  app.post('/logout', { preHandler: [app.auth] }, async (req, reply) => {
    await prisma.refreshToken.updateMany({
      where: { userId: (req.user as any).sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    reply.clearCookie('refreshToken', { path: '/auth/refresh' });
    return reply.send({ ok: true });
  });

  // Me
  app.get('/me', { preHandler: [app.auth] }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: (req.user as any).sub },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    return { user };
  });

  // Esqueci a senha
  app.post('/forgot-password', async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email }, select: {id: true, email: true, name: true} });
    if (!user) return reply.send({ ok: true });

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const tokenPlain = randomToken(32);
    const tokenHash = sha256(tokenPlain);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30min

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    await sendPasswordResetEmail({ name: user.name, email: user.email }, tokenPlain);

    return reply.send({ ok: true });
  });

  // Reset de senha
  app.post('/reset-password', async (req, reply) => {
    const body = z.object({
      email: z.string().email(),
      token: z.string().min(10),
      newPassword: z.string().min(8),
    }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return reply.code(400).send({ error: 'invalid' });

    const tokenHash = sha256(body.token);
    const t = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, tokenHash },
    });
    if (!t || t.expiresAt < new Date()) return reply.code(400).send({ error: 'invalid_or_expired' });

    const passwordHash = await hashPassword(body.newPassword);

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return reply.send({ ok: true });
  });
}
