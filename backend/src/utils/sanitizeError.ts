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

export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return fallback;
}

export function sanitizeError(e: unknown, context?: string, locale?: string): string {
  console.error(`[${context ?? 'error'}]`, e instanceof Error ? e.stack : e);

  const err = e as Record<string, unknown> | undefined;
  const detail = err?.response as Record<string, unknown> | undefined;
  const detailData = detail?.data as Record<string, unknown> | undefined;
  const detailErrors = detailData?.errors as Record<string, unknown>[] | undefined;
  if (detailErrors?.[0]?.detail) {
    const d = detailErrors[0].detail;
    return cleanErrorMessage(typeof d === 'string' ? d : String(d));
  }
  const errorValue = detailData?.error;
  if (errorValue) {
    return cleanErrorMessage(typeof errorValue === 'string' ? errorValue : String(errorValue));
  }

  const rawMessage = err?.message ? String(err.message) : String(e);
  const cleaned = cleanErrorMessage(rawMessage);
  if (cleaned.length > 0) {
    return cleaned;
  }

  const t = createT(getMessages(defaultLocale));
  return t('common.unexpectedError');
}
