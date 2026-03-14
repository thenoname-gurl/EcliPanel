const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function validateUserRegistration(ctx: any, _reply?: any): Promise<boolean> {
  const { firstName, lastName, email, password, address } = ctx.body as any;

  if (!firstName || !lastName || !email || !password || !address) {
    ctx.set.status = 400;
    (ctx as any).body = { error: 'Missing required fields' };
    return false;
  }
  if (!EMAIL_RE.test(String(email))) {
    ctx.set.status = 400;
    (ctx as any).body = { error: 'Invalid email address' };
    return false;
  }
  if (typeof password !== 'string' || password.length < 8) {
    ctx.set.status = 400;
    (ctx as any).body = { error: 'Password must be at least 8 characters' };
    return false;
  }
  return true;
}
