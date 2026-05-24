import type { Locale } from './config';
import { locales, defaultLocale } from './config';

const localeSet = new Set<string>(locales);

export function resolveLocale(opts: {
  cookie?: Record<string, unknown>;
  headers?: Headers;
  user?: { settings?: Record<string, unknown> } | null;
}): Locale {
  if (opts.user?.settings?.locale && typeof opts.user.settings.locale === 'string') {
    const val = opts.user.settings.locale;
    if (localeSet.has(val)) return val as Locale;
  }

  const rawCookie = opts.cookie?.locale;
  const cookieLocale = typeof rawCookie === 'string' ? rawCookie : (rawCookie as any)?.value;
  if (cookieLocale && localeSet.has(cookieLocale)) {
    return cookieLocale as Locale;
  }

  if (opts.headers) {
    const accept = opts.headers.get('Accept-Language') || opts.headers.get('accept-language');
    if (accept) {
      const tag = accept.split(',')[0]?.split('-')[0]?.trim().toLowerCase();
      if (tag && localeSet.has(tag)) return tag as Locale;
    }
  }

  return defaultLocale;
}
