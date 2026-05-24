import { describe, expect, it } from 'bun:test';
import {
  isArgon2Hash,
  isLegacyPasswordHash,
  hashPassword,
  comparePassword,
} from '../../src/utils/password';

describe('password utilities', () => {
  describe('isArgon2Hash', () => {
    it('should return true for argon2 hashes', () => {
      expect(isArgon2Hash('$argon2id$v=19$m=65536,t=3,p=1$salt$hash')).toBe(true);
      expect(isArgon2Hash('$argon2i$v=19$m=65536,t=3,p=1$salt$hash')).toBe(true);
      expect(isArgon2Hash('$argon2d$v=19$m=65536,t=3,p=1$salt$hash')).toBe(true);
    });

    it('should return false for non-argon2 hashes', () => {
      expect(isArgon2Hash('$2a$10$...')).toBe(false);
      expect(isArgon2Hash('plaintext')).toBe(false);
      expect(isArgon2Hash('')).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      expect(isArgon2Hash(null as unknown as string)).toBe(false);
      expect(isArgon2Hash(undefined as unknown as string)).toBe(false);
      expect(isArgon2Hash(123 as unknown as string)).toBe(false);
    });
  });

  describe('isLegacyPasswordHash', () => {
    it('should return true for bcrypt hashes', () => {
      expect(isLegacyPasswordHash('$2a$10$rAnd0mSa1tVAlUe')).toBe(true);
      expect(isLegacyPasswordHash('$2b$10$rAnd0mSa1tVAlUe')).toBe(true);
      expect(isLegacyPasswordHash('$2y$10$rAnd0mSa1tVAlUe')).toBe(true);
    });

    it('should return false for non-bcrypt hashes', () => {
      expect(isLegacyPasswordHash('$argon2id$v=19$m=65536')).toBe(false);
      expect(isLegacyPasswordHash('plaintext')).toBe(false);
      expect(isLegacyPasswordHash('')).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      expect(isLegacyPasswordHash(null as unknown as string)).toBe(false);
      expect(isLegacyPasswordHash(undefined as unknown as string)).toBe(false);
    });
  });

  describe('hashPassword', () => {
    it('should generate a valid argon2 hash', async () => {
      const hash = await hashPassword('TestPassword123!');
      expect(typeof hash).toBe('string');
      expect(hash.startsWith('$argon2')).toBe(true);
    });

    it('should generate different hashes for the same password (with salt)', async () => {
      const hash1 = await hashPassword('TestPassword123!');
      const hash2 = await hashPassword('TestPassword123!');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should return true for correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const result = await comparePassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hash = await hashPassword('TestPassword123!');
      const result = await comparePassword('WrongPassword456!', hash);
      expect(result).toBe(false);
    });

    it('should return false for invalid hash', async () => {
      const result = await comparePassword('TestPassword123!', 'invalid-hash');
      expect(result).toBe(false);
    });

    it('should return false for non-string hash', async () => {
      const result = await comparePassword('TestPassword123!', null as unknown as string);
      expect(result).toBe(false);
      const result2 = await comparePassword('TestPassword123!', undefined as unknown as string);
      expect(result2).toBe(false);
    });
  });
});
