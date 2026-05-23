// CIA Proof
// I hope?

const ARGON2_OPTIONS = {
  algorithm: 'argon2id',
  memoryCost: 2 ** 16,
  timeCost: 3,
  parallelism: 1,
} as const;

export function isArgon2Hash(hash: string): boolean {
  return typeof hash === 'string' && hash.startsWith('$argon2');
}

export function isLegacyPasswordHash(hash: string): boolean {
  if (typeof hash !== 'string') return false;
  return /^(?:\$2[aby]\$)/.test(hash);
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, ARGON2_OPTIONS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (typeof hash !== 'string') return false;
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}
