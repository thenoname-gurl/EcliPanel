import { describe, expect, it } from 'bun:test';
import {
  formatDateOfBirth,
  parseDateOfBirth,
  getAdultAgeForCountry,
  isAdultByCountry,
  isMinorByCountry,
  getAgeFromDate,
  getRequesterIp,
  COUNTRY_ADULT_AGE,
  type RequestContextLike,
} from '../../src/utils/user';

describe('user utilities', () => {
  describe('formatDateOfBirth', () => {
    it('should return null for null/undefined/empty/falsy values', () => {
      expect(formatDateOfBirth(null)).toBeNull();
      expect(formatDateOfBirth(undefined)).toBeNull();
      expect(formatDateOfBirth('')).toBeNull();
      expect(formatDateOfBirth(0)).toBeNull();
      expect(formatDateOfBirth(false)).toBeNull();
    });

    it('should format Date objects to ISO date string', () => {
      const date = new Date('2000-05-15');
      expect(formatDateOfBirth(date)).toBe('2000-05-15');
    });

    it('should convert other values to string', () => {
      expect(formatDateOfBirth('2000-05-15')).toBe('2000-05-15');
      expect(formatDateOfBirth(12345)).toBe('12345');
    });
  });

  describe('parseDateOfBirth', () => {
    it('should return null for null/undefined/empty/falsy values', () => {
      expect(parseDateOfBirth(null)).toBeNull();
      expect(parseDateOfBirth(undefined)).toBeNull();
      expect(parseDateOfBirth('')).toBeNull();
    });

    it('should parse valid date strings', () => {
      const result = parseDateOfBirth('2000-05-15');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2000);
      expect(result?.getMonth()).toBe(4);
      expect(result?.getDate()).toBe(15);
    });

    it('should return null for invalid date strings', () => {
      expect(parseDateOfBirth('not-a-date')).toBeNull();
      expect(parseDateOfBirth('invalid')).toBeNull();
    });

    it('should parse Date objects', () => {
      const date = new Date('2000-05-15');
      const result = parseDateOfBirth(date);
      expect(result).toEqual(date);
    });
  });

  describe('COUNTRY_ADULT_AGE', () => {
    it('should have special age rules for specific countries', () => {
      expect(COUNTRY_ADULT_AGE.CA).toBe(19);
      expect(COUNTRY_ADULT_AGE.TH).toBe(20);
      expect(COUNTRY_ADULT_AGE.TW).toBe(20);
      expect(COUNTRY_ADULT_AGE.AE).toBe(21);
      expect(COUNTRY_ADULT_AGE.BH).toBe(21);
      expect(COUNTRY_ADULT_AGE.OM).toBe(21);
    });
  });

  describe('getAdultAgeForCountry', () => {
    it('should return 18 as default for null/undefined/empty', () => {
      expect(getAdultAgeForCountry(null)).toBe(18);
      expect(getAdultAgeForCountry(undefined)).toBe(18);
      expect(getAdultAgeForCountry('')).toBe(18);
    });

    it('should return 18 for most countries', () => {
      expect(getAdultAgeForCountry('US')).toBe(18);
      expect(getAdultAgeForCountry('uk')).toBe(18);
      expect(getAdultAgeForCountry('DE')).toBe(18);
      expect(getAdultAgeForCountry('fr')).toBe(18);
    });

    it('should return special ages for specific countries', () => {
      expect(getAdultAgeForCountry('CA')).toBe(19);
      expect(getAdultAgeForCountry('ca')).toBe(19);
      expect(getAdultAgeForCountry('TH')).toBe(20);
      expect(getAdultAgeForCountry('TW')).toBe(20);
      expect(getAdultAgeForCountry('AE')).toBe(21);
      expect(getAdultAgeForCountry('BH')).toBe(21);
      expect(getAdultAgeForCountry('OM')).toBe(21);
    });

    it('should trim and uppercase country codes', () => {
      expect(getAdultAgeForCountry('  ca  ')).toBe(19);
      expect(getAdultAgeForCountry('de ')).toBe(18);
    });
  });

  describe('isAdultByCountry', () => {
    it('should compare age against country adult age', () => {
      expect(isAdultByCountry(18, 'US')).toBe(true);
      expect(isAdultByCountry(17, 'US')).toBe(false);

      expect(isAdultByCountry(19, 'CA')).toBe(true);
      expect(isAdultByCountry(18, 'CA')).toBe(false);

      expect(isAdultByCountry(21, 'AE')).toBe(true);
      expect(isAdultByCountry(20, 'AE')).toBe(false);
    });

    it('should use default age of 18 when country is null/undefined', () => {
      expect(isAdultByCountry(18, null)).toBe(true);
      expect(isAdultByCountry(17, undefined)).toBe(false);
    });
  });

  describe('isMinorByCountry', () => {
    it('should be inverse of isAdultByCountry', () => {
      expect(isMinorByCountry(17, 'US')).toBe(true);
      expect(isMinorByCountry(18, 'US')).toBe(false);

      expect(isMinorByCountry(18, 'CA')).toBe(true);
      expect(isMinorByCountry(19, 'CA')).toBe(false);
    });

    it('should use default age of 18 when country is null/undefined', () => {
      expect(isMinorByCountry(17, null)).toBe(true);
      expect(isMinorByCountry(18, undefined)).toBe(false);
    });
  });

  describe('getAgeFromDate', () => {
    it('should return null for null/undefined/empty', () => {
      expect(getAgeFromDate(null)).toBeNull();
      expect(getAgeFromDate(undefined)).toBeNull();
      expect(getAgeFromDate('')).toBeNull();
    });

    it('should return null for invalid dates', () => {
      expect(getAgeFromDate('not-a-date')).toBeNull();
    });

    it('should calculate age correctly for someone born years ago', () => {
      const twentyYearsAgo = new Date();
      twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
      const age = getAgeFromDate(twentyYearsAgo);
      expect(age).toBe(20);
    });

    it('should account for month/day (birthday not yet passed this year)', () => {
      const today = new Date();
      const nextMonth = (today.getMonth() + 1) % 12;
      const birthDate = new Date();
      birthDate.setFullYear(today.getFullYear() - 20);
      birthDate.setMonth(nextMonth);
      const age = getAgeFromDate(birthDate);
      expect(age).toBe(19);
    });

    it('should accept string dates', () => {
      const twentyYearsAgo = new Date();
      twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
      const dateStr = twentyYearsAgo.toISOString().split('T')[0];
      const age = getAgeFromDate(dateStr);
      expect(age).toBeGreaterThanOrEqual(19);
      expect(age).toBeLessThanOrEqual(20);
    });
  });

  describe('getRequesterIp', () => {
    it('should extract first IP from x-forwarded-for header', () => {
      const ctx: RequestContextLike = {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1, proxy' },
      };
      expect(getRequesterIp(ctx)).toBe('192.168.1.1');
    });

    it('should use direct ip when x-forwarded-for is not available', () => {
      const ctx: RequestContextLike = {
        ip: '10.0.0.1',
        headers: {},
      };
      expect(getRequesterIp(ctx)).toBe('10.0.0.1');
    });

    it('should use request.ip when ip is not available', () => {
      const ctx: RequestContextLike = {
        request: { ip: '172.16.0.1' },
        headers: {},
      };
      expect(getRequesterIp(ctx)).toBe('172.16.0.1');
    });

    it('should return "unknown" when no IP is available', () => {
      const ctx: RequestContextLike = {
        headers: {},
      };
      expect(getRequesterIp(ctx)).toBe('unknown');
    });

    it('should prioritize x-forwarded-for over direct ip', () => {
      const ctx: RequestContextLike = {
        headers: { 'x-forwarded-for': '203.0.113.1' },
        ip: '10.0.0.1',
      };
      expect(getRequesterIp(ctx)).toBe('203.0.113.1');
    });

    it('should truncate IP to 100 characters', () => {
      const longIp = 'a'.repeat(150);
      const ctx: RequestContextLike = {
        headers: { 'x-forwarded-for': longIp },
      };
      expect(getRequesterIp(ctx).length).toBe(100);
    });
  });
});
