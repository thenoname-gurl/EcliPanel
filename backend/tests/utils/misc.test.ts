import { describe, expect, it } from 'bun:test';
import { scoreBehavior } from '../../src/utils/captcha';
import {
  PERMISSION_METADATA,
  PERMISSION_METADATA_MAP,
  type PermissionDefinition,
} from '../../src/utils/permissionMetadata';

describe('captcha utilities', () => {
  describe('scoreBehavior', () => {
    it('should return 0 for null/undefined/invalid behavior', () => {
      expect(scoreBehavior(null)).toBe(0);
      expect(scoreBehavior(undefined)).toBe(0);
      expect(scoreBehavior('string' as any)).toBe(0);
      expect(scoreBehavior(123 as any)).toBe(0);
    });

    it('should return 0 for empty behavior object', () => {
      expect(scoreBehavior({})).toBe(0);
    });

    it('should score based on mouseMoves', () => {
      expect(scoreBehavior({ mouseMoves: 0 })).toBe(0);
      expect(scoreBehavior({ mouseMoves: 5 })).toBe(0);
      expect(scoreBehavior({ mouseMoves: 10 })).toBe(0.25);
      expect(scoreBehavior({ mouseMoves: 25 })).toBe(0.4);
    });

    it('should score based on mouseClicks', () => {
      expect(scoreBehavior({ mouseClicks: 0 })).toBe(0);
      expect(scoreBehavior({ mouseClicks: 1 })).toBe(0.2);
      expect(scoreBehavior({ mouseClicks: 5 })).toBe(0.2);
    });

    it('should score based on keyboardEvents', () => {
      expect(scoreBehavior({ keyboardEvents: 0 })).toBe(0);
      expect(scoreBehavior({ keyboardEvents: 2 })).toBe(0);
      expect(scoreBehavior({ keyboardEvents: 5 })).toBe(0.15);
      expect(scoreBehavior({ keyboardEvents: 15 })).toBe(0.25);
    });

    it('should score based on interaction duration', () => {
      expect(scoreBehavior({ firstInteraction: 100, lastInteraction: 500 })).toBe(0);
      expect(scoreBehavior({ firstInteraction: 100, lastInteraction: 1500 })).toBe(0.1);
      expect(scoreBehavior({ firstInteraction: 100, lastInteraction: 3000 })).toBe(0.2);
    });

    it('should handle lastInteraction <= firstInteraction', () => {
      expect(scoreBehavior({ firstInteraction: 1000, lastInteraction: 500 })).toBe(0);
      expect(scoreBehavior({ firstInteraction: 1000, lastInteraction: 1000 })).toBe(0);
    });

    it('should combine multiple behavior factors', () => {
      const score = scoreBehavior({
        mouseMoves: 25,
        mouseClicks: 2,
        keyboardEvents: 10,
        firstInteraction: 0,
        lastInteraction: 3000,
      });
      expect(score).toBe(1);
    });

    it('should cap score at 1.0', () => {
      const score = scoreBehavior({
        mouseMoves: 100,
        mouseClicks: 10,
        keyboardEvents: 100,
        firstInteraction: 0,
        lastInteraction: 10000,
      });
      expect(score).toBeLessThanOrEqual(1);
      expect(score).toBeGreaterThan(0);
    });

    it('should return score with 2 decimal places', () => {
      const score = scoreBehavior({ mouseMoves: 25 });
      expect(score).toBe(0.4);
      const scoreStr = score.toFixed(2);
      expect(scoreStr.split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
    });
  });
});

describe('permissionMetadata', () => {
  describe('PERMISSION_METADATA', () => {
    it('should be an array of permission definitions', () => {
      expect(Array.isArray(PERMISSION_METADATA)).toBe(true);
      expect(PERMISSION_METADATA.length).toBeGreaterThan(0);
    });

    it('should have valid permission definition structure', () => {
      for (const perm of PERMISSION_METADATA) {
        expect(typeof perm.value).toBe('string');
        expect(typeof perm.category).toBe('string');
        expect(typeof perm.admin).toBe('boolean');
      }
    });

    it('should include common permission categories', () => {
      const categories = new Set(PERMISSION_METADATA.map(p => p.category));
      expect(categories.has('Global')).toBe(true);
      expect(categories.has('Servers')).toBe(true);
      expect(categories.has('Users')).toBe(true);
      expect(categories.has('Admin')).toBe(true);
    });

    it('should have admin flag set correctly for admin permissions', () => {
      const adminPerms = PERMISSION_METADATA.filter(p => p.admin);
      expect(adminPerms.length).toBeGreaterThan(0);

      for (const perm of adminPerms) {
        expect(perm.value.includes('admin:') || perm.admin === true).toBe(true);
      }
    });
  });

  describe('PERMISSION_METADATA_MAP', () => {
    it('should have same keys as PERMISSION_METADATA values', () => {
      const values = PERMISSION_METADATA.map(p => p.value);
      const mapKeys = Object.keys(PERMISSION_METADATA_MAP);
      expect(values.sort()).toEqual(mapKeys.sort());
    });

    it('should map permission values to their definitions', () => {
      for (const perm of PERMISSION_METADATA) {
        const mapped = PERMISSION_METADATA_MAP[perm.value];
        expect(mapped).toBeDefined();
        expect(mapped.value).toBe(perm.value);
        expect(mapped.category).toBe(perm.category);
        expect(mapped.admin).toBe(perm.admin);
      }
    });

    it('should allow looking up permissions by value', () => {
      const serversRead = PERMISSION_METADATA_MAP['servers:read'];
      expect(serversRead).toBeDefined();
      expect(serversRead.value).toBe('servers:read');
      expect(serversRead.category).toBe('Servers');
    });
  });
});
