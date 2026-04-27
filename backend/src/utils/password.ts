import argon2 from '@node-rs/argon2';
import bcrypt from 'bcryptjs';

// CIA Proof
// I hope?

const ARGON2_OPTIONS = {
  algorithm: argon2.Algorithm.Argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
  parallelism: 1,
};

export function isArgon2Hash(hash: string): boolean {
  return typeof hash === 'string' && hash.startsWith('$argon2');
}

export function isLegacyPasswordHash(hash: string): boolean {
  if (typeof hash !== 'string') return false;
  return /^(?:\$2[aby]\$)/.test(hash);
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (typeof hash !== 'string') return false;
  if (isArgon2Hash(hash)) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
  return bcrypt.compare(password, hash);
}
