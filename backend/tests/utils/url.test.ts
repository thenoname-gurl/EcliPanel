import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import {
  normalizeUrl,
  normalizeOrigin,
  getHostnameFromUrl,
  isSubdomainOf,
  getPanelUrl,
  getBackendUrl,
  getFrontendHost,
  getCookieDomain,
  isSecureRequest,
  resolvePanelBaseUrl,
  type RequestContextLike,
} from '../../src/utils/url';

const originalEnv = { ...process.env };

describe('url utilities', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('normalizeUrl', () => {
    it('should return origin from full URL', () => {
      expect(normalizeUrl('https://example.com/path?query=1')).toBe('https://example.com');
    });

    it('should handle URLs without protocol by adding https://', () => {
      expect(normalizeUrl('example.com')).toBe('https://example.com');
    });

    it('should try to add https:// for any string', () => {
      expect(normalizeUrl('not-a-url')).toBe('https://not-a-url');
    });

    it('should remove trailing slashes', () => {
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
    });
  });

  describe('normalizeOrigin', () => {
    it('should normalize string origins', () => {
      expect(normalizeOrigin('https://example.com/path')).toBe('https://example.com');
    });

    it('should return empty string for null/undefined', () => {
      expect(normalizeOrigin(null)).toBe('');
      expect(normalizeOrigin(undefined)).toBe('');
    });

    it('should handle URL objects', () => {
      const url = new URL('https://example.com/path');
      expect(normalizeOrigin(url)).toBe('https://example.com');
    });
  });

  describe('getHostnameFromUrl', () => {
    it('should extract hostname from URL', () => {
      expect(getHostnameFromUrl('https://sub.example.com:8080/path')).toBe('sub.example.com');
    });

    it('should return input as-is if not a valid URL', () => {
      expect(getHostnameFromUrl('not-a-url')).toBe('not-a-url');
    });
  });

  describe('isSubdomainOf', () => {
    it('should identify subdomains correctly', () => {
      expect(isSubdomainOf('sub.example.com', 'example.com')).toBe(true);
      expect(isSubdomainOf('deep.sub.example.com', 'example.com')).toBe(true);
    });

    it('should handle leading dots', () => {
      expect(isSubdomainOf('.sub.example.com', 'example.com')).toBe(true);
      expect(isSubdomainOf('sub.example.com', '.example.com')).toBe(true);
    });

    it('should return false for non-subdomains', () => {
      expect(isSubdomainOf('other.com', 'example.com')).toBe(false);
      expect(isSubdomainOf('example.com', 'other.com')).toBe(false);
    });

    it('should return true for same domain (cookie matching)', () => {
      expect(isSubdomainOf('example.com', 'example.com')).toBe(true);
    });
  });

  describe('getPanelUrl', () => {
    it('should return PANEL_URL from env when set', () => {
      process.env.PANEL_URL = 'https://panel.example.com';
      expect(getPanelUrl()).toBe('https://panel.example.com');
    });

    it('should strip trailing slashes from PANEL_URL', () => {
      process.env.PANEL_URL = 'https://panel.example.com/';
      expect(getPanelUrl()).toBe('https://panel.example.com');
    });

    it('should fall back to FRONTEND_URL when PANEL_URL is not set', () => {
      delete process.env.PANEL_URL;
      process.env.FRONTEND_URL = 'https://frontend.example.com';
      expect(getPanelUrl()).toBe('https://frontend.example.com');
    });

    it('should ignore CORS wildcard values (*)', () => {
      process.env.PANEL_URL = '*';
      process.env.FRONTEND_URL = undefined as unknown as string;
      expect(getPanelUrl()).toBe('https://ecli.app');
    });

    it('should ignore CORS wildcard values (true)', () => {
      process.env.PANEL_URL = 'true';
      process.env.FRONTEND_URL = undefined as unknown as string;
      expect(getPanelUrl()).toBe('https://ecli.app');
    });

    it('should return default when no env vars and no context', () => {
      delete process.env.PANEL_URL;
      delete process.env.FRONTEND_URL;
      expect(getPanelUrl()).toBe('https://ecli.app');
    });

    it('should use origin header from context when available', () => {
      delete process.env.PANEL_URL;
      delete process.env.FRONTEND_URL;
      const ctx: RequestContextLike = {
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'origin' ? 'https://custom-origin.com' : null,
        },
      };
      expect(getPanelUrl(ctx)).toBe('https://custom-origin.com');
    });

    it('should build URL from proto and host headers', () => {
      delete process.env.PANEL_URL;
      delete process.env.FRONTEND_URL;
      const ctx: RequestContextLike = {
        headers: {
          'x-forwarded-proto': 'https',
          host: 'app.example.com:8080',
        },
      };
      expect(getPanelUrl(ctx)).toBe('https://app.example.com:8080');
    });
  });

  describe('resolvePanelBaseUrl', () => {
    it('should be an alias for getPanelUrl', () => {
      process.env.PANEL_URL = 'https://panel.example.com';
      expect(resolvePanelBaseUrl()).toBe(getPanelUrl());
    });
  });

  describe('getBackendUrl', () => {
    it('should return BACKEND_URL from env when set', () => {
      process.env.BACKEND_URL = 'https://api.example.com/';
      expect(getBackendUrl()).toBe('https://api.example.com');
    });

    it('should strip trailing slashes', () => {
      process.env.BACKEND_URL = 'https://api.example.com/';
      expect(getBackendUrl()).toBe('https://api.example.com');
    });

    it('should build from context headers when no env var', () => {
      delete process.env.BACKEND_URL;
      const ctx: RequestContextLike = {
        headers: {
          'x-forwarded-proto': 'http',
          host: 'localhost:3000',
        },
      };
      expect(getBackendUrl(ctx)).toBe('http://localhost:3000');
    });

    it('should return default when no context and no env var', () => {
      delete process.env.BACKEND_URL;
      expect(getBackendUrl()).toBe('http://localhost:3000');
    });
  });

  describe('getFrontendHost', () => {
    it('should return default when no context', () => {
      expect(getFrontendHost()).toBe('localhost');
    });

    it('should extract hostname from origin header', () => {
      const ctx: RequestContextLike = {
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === 'origin') return 'https://app.example.com:8080';
            return null;
          },
        },
      };
      expect(getFrontendHost(ctx)).toBe('app.example.com');
    });

    it('should use referer if origin not available', () => {
      const ctx: RequestContextLike = {
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === 'referer') return 'https://app.example.com/path';
            return null;
          },
        },
      };
      expect(getFrontendHost(ctx)).toBe('app.example.com');
    });

    it('should use hostname property from context', () => {
      const ctx: RequestContextLike = {
        hostname: 'direct.example.com',
        headers: {},
      };
      expect(getFrontendHost(ctx)).toBe('direct.example.com');
    });

    it('should extract from host header as last resort', () => {
      const ctx: RequestContextLike = {
        headers: {
          host: 'header.example.com:8443',
        },
      };
      expect(getFrontendHost(ctx)).toBe('header.example.com');
    });
  });

  describe('getCookieDomain', () => {
    it('should return JWT_COOKIE_DOMAIN from env when set', () => {
      process.env.JWT_COOKIE_DOMAIN = '.example.com';
      expect(getCookieDomain()).toBe('.example.com');
    });

    it('should return null when no context and no env var', () => {
      delete process.env.JWT_COOKIE_DOMAIN;
      expect(getCookieDomain()).toBeNull();
    });

    it('should return null for single-part hostname', () => {
      delete process.env.JWT_COOKIE_DOMAIN;
      const ctx: RequestContextLike = {
        headers: { host: 'localhost' },
      };
      expect(getCookieDomain(ctx)).toBeNull();
    });

    it('should use base domain for two-part hostname', () => {
      delete process.env.JWT_COOKIE_DOMAIN;
      const ctx: RequestContextLike = {
        headers: { host: 'example.com:8080' },
      };
      expect(getCookieDomain(ctx)).toBe('.example.com');
    });

    it('should strip leading subdomain for multi-part hostname', () => {
      delete process.env.JWT_COOKIE_DOMAIN;
      const ctx: RequestContextLike = {
        headers: { host: 'app.example.com' },
      };
      expect(getCookieDomain(ctx)).toBe('.example.com');
    });

    it('should handle deep subdomains by stripping only one level', () => {
      delete process.env.JWT_COOKIE_DOMAIN;
      const ctx: RequestContextLike = {
        headers: { host: 'deep.sub.example.com' },
      };
      expect(getCookieDomain(ctx)).toBe('.sub.example.com');
    });
  });

  describe('isSecureRequest', () => {
    beforeEach(() => {
      delete process.env.JWT_COOKIE_SECURE;
    });

    it('should return true when JWT_COOKIE_SECURE is 1', () => {
      process.env.JWT_COOKIE_SECURE = '1';
      const ctx: RequestContextLike = { headers: {} };
      expect(isSecureRequest(ctx)).toBe(true);
    });

    it('should return true when x-forwarded-proto is https', () => {
      const ctx: RequestContextLike = {
        headers: {
          get: (name: string) => (name.toLowerCase() === 'x-forwarded-proto' ? 'https' : null),
        },
      };
      expect(isSecureRequest(ctx)).toBe(true);
    });

    it('should return true when protocol is https', () => {
      const ctx: RequestContextLike = {
        protocol: 'https',
        headers: {},
      };
      expect(isSecureRequest(ctx)).toBe(true);
    });

    it('should return false for http requests without secure flag', () => {
      const ctx: RequestContextLike = {
        protocol: 'http',
        headers: { 'x-forwarded-proto': 'http' },
      };
      expect(isSecureRequest(ctx)).toBe(false);
    });
  });
});
