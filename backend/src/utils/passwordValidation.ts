export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const PASSWORD_RULES = {
  minLength: PASSWORD_MIN,
  maxLength: PASSWORD_MAX,
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  digit: /[0-9]/,
  symbol: /[^A-Za-z0-9]/,
} as const;

export type PasswordValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validatePassword(password: unknown): PasswordValidationResult {
  const errors: string[] = [];

  if (typeof password !== 'string') {
    errors.push('Password must be a string.');
    return { valid: false, errors };
  }

  if (password.length < PASSWORD_MIN) {
    errors.push(`Password must be at least ${PASSWORD_MIN} characters long.`);
  }

  if (password.length > PASSWORD_MAX) {
    errors.push(`Password must be no more than ${PASSWORD_MAX} characters long.`);
  }

  if (!PASSWORD_RULES.uppercase.test(password)) {
    errors.push('Password must contain at least one uppercase letter.');
  }

  if (!PASSWORD_RULES.lowercase.test(password)) {
    errors.push('Password must contain at least one lowercase letter.');
  }

  if (!PASSWORD_RULES.digit.test(password)) {
    errors.push('Password must contain at least one number.');
  }

  if (!PASSWORD_RULES.symbol.test(password)) {
    errors.push('Password must contain at least one symbol.');
  }

  return { valid: errors.length === 0, errors };
}
