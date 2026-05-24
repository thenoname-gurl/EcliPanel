import { describe, expect, it } from 'bun:test';
import {
  FIELD_MAX_LENGTHS,
  type ValidationErrorBody,
  validationError,
  validationErrors,
  validateFieldMaxLengths,
  isValidEmail,
} from '../../src/middleware/validation';

describe('validation utilities', () => {
  describe('FIELD_MAX_LENGTHS', () => {
    it('should have field max lengths defined', () => {
      expect(FIELD_MAX_LENGTHS.firstName).toBe(64);
      expect(FIELD_MAX_LENGTHS.lastName).toBe(64);
      expect(FIELD_MAX_LENGTHS.email).toBe(254);
      expect(FIELD_MAX_LENGTHS.address).toBe(256);
      expect(FIELD_MAX_LENGTHS.phone).toBe(32);
    });
  });

  describe('validationError', () => {
    it('should create single field validation error', () => {
      const result = validationError('email', 'Invalid email');
      expect(result.type).toBe('validation');
      expect(result.on).toBe('body');
      expect(result.found).toEqual({ email: 'Invalid email' });
    });

    it('should have correct type structure', () => {
      const result: ValidationErrorBody = validationError('field', 'msg');
      expect(typeof result.type).toBe('string');
      expect(typeof result.on).toBe('string');
      expect(typeof result.found).toBe('object');
    });
  });

  describe('validationErrors', () => {
    it('should create multiple field validation errors', () => {
      const errors = {
        email: 'Invalid email',
        password: 'Password too short',
      };
      const result = validationErrors(errors);
      expect(result.type).toBe('validation');
      expect(result.on).toBe('body');
      expect(result.found).toEqual(errors);
    });

    it('should work with empty errors object', () => {
      const result = validationErrors({});
      expect(result.found).toEqual({});
    });
  });

  describe('validateFieldMaxLengths', () => {
    it('should return null when all fields are within limits', () => {
      const body = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
      };
      const result = validateFieldMaxLengths(body);
      expect(result).toBeNull();
    });

    it('should return errors when fields exceed max length', () => {
      const longName = 'a'.repeat(100);
      const body = {
        firstName: longName,
        lastName: 'Doe',
      };
      const result = validateFieldMaxLengths(body);
      expect(result).not.toBeNull();
      expect(result?.firstName).toBeDefined();
      expect(result?.firstName).toContain('64 characters');
    });

    it('should ignore non-string values', () => {
      const body = {
        firstName: 12345 as unknown as string,
        lastName: null as unknown as string,
        email: undefined as unknown as string,
      };
      const result = validateFieldMaxLengths(body);
      expect(result).toBeNull();
    });

    it('should only check fields in FIELD_MAX_LENGTHS', () => {
      const body = {
        unknownField: 'a'.repeat(1000),
        firstName: 'John',
      };
      const result = validateFieldMaxLengths(body);
      expect(result).toBeNull();
    });
  });

  describe('isValidEmail', () => {
    it('should return true for valid emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true);
      expect(isValidEmail('a@b.c')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('missing@domain')).toBe(false);
      expect(isValidEmail('@missinglocal.com')).toBe(false);
      expect(isValidEmail('missingatsign.com')).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      expect(isValidEmail(null as unknown as string)).toBe(false);
      expect(isValidEmail(undefined as unknown as string)).toBe(false);
      expect(isValidEmail(123 as unknown as string)).toBe(false);
      expect(isValidEmail({} as unknown as string)).toBe(false);
    });

    it('should return false for empty strings', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('   ')).toBe(false);
    });
  });
});
