import { describe, expect, it } from 'bun:test';
import {
  parseIpv6,
  formatIpv6,
  parseIpv6Cidr,
  isValidIpv6,
  isValidIpv6Cidr,
  isIpv6InSubnet,
  getNextFreeIpv6Address,
} from '../../src/utils/ipv6';

describe('ipv6 utilities', () => {
  describe('parseIpv6', () => {
    it('should parse full IPv6 addresses', () => {
      const result = parseIpv6('2001:db8::1');
      expect(typeof result).toBe('bigint');
      expect(result).toBeGreaterThan(0n);
    });

    it('should parse loopback address', () => {
      const result = parseIpv6('::1');
      expect(result).toBe(1n);
    });

    it('should parse unspecified address', () => {
      const result = parseIpv6('::');
      expect(result).toBe(0n);
    });

    it('should throw on invalid IPv6', () => {
      expect(() => parseIpv6('')).toThrow('Invalid IPv6 address');
      expect(() => parseIpv6('not-an-ipv6')).toThrow();
      expect(() => parseIpv6('192.168.1.1')).toThrow();
    });

    it('should handle zone index suffix', () => {
      const result = parseIpv6('fe80::1%eth0');
      expect(result).toBe(parseIpv6('fe80::1'));
    });
  });

  describe('formatIpv6', () => {
    it('should format bigint to IPv6 string', () => {
      const parsed = parseIpv6('2001:db8::1');
      const formatted = formatIpv6(parsed);
      expect(formatted).toBe('2001:db8::1');
    });

    it('should format loopback', () => {
      expect(formatIpv6(1n)).toBe('::1');
    });

    it('should format unspecified', () => {
      expect(formatIpv6(0n)).toBe('::');
    });

    it('should round-trip correctly', () => {
      const addresses = [
        '2001:db8::1',
        '::1',
        '::',
        'fe80::1',
        'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
      ];

      for (const addr of addresses) {
        const parsed = parseIpv6(addr);
        const formatted = formatIpv6(parsed);
        expect(formatted).toBe(addr);
      }
    });
  });

  describe('isValidIpv6', () => {
    it('should return true for valid IPv6', () => {
      expect(isValidIpv6('::1')).toBe(true);
      expect(isValidIpv6('2001:db8::1')).toBe(true);
      expect(isValidIpv6('fe80::1%eth0')).toBe(true);
    });

    it('should return false for invalid IPv6', () => {
      expect(isValidIpv6('')).toBe(false);
      expect(isValidIpv6('not-ipv6')).toBe(false);
      expect(isValidIpv6('192.168.1.1')).toBe(false);
    });
  });

  describe('parseIpv6Cidr', () => {
    it('should parse CIDR notation', () => {
      const result = parseIpv6Cidr('2001:db8::/64');
      expect(result.network).toBe(parseIpv6('2001:db8::'));
      expect(result.prefix).toBe(64);
    });

    it('should throw on invalid CIDR', () => {
      expect(() => parseIpv6Cidr('')).toThrow();
      expect(() => parseIpv6Cidr('2001:db8::')).toThrow();
      expect(() => parseIpv6Cidr('2001:db8::/129')).toThrow();
      expect(() => parseIpv6Cidr('2001:db8::/-1')).toThrow();
    });
  });

  describe('isValidIpv6Cidr', () => {
    it('should return true for valid CIDR', () => {
      expect(isValidIpv6Cidr('2001:db8::/64')).toBe(true);
      expect(isValidIpv6Cidr('::/0')).toBe(true);
      expect(isValidIpv6Cidr('::1/128')).toBe(true);
    });

    it('should return false for invalid CIDR', () => {
      expect(isValidIpv6Cidr('')).toBe(false);
      expect(isValidIpv6Cidr('2001:db8::')).toBe(false);
      expect(isValidIpv6Cidr('not-cidr')).toBe(false);
    });
  });

  describe('isIpv6InSubnet', () => {
    it('should check if address is in subnet', () => {
      expect(isIpv6InSubnet('2001:db8::1', '2001:db8::/64')).toBe(true);
      expect(isIpv6InSubnet('2001:db8::ffff', '2001:db8::/64')).toBe(true);
      expect(isIpv6InSubnet('2001:db8:1::1', '2001:db8::/64')).toBe(false);
    });

    it('should handle /128 prefix', () => {
      expect(isIpv6InSubnet('::1', '::1/128')).toBe(true);
      expect(isIpv6InSubnet('::2', '::1/128')).toBe(false);
    });

    it('should return false for invalid input', () => {
      expect(isIpv6InSubnet('', '2001:db8::/64')).toBe(false);
      expect(isIpv6InSubnet('2001:db8::1', 'invalid')).toBe(false);
    });
  });

  describe('getNextFreeIpv6Address', () => {
    it('should get first available address', () => {
      const used = new Set<string>();
      const result = getNextFreeIpv6Address('2001:db8::/120', used);
      expect(result).toBe('2001:db8::1');
    });

    it('should skip used addresses', () => {
      const used = new Set(['2001:db8::1', '2001:db8::2']);
      const result = getNextFreeIpv6Address('2001:db8::/120', used);
      expect(result).toBe('2001:db8::3');
    });

    it('should return null when all addresses used', () => {
      const used = new Set<string>();
      for (let i = 1; i < 256; i++) {
        used.add(`2001:db8::${i.toString(16)}`);
      }
      const result = getNextFreeIpv6Address('2001:db8::/120', used);
      expect(result).toBeNull();
    });
  });
});
