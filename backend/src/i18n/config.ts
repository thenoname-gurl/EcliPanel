export const locales = ['en', 'ru', 'zh', 'ja', 'hi'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';
