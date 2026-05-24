import type { Locale } from './config';
import { locales } from './config';

type Messages = Record<string, unknown>;

const cache = new Map<Locale, Messages>();

const messagesDir = import.meta.dirname + '/messages';

function loadFile(locale: Locale): Promise<Messages> {
  return Bun.file(`${messagesDir}/${locale}.json`).json();
}

export async function preloadAll(): Promise<void> {
  await Promise.all(
    locales.map(async locale => {
      const data = await loadFile(locale);
      cache.set(locale, data);
    })
  );
}

export function getMessages(locale: Locale): Messages {
  const msgs = cache.get(locale);
  if (!msgs) {
    throw new Error(`Messages for locale "${locale}" not loaded. Call preloadAll() at boot!`);
  }
  return msgs;
}
