import { validateCaptcha, validateInvisibleCaptcha, scoreBehavior } from '../utils/captcha';
import { isFeatureEnabled } from '../utils/featureToggles';
import { getMinimumAgeForCountry } from '../utils/eu';
import { validatePassword } from '../utils/passwordValidation';
import { getAgeFromDate } from '../utils/user';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const FIELD_MAX_LENGTHS: Record<string, number> = {
  firstName: 64,
  lastName: 64,
  middleName: 64,
  title: 32,
  gender: 32,
  displayName: 64,
  email: 254,
  address: 256,
  address2: 256,
  billingCompany: 128,
  billingCity: 128,
  billingState: 64,
  billingZip: 20,
  phone: 32,
};

export type ValidationErrorBody = {
  type: 'validation';
  on: 'body';
  found: Record<string, string>;
};

export function validationError(field: string, message: string): ValidationErrorBody {
  return { type: 'validation', on: 'body', found: { [field]: message } };
}

export function validationErrors(errors: Record<string, string>): ValidationErrorBody {
  return { type: 'validation', on: 'body', found: errors };
}

export function validateFieldMaxLengths(body: Record<string, unknown>): Record<string, string> | null {
  const errors: Record<string, string> = {};
  for (const [field, max] of Object.entries(FIELD_MAX_LENGTHS)) {
    const val = body[field];
    if (typeof val === 'string' && val.length > max) {
      errors[field] = `Must be at most ${max} characters.`;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return EMAIL_RE.test(email);
}

export async function validateUserRegistration(
  ctx: any,
  _reply?: any,
  options?: { skipMinimumAge?: boolean; skipAddressFields?: boolean }
): Promise<boolean> {
  const {
    firstName,
    lastName,
    email,
    password,
    address,
    billingCity,
    billingZip,
    billingCountry,
    dateOfBirth,
    captchaAnswer,
    captchaToken,
  } = ctx.body as any;

  const fields = [
    { key: 'firstName', value: firstName },
    { key: 'lastName', value: lastName },
    { key: 'email', value: email },
    { key: 'password', value: password },
    { key: 'dateOfBirth', value: dateOfBirth },
  ];

  if (!options?.skipAddressFields) {
    fields.push(
      { key: 'address', value: address },
      { key: 'billingCity', value: billingCity },
      { key: 'billingZip', value: billingZip },
      { key: 'billingCountry', value: billingCountry }
    );
  }

  const missingFields = fields.filter(item => !item.value);

  if (missingFields.length) {
    ctx.set.status = 400;
    (ctx as any).body = validationErrors(
      missingFields.reduce(
        (acc, field) => {
          acc[field.key] = 'This field is required';
          return acc;
        },
        {} as Record<string, string>
      )
    );
    return false;
  }

  const maxLenErrors = validateFieldMaxLengths(ctx.body as Record<string, any>);
  if (maxLenErrors) {
    ctx.set.status = 400;
    (ctx as any).body = validationErrors(maxLenErrors);
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
        (ctx as any).body = validationError(
          'invisibleCaptchaToken',
          'Invisible captcha token is invalid, expired, or has invalid timing.'
        );
        return false;
      }

      const behaviorScore = scoreBehavior(behaviorData);
      if (behaviorScore < 0.5) {
        ctx.set.status = 400;
        (ctx as any).body = validationError(
          'behaviorData',
          'Behavior metrics look suspicious. Please try again after interacting naturally with the form.'
        );
        return false;
      }
    } else if (captchaEnabled) {
      if (
        !captchaToken ||
        captchaAnswer === undefined ||
        captchaAnswer === null ||
        captchaAnswer === ''
      ) {
        ctx.set.status = 400;
        (ctx as any).body = validationErrors({
          captchaToken: 'Captcha token is required.',
          captchaAnswer: 'Captcha answer is required.',
        });
        return false;
      }

      if (!validateCaptcha(captchaToken, captchaAnswer)) {
        ctx.set.status = 400;
        (ctx as any).body = validationError(
          'captchaAnswer',
          'Captcha answer is incorrect. Please solve the captcha again.'
        );
        return false;
      }
    } else {
      ctx.set.status = 400;
      (ctx as any).body = validationError('captcha', 'Captcha is required.');
      return false;
    }
  }

  if (!isValidEmail(email)) {
    ctx.set.status = 400;
    (ctx as any).body = validationError(
      'email',
      'Please provide a valid email address (e.g. user@example.com).'
    );
    return false;
  }

  const age = getAgeFromDate(dateOfBirth);
  if (age === null) {
    ctx.set.status = 400;
    (ctx as any).body = validationError(
      'dateOfBirth',
      'Please provide a valid date of birth in YYYY-MM-DD format.'
    );
    return false;
  }

  const minimumAge = options?.skipMinimumAge ? 0 : await getMinimumAgeForCountry(billingCountry);
  if (age < minimumAge || age > 122) {
    ctx.set.status = 400;
    (ctx as any).body = validationError(
      'dateOfBirth',
      age < minimumAge
        ? `The provided age is below the minimum allowed age of ${minimumAge} for your country.`
        : 'The provided age is suspicious or not allowed by our policies. Please enter your real date of birth or contact support. Accounts may be suspended for fake data.'
    );
    return false;
  }

  const pwResult = validatePassword(password);
  if (!pwResult.valid) {
    ctx.set.status = 400;
    (ctx as any).body = validationError('password', pwResult.errors.join(' '));
    return false;
  }

  return true;
}
