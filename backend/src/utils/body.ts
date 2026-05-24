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

export function getObjectField<T extends JsonObject>(
  body: unknown,
  field: string,
  defaultValue?: T
): T | undefined {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (field in b && typeof b[field] === 'object' && b[field] !== null) {
      return b[field] as T;
    }
  }
  return defaultValue;
}
