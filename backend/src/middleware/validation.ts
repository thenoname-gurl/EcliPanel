import { isFeatureEnabled } from '../utils/featureToggles';
import { isTempEmail } from '../repositories/tempEmailRepository';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function validateUserRegistration(ctx: any, _reply?: any): Promise<boolean> {
  const { firstName, lastName, email, password, address, billingCity, billingZip, billingCountry } = ctx.body as any;

  if (!firstName || !lastName || !email || !password || !address || !billingCity || !billingZip || !billingCountry) {
    ctx.set.status = 400;
    (ctx as any).body = { error: 'Missing required fields' };
    return false;
  }
  if (!EMAIL_RE.test(String(email))) {
    ctx.set.status = 400;
    (ctx as any).body = { error: 'Invalid email address' };
    return false;
  }

  if (await isFeatureEnabled('tempEmailFilter') && isTempEmail(String(email))) {
    ctx.set.status = 403;
    (ctx as any).body = { error: 'Disposable email addresses are not allowed for registration' };
    return false;
  }

  if (typeof password !== 'string' || password.length < 8) {
    ctx.set.status = 400;
    (ctx as any).body = { error: 'Password must be at least 8 characters' };
    return false;
  }
  return true;
}
