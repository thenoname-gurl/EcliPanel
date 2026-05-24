import { describe, expect, it } from 'bun:test';
import {
  validatePassword,
  PASSWORD_MIN,
  PASSWORD_MAX,
  PASSWORD_RULES,
  type PasswordValidationResult,
} from '../../src/utils/passwordValidation';

describe('password validation', () => {
  describe('constants', () => {
    it('should have correct min/max values', () => {
      expect(PASSWORD_MIN).toBe(8);
      expect(PASSWORD_MAX).toBe(128);
    });

    it('should have all rules defined', () => {
      expect(PASSWORD_RULES.minLength).toBe(8);
      expect(PASSWORD_RULES.maxLength).toBe(128);
      expect(PASSWORD_RULES.uppercase).toBeDefined();
      expect(PASSWORD_RULES.lowercase).toBeDefined();
      expect(PASSWORD_RULES.digit).toBeDefined();
      expect(PASSWORD_RULES.symbol).toBeDefined();
    });
  });

  describe('validatePassword', () => {
    it('should reject non-string inputs', () => {
      const result1 = validatePassword(null);
      expect(result1.valid).toBe(false);
      expect(result1.errors).toContain('Password must be a string.');

      const result2 = validatePassword(undefined);
      expect(result2.valid).toBe(false);

      const result3 = validatePassword(123);
      expect(result3.valid).toBe(false);

      const result4 = validatePassword({});
      expect(result4.valid).toBe(false);
    });

    it('should reject passwords shorter than min length', () => {
      const result = validatePassword('Ab1!');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 8 characters'))).toBe(true);
    });

    it('should reject passwords longer than max length', () => {
      const longPassword = 'A'.repeat(129) + 'b1!';
      const result = validatePassword(longPassword);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('no more than 128 characters'))).toBe(true);
    });

    it('should reject passwords without uppercase letters', () => {
      const result = validatePassword('password123!');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('uppercase letter'))).toBe(true);
    });

    it('should reject passwords without lowercase letters', () => {
      const result = validatePassword('PASSWORD123!');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('lowercase letter'))).toBe(true);
    });

    it('should reject passwords without digits', () => {
      const result = validatePassword('Password!');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('number'))).toBe(true);
    });

    it('should reject passwords without symbols', () => {
      const result = validatePassword('Password123');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('symbol'))).toBe(true);
    });

    it('should accept valid passwords', () => {
      const validPasswords = [
        'Password123!',
        'MyP@ssw0rd',
        'Test123!',
        'aB3!xyzQ',
        'SecurePass123$',
      ];

      for (const password of validPasswords) {
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      }
    });

    it('should report multiple errors for invalid passwords', () => {
      const result = validatePassword('aaa');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
