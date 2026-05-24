import type { JsonObject } from '../types/common';

export function safeBody(
  body: unknown,
  defaults?: Record<string, unknown>
): Record<string, unknown> {
  if (typeof body === 'object' && body !== null) {
    return { ...(defaults as object), ...body } as Record<string, unknown>;
  }
  return { ...(defaults as object) } as Record<string, unknown>;
}

export function asLoginBody(body: unknown): { email: string; password: string } {
  const safe = safeBody(body, { email: '', password: '' });
  return {
    email: String(safe.email ?? ''),
    password: String(safe.password ?? ''),
  };
}

export function asRegisterBody(body: unknown): {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  password: string;
  dateOfBirth: string;
  address: string;
  address2?: string;
  phone?: string;
  billingCity?: string;
  billingZip?: string;
  billingCountry?: string;
  captchaToken?: string;
  captchaAnswer?: string;
  invisibleCaptchaToken?: string;
  invisibleCaptchaDelay?: number;
  behaviorData?: JsonObject;
  parentId?: number;
  parentInviteToken?: string;
  parentRegistrationToken?: string;
} {
  const safe = safeBody(body, {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    dateOfBirth: '',
    address: '',
  });
  return {
    firstName: String(safe.firstName ?? ''),
    lastName: String(safe.lastName ?? ''),
    middleName: safe.middleName !== undefined ? String(safe.middleName) : undefined,
    email: String(safe.email ?? ''),
    password: String(safe.password ?? ''),
    dateOfBirth: String(safe.dateOfBirth ?? ''),
    address: String(safe.address ?? ''),
    address2: safe.address2 !== undefined ? String(safe.address2) : undefined,
    phone: safe.phone !== undefined ? String(safe.phone) : undefined,
    billingCity: safe.billingCity !== undefined ? String(safe.billingCity) : undefined,
    billingZip: safe.billingZip !== undefined ? String(safe.billingZip) : undefined,
    billingCountry: safe.billingCountry !== undefined ? String(safe.billingCountry) : undefined,
    captchaToken: safe.captchaToken !== undefined ? String(safe.captchaToken) : undefined,
    captchaAnswer: safe.captchaAnswer !== undefined ? String(safe.captchaAnswer) : undefined,
    invisibleCaptchaToken: safe.invisibleCaptchaToken !== undefined ? String(safe.invisibleCaptchaToken) : undefined,
    invisibleCaptchaDelay: safe.invisibleCaptchaDelay !== undefined ? Number(safe.invisibleCaptchaDelay) : undefined,
    behaviorData: safe.behaviorData as JsonObject | undefined,
    parentId: safe.parentId !== undefined ? Number(safe.parentId) : undefined,
    parentInviteToken: safe.parentInviteToken !== undefined ? String(safe.parentInviteToken) : undefined,
    parentRegistrationToken: safe.parentRegistrationToken !== undefined ? String(safe.parentRegistrationToken) : undefined,
  };
}

export function asTwoFactorVerifyBody(body: unknown): { tempToken: string; code: string } {
  const safe = safeBody(body, { tempToken: '', code: '' });
  return {
    tempToken: String(safe.tempToken ?? ''),
    code: String(safe.code ?? ''),
  };
}

export function asTempTokenBody(body: unknown): { tempToken: string } {
  const safe = safeBody(body, { tempToken: '' });
  return {
    tempToken: String(safe.tempToken ?? ''),
  };
}

export function asTwoFactorLoginBody(body: unknown): {
  tempToken: string;
  token?: string;
  backupCode?: string;
  emailCode?: string;
} {
  const safe = safeBody(body, { tempToken: '' });
  return {
    tempToken: String(safe.tempToken ?? ''),
    token: safe.token !== undefined ? String(safe.token) : undefined,
    backupCode: safe.backupCode !== undefined ? String(safe.backupCode) : undefined,
    emailCode: safe.emailCode !== undefined ? String(safe.emailCode) : undefined,
  };
}

export function asEmailBody(body: unknown): { email: string } {
  const safe = safeBody(body, { email: '' });
  return {
    email: String(safe.email ?? ''),
  };
}

export function asPasswordResetBody(body: unknown): { token: string; password: string } {
  const safe = safeBody(body, { token: '', password: '' });
  return {
    token: String(safe.token ?? ''),
    password: String(safe.password ?? ''),
  };
}

export function asCodeBody(body: unknown): { code: string } {
  const safe = safeBody(body, { code: '' });
  return {
    code: String(safe.code ?? ''),
  };
}

export function asTokenSecretBody(body: unknown): { token: string; secret: string } {
  const safe = safeBody(body, { token: '', secret: '' });
  return {
    token: String(safe.token ?? ''),
    secret: String(safe.secret ?? ''),
  };
}

export function asTokenBody(body: unknown): { token: string } {
  const safe = safeBody(body, { token: '' });
  return {
    token: String(safe.token ?? ''),
  };
}

export function asPasskeyRegisterBody(body: unknown): { attestationResponse?: JsonObject } {
  const safe = safeBody(body);
  return {
    attestationResponse: safe.attestationResponse !== undefined && safe.attestationResponse !== null
      ? safe.attestationResponse as JsonObject
      : undefined,
  };
}

export function asPasskeyLoginBody(body: unknown): {
  email: string;
  authenticationResponse?: JsonObject;
} {
  const safe = safeBody(body, { email: '' });
  return {
    email: String(safe.email ?? ''),
    authenticationResponse: safe.authenticationResponse !== undefined && safe.authenticationResponse !== null
      ? safe.authenticationResponse as JsonObject
      : undefined,
  };
}

export function asIdNameBody(body: unknown): { name: string } {
  const safe = safeBody(body, { name: '' });
  return {
    name: String(safe.name ?? ''),
  };
}

export function asSendEmailBody(body: unknown): {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  html?: string;
} {
  const safe = safeBody(body, { to: '', subject: '', body: '' });
  return {
    to: String(safe.to ?? ''),
    cc: safe.cc !== undefined && safe.cc !== null ? String(safe.cc) : undefined,
    bcc: safe.bcc !== undefined && safe.bcc !== null ? String(safe.bcc) : undefined,
    subject: String(safe.subject ?? ''),
    body: String(safe.body ?? ''),
    html: safe.html !== undefined && safe.html !== null ? String(safe.html) : undefined,
  };
}

export function asGuideShownBody(body: unknown): { shown?: boolean } {
  const safe = safeBody(body);
  return {
    shown: safe.shown !== undefined ? Boolean(safe.shown) : undefined,
  };
}

export function getStringField(
  body: unknown,
  field: string,
  defaultValue: string = ''
): string {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (field in b && b[field] !== undefined && b[field] !== null) {
      return String(b[field]);
    }
  }
  return defaultValue;
}

export function getNumberField(
  body: unknown,
  field: string,
  defaultValue?: number
): number | undefined {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (field in b && b[field] !== undefined && b[field] !== null) {
      const value = Number(b[field]);
      if (Number.isFinite(value)) return value;
    }
  }
  return defaultValue;
}

export function getBooleanField(
  body: unknown,
  field: string,
  defaultValue: boolean = false
): boolean {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (field in b) {
      const value = b[field];
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
      if (typeof value === 'number') return value !== 0;
    }
  }
  return defaultValue;
}

export function safeQuery(
  query: Record<string, string | string[] | undefined> | undefined
): Record<string, unknown> {
  if (!query) return {};
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) {
      result[k] = Array.isArray(v) ? v[v.length - 1] : v;
    }
  }
  return result;
}

export function getQueryString(
  query: Record<string, string | string[] | undefined> | undefined,
  key: string,
  defaultValue: string = ''
): string {
  if (!query) return defaultValue;
  const v = query[key];
  if (v === undefined) return defaultValue;
  return String(Array.isArray(v) ? v[v.length - 1] : v);
}

export function getQueryNumber(
  query: Record<string, string | string[] | undefined> | undefined,
  key: string,
  defaultValue: number
): number {
  if (!query) return defaultValue;
  const v = query[key];
  if (v === undefined) return defaultValue;
  const raw = Array.isArray(v) ? v[v.length - 1] : v;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function getQueryBoolean(
  query: Record<string, string | string[] | undefined> | undefined,
  key: string,
  defaultValue: boolean = false
): boolean {
  if (!query) return defaultValue;
  const v = query[key];
  if (v === undefined) return defaultValue;
  const raw = Array.isArray(v) ? v[v.length - 1] : v;
  const str = String(raw).toLowerCase();
  return str === 'true' || str === '1' || str === 'yes';
}
