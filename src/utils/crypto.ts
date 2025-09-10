// src/utils/crypto.ts
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';

export async function hashPassword(plain: string) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export function randomToken(size = 32) {
  return randomBytes(size).toString('hex'); // seguro para link
}

export function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex');
}
