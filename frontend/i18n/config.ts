export const locales = ["en", "ru"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";