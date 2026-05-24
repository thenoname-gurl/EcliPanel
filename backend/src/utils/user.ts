export function formatDateOfBirth(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value);
}

export function parseDateOfBirth(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return null;
  return date;
}

const COUNTRY_ADULT_AGE: Record<string, number> = {
  CA: 19,
  TH: 20,
  TW: 20,
  AE: 21,
  BH: 21,
  OM: 21,
};

export function getAdultAgeForCountry(country?: string | null): number {
  if (!country) return 18;
  const code = String(country).trim().toUpperCase();
  return COUNTRY_ADULT_AGE[code] ?? 18;
}

export function isAdultByCountry(age: number, country?: string | null): boolean {
  return age >= getAdultAgeForCountry(country);
}

export function isMinorByCountry(age: number, country?: string | null): boolean {
  return age < getAdultAgeForCountry(country);
}

export function getAgeFromDate(date?: Date | string | null): number | null {
  if (!date) return null;
  const dob = date instanceof Date ? date : new Date(String(date));
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  const dayDiff = now.getUTCDate() - dob.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

export type RequestContextLike = {
  headers?: {
    'x-forwarded-for'?: string;
    [key: string]: string | undefined;
  };
  ip?: string;
  request?: {
    ip?: string;
  };
};

export function getRequesterIp(ctx: RequestContextLike): string {
  const forwarded = String(ctx?.headers?.['x-forwarded-for'] || '').trim();
  const firstForwarded = forwarded.split(',')[0]?.trim();
  const direct = String(ctx?.ip || ctx?.request?.ip || '').trim();
  return (firstForwarded || direct || 'unknown').slice(0, 100);
}

export { COUNTRY_ADULT_AGE };
