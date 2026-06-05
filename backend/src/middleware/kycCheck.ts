import { requiresKyc, isKycVerified } from '../utils/eu';
import type { User } from '../models/user.entity';

const EXEMPT_PREFIXES = [
  '/api/auth/',
  '/api/id-verification',
  '/api/sessions/',
];

const EXEMPT_PATHS = new Set([
  '/api/users/me',
]);

export async function checkKycStatus(ctx: any) {
  const user = ctx.user as User | undefined;
  if (!user) return;
  if (ctx.apiKey) return;
  if (user.role === '*' || user.role === 'rootAdmin') return;

  let pathname = '/';
  try {
    const url = new URL(ctx.request?.url || '/', 'http://localhost');
    pathname = url.pathname;
  } catch {
    /* meow */
  }

  for (const prefix of EXEMPT_PREFIXES) {
    if (pathname.startsWith(prefix)) return;
  }

  if (EXEMPT_PATHS.has(pathname)) return;

  if (/^\/api\/users\/\d+$/.test(pathname)) return;

  try {
    const kycRequired = await requiresKyc(user.billingCountry);
    if (!kycRequired) return;
    const verified = await isKycVerified(user.id);
    if (verified) return;

    ctx.set.status = 403;
    return {
      error: 'KYC verification required. Please verify your identity first.',
      kycRequired: true,
      kycVerified: false,
    };
  } catch {
    /* wtfffff */
  }
}
