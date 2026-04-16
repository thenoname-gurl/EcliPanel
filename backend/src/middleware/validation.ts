import { validateCaptcha, validateInvisibleCaptcha, scoreBehavior } from '../utils/captcha';
import { isFeatureEnabled } from '../utils/featureToggles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ValidationErrorBody = {
  type: 'validation'
  on: 'body'
  found: Record<string, string>
};

function validationError(field: string, message: string): ValidationErrorBody {
  return { type: 'validation', on: 'body', found: { [field]: message } };
}

function validationErrors(errors: Record<string, string>): ValidationErrorBody {
  return { type: 'validation', on: 'body', found: errors };
}

export async function validateUserRegistration(ctx: any, _reply?: any): Promise<boolean> {
  const { firstName, lastName, email, password, address, billingCity, billingZip, billingCountry, dateOfBirth, captchaAnswer, captchaToken } = ctx.body as any;

  const missingFields = [
    { key: 'firstName', value: firstName },
    { key: 'lastName', value: lastName },
    { key: 'email', value: email },
    { key: 'password', value: password },
    { key: 'address', value: address },
    { key: 'billingCity', value: billingCity },
    { key: 'billingZip', value: billingZip },
    { key: 'billingCountry', value: billingCountry },
    { key: 'dateOfBirth', value: dateOfBirth },
  ].filter((item) => !item.value);

  if (missingFields.length) {
    ctx.set.status = 400;
    (ctx as any).body = validationErrors(
      missingFields.reduce((acc, field) => {
        acc[field.key] = 'This field is required';
        return acc;
      }, {} as Record<string, string>)
    );
    return false;
  }

  const captchaEnabled = await isFeatureEnabled('captcha');
  const captchaInvisibleEnabled = await isFeatureEnabled('captchaInvisible');

  if (captchaEnabled || captchaInvisibleEnabled) {
    const invisibleToken = ctx.body?.invisibleCaptchaToken;
    const invisibleDelay = Number(ctx.body?.invisibleCaptchaDelay || 0);
    const behaviorData = ctx.body?.behaviorData;

    if (captchaInvisibleEnabled && invisibleToken) {
      if (!validateInvisibleCaptcha(invisibleToken, invisibleDelay)) {
        ctx.set.status = 400;
        (ctx as any).body = validationError('invisibleCaptchaToken', 'Invisible captcha token is invalid, expired, or has invalid timing.');
        return false;
      }

      const behaviorScore = scoreBehavior(behaviorData);
      if (behaviorScore < 0.5) {
        ctx.set.status = 400;
        (ctx as any).body = validationError('behaviorData', 'Behavior metrics look suspicious. Please try again after interacting naturally with the form.');
        return false;
      }
    } else if (captchaEnabled) {
      if (!captchaToken || captchaAnswer === undefined || captchaAnswer === null || captchaAnswer === '') {
        ctx.set.status = 400;
        (ctx as any).body = validationErrors({
          captchaToken: 'Captcha token is required.',
          captchaAnswer: 'Captcha answer is required.',
        });
        return false;
      }

      if (!validateCaptcha(captchaToken, captchaAnswer)) {
        ctx.set.status = 400;
        (ctx as any).body = validationError('captchaAnswer', 'Captcha answer is incorrect. Please solve the captcha again.');
        return false;
      }
    } else {
      ctx.set.status = 400;
      (ctx as any).body = validationError('captcha', 'Captcha is required.');
      return false;
    }
  }

  if (!EMAIL_RE.test(String(email))) {
    ctx.set.status = 400;
    (ctx as any).body = validationError('email', 'Please provide a valid email address (e.g. user@example.com).');
    return false;
  }

  const dob = new Date(String(dateOfBirth));
  if (!dateOfBirth || isNaN(dob.getTime())) {
    ctx.set.status = 400;
    (ctx as any).body = validationError('dateOfBirth', 'Please provide a valid date of birth in YYYY-MM-DD format.');
    return false;
  }

  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  const dayDiff = now.getUTCDate() - dob.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  if (age < 14 || age > 122) {
    ctx.set.status = 400;
    (ctx as any).body = validationError('dateOfBirth', 'The provided age is suspicious or not allowed by our policies. Please enter your real date of birth or contact support. Accounts may be suspended for fake data.');
    return false;
  }

  if (typeof password !== 'string' || password.length < 8) {
    ctx.set.status = 400;
    (ctx as any).body = validationError('password', 'Password must be at least 8 characters long.');
    return false;
  }

  return true;
}