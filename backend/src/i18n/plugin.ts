import { Elysia } from 'elysia';
import type { Locale } from './config';
import { getMessages } from './loader';
import { resolveLocale } from './resolve';
import { createT, type TFunction } from './t';

export const i18n = new Elysia({ name: 'i18n' }).derive('global', async ctx => {
  let cached: { locale: Locale; t: TFunction } | null = null;
  let usedUser = false;

  function resolve(ctx: any) {
    const hasUser = !!ctx.user;
    if (cached && usedUser === hasUser) return cached;

    const locale = resolveLocale({
      cookie: ctx.cookie as Record<string, unknown>,
      headers: ctx.request?.headers,
      user: ctx.user ?? null,
    });
    const t = createT(getMessages(locale));
    cached = { locale, t };
    usedUser = hasUser;
    return cached;
  }

  const initial = resolve(ctx);

  function t(path: string, vars?: Record<string, string | number>): string {
    return resolve(ctx).t(path, vars);
  }

  return { locale: initial.locale, t };
});
