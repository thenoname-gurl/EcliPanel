import { describe, expect, it } from 'bun:test';
import {
  randomBytes,
  randomHex,
  randomInt,
  sha256Hex,
  sha256Bytes,
  sha256Base64,
  sha256Base64Url,
  timingSafeEqual,
} from '../../src/utils/bunCrypto';

describe('bunCrypto utilities', () => {
  describe('randomBytes', () => {
    it('should return Uint8Array of specified length', () => {
      const result = randomBytes(16);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(16);
    });

    it('should return empty array for non-positive length', () => {
      expect(randomBytes(0).length).toBe(0);
      expect(randomBytes(-5).length).toBe(0);
      expect(randomBytes(NaN).length).toBe(0);
      expect(randomBytes(Infinity).length).toBe(0);
    });

    it('should generate different values on each call', () => {
      const a = randomBytes(8);
      const b = randomBytes(8);
      expect(Array.from(a)).not.toEqual(Array.from(b));
    });
  });

  describe('randomHex', () => {
    it('should return hex string with correct length', () => {
      const result = randomHex(16);
      expect(typeof result).toBe('string');
      expect(result.length).toBe(32);
      expect(/^[0-9a-f]+$/.test(result)).toBe(true);
    });

    it('should generate different hex values on each call', () => {
      const a = randomHex(8);
      const b = randomHex(8);
      expect(a).not.toBe(b);
    });
  });

  describe('randomInt', () => {
    it('should return integer within specified range', () => {
      for (let i = 0; i < 100; i++) {
        const result = randomInt(1, 10);
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThan(10);
      }
    });

    it('should return min when min equals max', () => {
      expect(randomInt(5, 5)).toBe(5);
      expect(randomInt(10, 5)).toBe(10);
    });

    it('should return 0 for non-finite values', () => {
      expect(randomInt(NaN, 10)).toBe(0);
      expect(randomInt(1, Infinity)).toBe(0);
    });
  });

  describe('sha256Hex', () => {
    it('should produce correct sha256 hash', () => {
      const result = sha256Hex('test');
      expect(typeof result).toBe('string');
      expect(result.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(result)).toBe(true);
    });

    it('should produce same hash for same input', () => {
      const a = sha256Hex('hello world');
      const b = sha256Hex('hello world');
      expect(a).toBe(b);
    });

    it('should produce different hash for different input', () => {
      const a = sha256Hex('hello');
      const b = sha256Hex('world');
      expect(a).not.toBe(b);
    });

    it('should accept Uint8Array input', () => {
      const input = new TextEncoder().encode('test');
      const result = sha256Hex(input);
      expect(typeof result).toBe('string');
      expect(result.length).toBe(64);
    });
  });

  describe('sha256Bytes', () => {
    it('should return Uint8Array of 32 bytes', () => {
      const result = sha256Bytes('test');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(32);
    });
  });

  describe('sha256Base64', () => {
    it('should return base64 encoded hash', () => {
      const result = sha256Base64('test');
      expect(typeof result).toBe('string');
      expect(/^[A-Za-z0-9+/=]+$/.test(result)).toBe(true);
    });
  });

  describe('sha256Base64Url', () => {
    it('should return url-safe base64 encoded hash', () => {
      const result = sha256Base64Url('test');
      expect(typeof result).toBe('string');
      expect(result).not.toContain('+');
      expect(result).not.toContain('/');
    });
  });

  describe('timingSafeEqual', () => {
    it('should return true for equal strings', () => {
      expect(timingSafeEqual('abc', 'abc')).toBe(true);
      expect(timingSafeEqual('', '')).toBe(true);
    });

    it('should return true for equal Uint8Arrays', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      expect(timingSafeEqual(a, b)).toBe(true);
    });

    it('should return false for different values', () => {
      expect(timingSafeEqual('abc', 'abd')).toBe(false);
      expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    });

    it('should return false for different lengths', () => {
      expect(timingSafeEqual('short', 'longerstring')).toBe(false);
    });
  });
});
