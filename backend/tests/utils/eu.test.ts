import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import {
  isEUCountry,
  EU_COUNTRY_CODES,
  getCountryMinimumAgeFromRules,
  isAgeAllowedForCountry,
  getGeoBlockLevelFromRules,
  isEUIdVerificationDisabledForCountry,
} from '../../src/utils/eu';

const originalEnvEuIdDisabled = process.env.EU_ID_DISABLED;

describe('eu utilities', () => {
  beforeEach(() => {
    delete process.env.EU_ID_DISABLED;
  });

  afterEach(() => {
    if (originalEnvEuIdDisabled !== undefined) {
      process.env.EU_ID_DISABLED = originalEnvEuIdDisabled;
    } else {
      delete process.env.EU_ID_DISABLED;
    }
  });

  describe('isEUCountry', () => {
    it('should return true for EU countries by code', () => {
      expect(isEUCountry('de')).toBe(true);
      expect(isEUCountry('DE')).toBe(true);
      expect(isEUCountry('fr')).toBe(true);
      expect(isEUCountry('at')).toBe(true);
      expect(isEUCountry('be')).toBe(true);
    });

    it('should return true for EU countries by name', () => {
      expect(isEUCountry('germany')).toBe(true);
      expect(isEUCountry('Germany')).toBe(true);
      expect(isEUCountry('france')).toBe(true);
      expect(isEUCountry('austria')).toBe(true);
    });

    it('should return false for non-EU countries', () => {
      expect(isEUCountry('us')).toBe(false);
      expect(isEUCountry('USA')).toBe(false);
      expect(isEUCountry('united states')).toBe(false);
      expect(isEUCountry('cn')).toBe(false);
      expect(isEUCountry('ru')).toBe(false);
    });

    it('should return false for null/undefined/empty', () => {
      expect(isEUCountry(null)).toBe(false);
      expect(isEUCountry(undefined)).toBe(false);
      expect(isEUCountry('')).toBe(false);
    });

    it('should handle whitespace', () => {
      expect(isEUCountry('  de  ')).toBe(true);
      expect(isEUCountry('  Germany  ')).toBe(true);
    });
  });

  describe('EU_COUNTRY_CODES', () => {
    it('should contain 27 EU countries', () => {
      expect(EU_COUNTRY_CODES.length).toBe(27);
      expect(EU_COUNTRY_CODES).toContain('de');
      expect(EU_COUNTRY_CODES).toContain('fr');
      expect(EU_COUNTRY_CODES).toContain('at');
      expect(EU_COUNTRY_CODES).toContain('pl');
      expect(EU_COUNTRY_CODES).toContain('se');
    });
  });

  describe('isEUIdVerificationDisabledForCountry', () => {
    it('should return false when EU_ID_DISABLED is not set', () => {
      delete process.env.EU_ID_DISABLED;
      expect(isEUIdVerificationDisabledForCountry('de')).toBe(false);
    });

    it('should return false when EU_ID_DISABLED is not "true"', () => {
      process.env.EU_ID_DISABLED = 'false';
      expect(isEUIdVerificationDisabledForCountry('de')).toBe(false);
      process.env.EU_ID_DISABLED = '0';
      expect(isEUIdVerificationDisabledForCountry('de')).toBe(false);
    });

    it('should return true when EU_ID_DISABLED is "true" and country is EU', () => {
      process.env.EU_ID_DISABLED = 'true';
      expect(isEUIdVerificationDisabledForCountry('de')).toBe(true);
      expect(isEUIdVerificationDisabledForCountry('fr')).toBe(true);
    });

    it('should return false when EU_ID_DISABLED is "true" but country is not EU', () => {
      process.env.EU_ID_DISABLED = 'true';
      expect(isEUIdVerificationDisabledForCountry('us')).toBe(false);
    });
  });

  describe('getCountryMinimumAgeFromRules', () => {
    it('should return default age for EU/UK without rules', () => {
      expect(getCountryMinimumAgeFromRules('de')).toBe(14);
      expect(getCountryMinimumAgeFromRules('france')).toBe(14);
      expect(getCountryMinimumAgeFromRules('uk')).toBe(14);
      expect(getCountryMinimumAgeFromRules('Great Britain')).toBe(14);
    });

    it('should return default age of 13 for non-EU without rules', () => {
      expect(getCountryMinimumAgeFromRules('us')).toBe(13);
      expect(getCountryMinimumAgeFromRules('cn')).toBe(13);
      expect(getCountryMinimumAgeFromRules('au')).toBe(13);
    });

    it('should use custom rules when provided with exact match', () => {
      const rules = { us: 16, de: 16 };
      expect(getCountryMinimumAgeFromRules('us', rules)).toBe(16);
      expect(getCountryMinimumAgeFromRules('de', rules)).toBe(16);
    });

    it('should fall back to first 2 chars of country name', () => {
      const rules = { ge: 16 };
      expect(getCountryMinimumAgeFromRules('germany', rules)).toBe(16);
    });

    it('should use "eu" rule key for EU countries', () => {
      const rules = { eu: 15 };
      expect(getCountryMinimumAgeFromRules('de', rules)).toBe(15);
      expect(getCountryMinimumAgeFromRules('fr', rules)).toBe(15);
    });

    it('should use "uk" rule key for UK countries', () => {
      const rules = { uk: 16 };
      expect(getCountryMinimumAgeFromRules('uk', rules)).toBe(16);
      expect(getCountryMinimumAgeFromRules('gb', rules)).toBe(16);
    });
  });

  describe('isAgeAllowedForCountry', () => {
    it('should return true when age meets or exceeds minimum', () => {
      expect(isAgeAllowedForCountry(13, 'us')).toBe(true);
      expect(isAgeAllowedForCountry(14, 'de')).toBe(true);
      expect(isAgeAllowedForCountry(18, 'us')).toBe(true);
      expect(isAgeAllowedForCountry(99, 'de')).toBe(true);
    });

    it('should return false when age is below minimum', () => {
      expect(isAgeAllowedForCountry(12, 'us')).toBe(false);
      expect(isAgeAllowedForCountry(13, 'de')).toBe(false);
    });

    it('should respect custom rules', () => {
      const rules = { us: 16 };
      expect(isAgeAllowedForCountry(15, 'us', rules)).toBe(false);
      expect(isAgeAllowedForCountry(16, 'us', rules)).toBe(true);
    });
  });

  describe('getGeoBlockLevelFromRules', () => {
    it('should return 0 when country is falsy', () => {
      expect(getGeoBlockLevelFromRules(null, {})).toBe(0);
      expect(getGeoBlockLevelFromRules(undefined, {})).toBe(0);
      expect(getGeoBlockLevelFromRules('', {})).toBe(0);
    });

    it('should return 0 when country not in rules and EU_ID_DISABLED not set', () => {
      delete process.env.EU_ID_DISABLED;
      expect(getGeoBlockLevelFromRules('us', {})).toBe(0);
      expect(getGeoBlockLevelFromRules('de', {})).toBe(0);
    });

    it('should return level from rules when country matches', () => {
      delete process.env.EU_ID_DISABLED;
      expect(getGeoBlockLevelFromRules('us', { us: 3 })).toBe(3);
      expect(getGeoBlockLevelFromRules('de', { de: 2 })).toBe(2);
    });

    it('should match case-insensitively', () => {
      delete process.env.EU_ID_DISABLED;
      expect(getGeoBlockLevelFromRules('US', { us: 3 })).toBe(3);
      expect(getGeoBlockLevelFromRules('DE', { de: 2 })).toBe(2);
    });

    it('should fall back to first 2 chars of country name', () => {
      delete process.env.EU_ID_DISABLED;
      expect(getGeoBlockLevelFromRules('germany', { ge: 2 })).toBe(2);
    });

    it('should return baseLevel 1 when EU_ID_DISABLED=true for EU countries', () => {
      process.env.EU_ID_DISABLED = 'true';
      expect(getGeoBlockLevelFromRules('de', {})).toBe(1);
      expect(getGeoBlockLevelFromRules('fr', {})).toBe(1);
    });

    it('should return exact rule match when EU_ID_DISABLED=true (exact match takes priority)', () => {
      process.env.EU_ID_DISABLED = 'true';
      expect(getGeoBlockLevelFromRules('de', { de: 0 })).toBe(0);
      expect(getGeoBlockLevelFromRules('de', { de: 2 })).toBe(2);
    });

    it('should fall back to baseLevel 1 when no rule match and EU_ID_DISABLED=true', () => {
      process.env.EU_ID_DISABLED = 'true';
      expect(getGeoBlockLevelFromRules('de', {})).toBe(1);
    });
  });
});
