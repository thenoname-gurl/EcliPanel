import { resolveLocale } from './resolve';
import { getMessages } from './loader';
import { createT } from './t';

export { locales, defaultLocale } from './config';
export type { Locale } from './config';
export { preloadAll, getMessages } from './loader';
export { resolveLocale } from './resolve';
export { createT } from './t';
export type { TFunction } from './t';
export { i18n } from './plugin';

export { locales as supportedLocales } from './config';

export function tForUser(user?: { settings?: Record<string, unknown> } | null) {
  const locale = resolveLocale({ user });
  return createT(getMessages(locale));
}
