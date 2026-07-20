export const locales = ["en", "ru", "zh", "ja", "hi"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";