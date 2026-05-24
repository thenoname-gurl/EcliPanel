import { defaultLocale } from '../i18n/config';
import { getMessages } from '../i18n/loader';
import { createT } from '../i18n/t';

const SENSITIVE_PATTERNS = [
  /(['"]?password['"]?\s*[:=]\s*)[^'"\s,;}]+/gi,
  /(-----BEGIN\s+[A-Z]+\s+PRIVATE\s+KEY-----)/g,
];

function cleanErrorMessage(msg: string): string {
  let cleaned = msg.replace(/\n.*$/s, '').trim();
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '$1***');
  }
  return cleaned;
}

export function sanitizeError(e: any, context?: string, locale?: string): string {
  console.error(`[${context ?? 'error'}]`, e instanceof Error ? e.stack : e);

  if (e?.response?.data?.errors?.[0]?.detail) {
    const detail =
      typeof e.response.data.errors[0].detail === 'string'
        ? e.response.data.errors[0].detail
        : String(e.response.data.errors[0].detail);
    return cleanErrorMessage(detail);
  }
  if (e?.response?.data?.error) {
    const error =
      typeof e.response.data.error === 'string'
        ? e.response.data.error
        : String(e.response.data.error);
    return cleanErrorMessage(error);
  }

  const rawMessage = e?.message || String(e);
  const cleaned = cleanErrorMessage(rawMessage);
  if (cleaned.length > 0) {
    return cleaned;
  }

  const t = createT(getMessages(defaultLocale));
  return t('common.unexpectedError');
}
