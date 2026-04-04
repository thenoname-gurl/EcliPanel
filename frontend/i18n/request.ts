import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, locales, type AppLocale } from "./config";

const toSupportedLocale = (value: string | null | undefined): AppLocale | null => {
  if (!value) return null;

  const normalized = value.toLowerCase();
  if (hasLocale(locales, normalized)) return normalized as AppLocale;

  const base = normalized.split("-")[0];
  if (hasLocale(locales, base)) return base as AppLocale;

  return null;
};

const getLocaleFromAcceptLanguage = (acceptLanguage: string | null): AppLocale => {
  if (!acceptLanguage) return defaultLocale;

  const ordered = acceptLanguage
    .split(",")
    .map((part) => part.trim().split(";")[0])
    .filter(Boolean);

  for (const candidate of ordered) {
    const locale = toSupportedLocale(candidate);
    if (locale) return locale;
  }

  return defaultLocale;
};

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieLocale = toSupportedLocale(cookieStore.get("locale")?.value);
  const locale = cookieLocale ?? getLocaleFromAcceptLanguage(headerStore.get("accept-language"));

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});