import { t } from 'elysia';
import { In, MoreThan } from 'typeorm';
import { randomBytes } from 'crypto';
import { AppDataSource } from '../config/typeorm';
import { ApplicationForm } from '../models/applicationForm.entity';
import { ApplicationFormInvite } from '../models/applicationFormInvite.entity';
import { ApplicationSubmission } from '../models/applicationSubmission.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';

const submissionStatuses = ['pending', 'accepted', 'rejected', 'archived'] as const;
const formStatuses = ['active', 'archived', 'closed'] as const;
const formVisibilities = ['public_anonymous', 'public_users', 'private_invite'] as const;

type FormVisibility = typeof formVisibilities[number];
type FormStatus = typeof formStatuses[number];

function isAdmin(user: User | undefined, ctx?: any) {
  if (!user) return false;
  if (ctx && hasPermissionSync(ctx, 'applications:manage')) return true;
  return ['admin', 'rootAdmin', '*'].includes(String(user.role || ''));
}

function normalizeKind(input: any): 'staff_application' | 'abuse_report' {
  const value = String(input || '').trim().toLowerCase();
  if (value === 'abuse' || value === 'abuse_report') return 'abuse_report';
  return 'staff_application';
}

function normalizeVisibility(input: any, fallback: FormVisibility = 'public_users'): FormVisibility {
  const value = String(input || '').trim().toLowerCase();
  if (formVisibilities.includes(value as any)) return value as FormVisibility;
  return fallback;
}

function normalizeStatus(input: any, fallback: FormStatus = 'active'): FormStatus {
  const value = String(input || '').trim().toLowerCase();
  if (formStatuses.includes(value as any)) return value as FormStatus;
  return fallback;
}

function getEffectiveStatus(form: ApplicationForm): FormStatus {
  const stored = normalizeStatus((form as any).status, 'active');
  if (stored) return stored;
  return form.active ? 'active' : 'archived';
}

function getEffectiveVisibility(form: ApplicationForm): FormVisibility {
  const stored = normalizeVisibility((form as any).visibility, 'public_users');
  if (stored) return stored;
  if (!form.requiresAccount) return 'public_anonymous';
  return 'public_users';
}

function getClientIp(ctx: any): string {
  return String((ctx as any)?.ip || (ctx as any)?.request?.ip || '').trim() || 'unknown';
}

function sanitizeText(input: any, max = 20_000): string {
  return String(input || '').trim().slice(0, max);
}

function slugify(input: string): string {
  const base = String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'form';
}

async function ensureUniqueSlug(repo: ReturnType<typeof AppDataSource.getRepository<ApplicationForm>>, preferred: string, excludingId?: number): Promise<string> {
  const root = slugify(preferred).slice(0, 90) || `form-${Date.now()}`;
  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const existing = await repo.findOne({ where: { slug: candidate } });
    if (!existing || (excludingId && existing.id === excludingId)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

function normalizeSchema(raw: any): any {
  if (!raw || typeof raw !== 'object') return { questions: [] };
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  const questions = rawQuestions.slice(0, 120).map((q: any, idx: number) => {
    const type = String(q?.type || 'short_text');
    const allowedTypes = ['short_text', 'long_text', 'email', 'number', 'select', 'multi_select', 'checkbox', 'date', 'url'];
    const safeType = allowedTypes.includes(type) ? type : 'short_text';
    const options = Array.isArray(q?.options)
      ? q.options.map((v: any) => sanitizeText(v, 120)).filter(Boolean).slice(0, 100)
      : [];
    return {
      id: sanitizeText(q?.id || `q${idx + 1}`, 80) || `q${idx + 1}`,
      label: sanitizeText(q?.label || `Question ${idx + 1}`, 260) || `Question ${idx + 1}`,
      type: safeType,
      required: !!q?.required,
      placeholder: sanitizeText(q?.placeholder || '', 280) || undefined,
      options: options.length > 0 ? options : undefined,
    };
  });

  return {
    title: sanitizeText(raw.title || '', 240) || undefined,
    description: sanitizeText(raw.description || '', 6000) || undefined,
    questions,
  };
}

function buildContentFromAnswers(content: string, answers: any): string {
  if (content) return content;
  if (!answers || typeof answers !== 'object') return '';
  try {
    return JSON.stringify(answers).slice(0, 20_000);
  } catch {
    return '';
  }
}

function toFormPublicLink(form: ApplicationForm): string | null {
  const slug = sanitizeText((form as any).slug || '', 120);
  if (!slug) return null;
  return `/forms/${slug}`;
}

function normalizeFormForRead(form: ApplicationForm) {
  const visibility = getEffectiveVisibility(form);
  const status = getEffectiveStatus(form);
  return {
    id: form.id,
    title: form.title,
    description: form.description || '',
    kind: form.kind,
    slug: (form as any).slug || null,
    visibility,
    status,
    schema: (form as any).schema || { questions: [] },
    active: status === 'active',
    requiresAccount: visibility === 'public_users',
    maxSubmissionsPerUser: Number(form.maxSubmissionsPerUser || 1),
    ipCooldownSeconds: Number(form.ipCooldownSeconds || 0),
    publicLink: toFormPublicLink(form),
    createdBy: form.createdBy ?? null,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}

async function resolveInviteForForm(formId: number, tokenRaw: string | undefined) {
  if (!tokenRaw) return null;
  const token = sanitizeText(tokenRaw, 180);
  if (!token) return null;
  const repo = AppDataSource.getRepository(ApplicationFormInvite);
  const invite = await repo.findOne({ where: { token, formId } });
  if (!invite || invite.revoked) return null;
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return null;
  if (invite.maxUses != null && invite.uses >= invite.maxUses) return null;
  return invite;
}

async function ensureAuthenticatedSubmissionAllowed(opts: {
  form: ApplicationForm;
  user: User | undefined;
  content: string;
  ctx: any;
}) {
  const { form, user, content, ctx } = opts;
  const submissionRepo = AppDataSource.getRepository(ApplicationSubmission);
  const status = getEffectiveStatus(form);
  const visibility = getEffectiveVisibility(form);

  if (status !== 'active') {
    ctx.set.status = 409;
    return { error: status === 'closed' ? 'This form is closed (view only)' : 'This form is archived' };
  }

  if (visibility !== 'public_users') {
    ctx.set.status = 400;
    return { error: 'This form does not accept authenticated direct submissions. Use its invite/public link.' };
  }

  if (!user) {
    ctx.set.status = 401;
    return { error: 'Unauthorized' };
  }
  if (user.suspended) {
    ctx.set.status = 403;
    return { error: 'Suspended accounts cannot apply' };
  }

  const maxPerUser = Math.max(1, Number(form.maxSubmissionsPerUser || 1));
  const existingCount = await submissionRepo.count({ where: { formId: form.id, userId: user.id } });
  if (existingCount >= maxPerUser) {
    ctx.set.status = 409;
    return { error: 'You have already applied to this form' };
  }

  if (!content) {
    ctx.set.status = 400;
    return { error: 'content or answers are required' };
  }

  return true;
}

async function ensurePublicSubmissionAllowed(opts: {
  form: ApplicationForm;
  ipAddress: string;
  content: string;
  inviteToken?: string;
  ctx: any;
}) {
  const { form, ipAddress, content, inviteToken, ctx } = opts;
  const submissionRepo = AppDataSource.getRepository(ApplicationSubmission);
  const status = getEffectiveStatus(form);
  const visibility = getEffectiveVisibility(form);

  if (status !== 'active') {
    ctx.set.status = 409;
    return { error: status === 'closed' ? 'This form is closed (view only)' : 'This form is archived' };
  }

  if (visibility === 'public_users') {
    ctx.set.status = 401;
    return { error: 'This form requires a panel account. Please log in first.' };
  }

  if (visibility === 'private_invite') {
    const invite = await resolveInviteForForm(form.id, inviteToken);
    if (!invite) {
      ctx.set.status = 403;
      return { error: 'A valid invite token is required for this private form' };
    }
  }

  if (visibility === 'public_anonymous') {
    const cooldown = Math.max(3600, Number(form.ipCooldownSeconds || 3600));
    const since = new Date(Date.now() - cooldown * 1000);
    const recent = await submissionRepo.findOne({
      where: { formId: form.id, ipAddress, createdAt: MoreThan(since) },
      order: { createdAt: 'DESC' },
    });
    if (recent) {
      const retryAt = new Date(recent.createdAt.getTime() + cooldown * 1000);
      ctx.set.status = 429;
      return { error: 'Rate limit: once per hour per IP', retryAt };
    }
  }

  if (!content) {
    ctx.set.status = 400;
    return { error: 'content or answers are required' };
  }

  return true;
}

function publicCanView(form: ApplicationForm, invitePresent: boolean): boolean {
  const status = getEffectiveStatus(form);
  if (status === 'archived') return false;
  const visibility = getEffectiveVisibility(form);
  if (visibility === 'private_invite' && !invitePresent) return false;
  return true;
}

export async function applicationRoutes(app: any, prefix = '') {
  const formRepo = () => AppDataSource.getRepository(ApplicationForm);
  const submissionRepo = () => AppDataSource.getRepository(ApplicationSubmission);
  const inviteRepo = () => AppDataSource.getRepository(ApplicationFormInvite);
  const userRepo = () => AppDataSource.getRepository(User);

  app.get(prefix + '/applications/forms', async (ctx: any) => {
    const forms = await formRepo().find({ order: { id: 'DESC' } });
    const visible = forms.filter((form) => {
      const status = getEffectiveStatus(form);
      const visibility = getEffectiveVisibility(form);
      return visibility === 'public_users' && (status === 'active' || status === 'closed');
    });
    return visible.map(normalizeFormForRead);
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List account-required forms for authenticated users', tags: ['Applications'] },
  });

  app.get(prefix + '/applications/my', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }
    const rows = await submissionRepo().find({ where: { userId: user.id }, order: { id: 'DESC' } });
    return rows;
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'List current user submissions', tags: ['Applications'] },
  });

  app.post(prefix + '/applications/forms/:id/submit', async (ctx: any) => {
    const form = await formRepo().findOneBy({ id: Number(ctx.params.id) });
    const user = ctx.user as User | undefined;
    const answers = typeof (ctx.body as any)?.answers === 'object' ? (ctx.body as any).answers : undefined;
    const content = buildContentFromAnswers(sanitizeText((ctx.body as any)?.content), answers);

    if (!form) {
      ctx.set.status = 404;
      return { error: 'Form not found' };
    }

    const allowed = await ensureAuthenticatedSubmissionAllowed({ form, user, content, ctx });
    if (allowed !== true) return allowed;

    const created = submissionRepo().create({
      formId: form.id,
      userId: user!.id,
      ipAddress: getClientIp(ctx),
      content,
      status: 'pending',
      meta: {
        ...(typeof (ctx.body as any)?.meta === 'object' ? (ctx.body as any).meta : {}),
        answers,
      },
    });

    const saved = await submissionRepo().save(created);
    return { success: true, submission: saved };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) },
    detail: { summary: 'Submit account-required form by id', tags: ['Applications'] },
  });

  app.post(prefix + '/applications/forms/slug/:slug/submit', async (ctx: any) => {
    const slug = sanitizeText(ctx.params.slug, 120).toLowerCase();
    const form = await formRepo().findOne({ where: { slug } });
    const user = ctx.user as User | undefined;
    const answers = typeof (ctx.body as any)?.answers === 'object' ? (ctx.body as any).answers : undefined;
    const content = buildContentFromAnswers(sanitizeText((ctx.body as any)?.content), answers);

    if (!form) {
      ctx.set.status = 404;
      return { error: 'Form not found' };
    }

    const allowed = await ensureAuthenticatedSubmissionAllowed({ form, user, content, ctx });
    if (allowed !== true) return allowed;

    const created = submissionRepo().create({
      formId: form.id,
      userId: user!.id,
      ipAddress: getClientIp(ctx),
      content,
      status: 'pending',
      meta: {
        ...(typeof (ctx.body as any)?.meta === 'object' ? (ctx.body as any).meta : {}),
        answers,
      },
    });

    const saved = await submissionRepo().save(created);
    return { success: true, submission: saved };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) },
    detail: { summary: 'Submit account-required form by slug', tags: ['Applications'] },
  });

  app.get(prefix + '/public/applications/forms', async () => {
    const forms = await formRepo().find({ order: { id: 'DESC' } });
    return forms
      .filter((form) => getEffectiveStatus(form) === 'active' && getEffectiveVisibility(form) === 'public_anonymous')
      .map(normalizeFormForRead);
  }, {
    response: { 200: t.Array(t.Any()) },
    detail: { summary: 'List publicly visible anonymous forms', tags: ['Applications'] },
  });

  app.post(prefix + '/public/applications/forms/:id/submit', async (ctx: any) => {
    const form = await formRepo().findOneBy({ id: Number(ctx.params.id) });
    const inviteToken = sanitizeText((ctx.body as any)?.inviteToken || (ctx.query as any)?.invite || '', 180) || undefined;
    const answers = typeof (ctx.body as any)?.answers === 'object' ? (ctx.body as any).answers : undefined;
    const content = buildContentFromAnswers(sanitizeText((ctx.body as any)?.content), answers);

    if (!form) {
      ctx.set.status = 404;
      return { error: 'Form not found' };
    }

    const ipAddress = getClientIp(ctx);
    const allowed = await ensurePublicSubmissionAllowed({ form, ipAddress, content, inviteToken, ctx });
    if (allowed !== true) return allowed;

    const visibility = getEffectiveVisibility(form);
    let invite: ApplicationFormInvite | null = null;
    if (visibility === 'private_invite') {
      invite = await resolveInviteForForm(form.id, inviteToken);
      if (!invite) {
        ctx.set.status = 403;
        return { error: 'A valid invite token is required for this private form' };
      }
      invite.uses = Number(invite.uses || 0) + 1;
      await inviteRepo().save(invite);
    }

    const created = submissionRepo().create({
      formId: form.id,
      userId: null,
      ipAddress,
      content,
      status: 'pending',
      meta: {
        ...(typeof (ctx.body as any)?.meta === 'object' ? (ctx.body as any).meta : {}),
        answers,
        inviteTokenUsed: invite?.token || null,
        reporterEmail: sanitizeText((ctx.body as any)?.reporterEmail || '', 300) || undefined,
        userAgent: String(ctx.request?.headers?.get?.('user-agent') || '').slice(0, 500),
      },
    });

    const saved = await submissionRepo().save(created);
    return { success: true, submission: saved };
  }, {
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }), 429: t.Any() },
    detail: { summary: 'Submit form publicly by id (legacy compatibility)', tags: ['Applications'] },
  });

  app.get(prefix + '/public/applications/forms/:slug', async (ctx: any) => {
    const slug = sanitizeText(ctx.params.slug, 120).toLowerCase();
    const inviteToken = sanitizeText(ctx.query?.invite || '', 180) || undefined;
    const form = await formRepo().findOne({ where: { slug } });

    if (!form) {
      ctx.set.status = 404;
      return { error: 'Form not found' };
    }

    const invite = await resolveInviteForForm(form.id, inviteToken);
    if (!publicCanView(form, !!invite)) {
      ctx.set.status = 403;
      return { error: 'This form is private or archived' };
    }

    const normalized = normalizeFormForRead(form);
    return {
      ...normalized,
      canSubmit: normalized.status === 'active',
      inviteValidated: !!invite,
    };
  }, {
    response: { 200: t.Any(), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get public form by slug (supports invite)', tags: ['Applications'] },
  });

  app.post(prefix + '/public/applications/forms/slug/:slug/submit', async (ctx: any) => {
    const slug = sanitizeText(ctx.params.slug, 120).toLowerCase();
    const inviteToken = sanitizeText((ctx.body as any)?.inviteToken || (ctx.query as any)?.invite || '', 180) || undefined;
    const form = await formRepo().findOne({ where: { slug } });
    const answers = typeof (ctx.body as any)?.answers === 'object' ? (ctx.body as any).answers : undefined;
    const content = buildContentFromAnswers(sanitizeText((ctx.body as any)?.content), answers);

    if (!form) {
      ctx.set.status = 404;
      return { error: 'Form not found' };
    }

    const ipAddress = getClientIp(ctx);
    const allowed = await ensurePublicSubmissionAllowed({ form, ipAddress, content, inviteToken, ctx });
    if (allowed !== true) return allowed;

    const visibility = getEffectiveVisibility(form);
    let invite: ApplicationFormInvite | null = null;
    if (visibility === 'private_invite') {
      invite = await resolveInviteForForm(form.id, inviteToken);
      if (!invite) {
        ctx.set.status = 403;
        return { error: 'A valid invite token is required for this private form' };
      }
      invite.uses = Number(invite.uses || 0) + 1;
      await inviteRepo().save(invite);
    }

    const created = submissionRepo().create({
      formId: form.id,
      userId: null,
      ipAddress,
      content,
      status: 'pending',
      meta: {
        ...(typeof (ctx.body as any)?.meta === 'object' ? (ctx.body as any).meta : {}),
        answers,
        inviteTokenUsed: invite?.token || null,
        reporterEmail: sanitizeText((ctx.body as any)?.reporterEmail || '', 300) || undefined,
        userAgent: String(ctx.request?.headers?.get?.('user-agent') || '').slice(0, 500),
      },
    });

    const saved = await submissionRepo().save(created);
    return { success: true, submission: saved };
  }, {
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }), 429: t.Any() },
    detail: { summary: 'Submit form publicly via slug', tags: ['Applications'] },
  });

  app.get(prefix + '/admin/applications/forms', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!isAdmin(user)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const forms = await formRepo().find({ order: { id: 'DESC' } });
    return forms.map(normalizeFormForRead);
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin list forms', tags: ['Applications'] },
  });

  app.post(prefix + '/admin/applications/forms', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!isAdmin(user)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const body = (ctx.body || {}) as any;
    const title = sanitizeText(body.title, 200);
    const description = sanitizeText(body.description || '', 12000) || null;
    const kind = normalizeKind(body.kind);
    const visibility = normalizeVisibility(body.visibility, kind === 'abuse_report' ? 'public_anonymous' : 'public_users');
    const status = normalizeStatus(body.status, 'active');
    const schema = normalizeSchema(body.schema || {});

    if (!title) {
      ctx.set.status = 400;
      return { error: 'title is required' };
    }

    const slugInput = sanitizeText(body.slug || title, 120);
    const slug = await ensureUniqueSlug(formRepo(), slugInput);

    const maxSubmissionsPerUser = Math.max(1, Number(body.maxSubmissionsPerUser || 1));
    const ipCooldownSeconds = visibility === 'public_anonymous'
      ? Math.max(3600, Number(body.ipCooldownSeconds || 3600))
      : Math.max(0, Number(body.ipCooldownSeconds || 0));

    const created = formRepo().create({
      title,
      description,
      kind,
      slug,
      visibility,
      status,
      schema,
      active: status === 'active',
      requiresAccount: visibility === 'public_users',
      maxSubmissionsPerUser,
      ipCooldownSeconds,
      createdBy: user?.id,
    });

    const saved = await formRepo().save(created);
    return { success: true, form: normalizeFormForRead(saved) };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin create form', tags: ['Applications'] },
  });

  app.put(prefix + '/admin/applications/forms/:id', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!isAdmin(user)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const form = await formRepo().findOneBy({ id: Number(ctx.params.id) });
    if (!form) {
      ctx.set.status = 404;
      return { error: 'Form not found' };
    }

    const body = (ctx.body || {}) as any;
    if (body.title !== undefined) form.title = sanitizeText(body.title, 200);
    if (body.description !== undefined) form.description = sanitizeText(body.description || '', 12000) || null;
    if (body.kind !== undefined) form.kind = normalizeKind(body.kind);
    if (body.schema !== undefined) (form as any).schema = normalizeSchema(body.schema || {});

    const nextVisibility = body.visibility !== undefined
      ? normalizeVisibility(body.visibility, getEffectiveVisibility(form))
      : getEffectiveVisibility(form);
    const nextStatus = body.status !== undefined
      ? normalizeStatus(body.status, getEffectiveStatus(form))
      : getEffectiveStatus(form);

    if (body.slug !== undefined) {
      const nextSlug = sanitizeText(body.slug, 120);
      if (nextSlug) {
        (form as any).slug = await ensureUniqueSlug(formRepo(), nextSlug, form.id);
      }
    }

    (form as any).visibility = nextVisibility;
    (form as any).status = nextStatus;
    form.active = nextStatus === 'active';
    form.requiresAccount = nextVisibility === 'public_users';

    if (body.maxSubmissionsPerUser !== undefined) {
      form.maxSubmissionsPerUser = Math.max(1, Number(body.maxSubmissionsPerUser || 1));
    }

    if (body.ipCooldownSeconds !== undefined || nextVisibility === 'public_anonymous') {
      const desired = Number(body.ipCooldownSeconds ?? form.ipCooldownSeconds ?? 0);
      form.ipCooldownSeconds = nextVisibility === 'public_anonymous' ? Math.max(3600, desired || 3600) : Math.max(0, desired || 0);
    }

    if (!form.title) {
      ctx.set.status = 400;
      return { error: 'title is required' };
    }

    if (!(form as any).slug) {
      (form as any).slug = await ensureUniqueSlug(formRepo(), form.title || `form-${form.id}`, form.id);
    }

    const saved = await formRepo().save(form);
    return { success: true, form: normalizeFormForRead(saved) };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin update form', tags: ['Applications'] },
  });

  app.delete(prefix + '/admin/applications/forms/:id', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!isAdmin(user)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const id = Number(ctx.params.id);
    await inviteRepo().delete({ formId: id });
    await submissionRepo().delete({ formId: id });
    await formRepo().delete(id);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin delete form', tags: ['Applications'] },
  });

  app.get(prefix + '/admin/applications/forms/:id/invites', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!isAdmin(user)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const formId = Number(ctx.params.id);
    const form = await formRepo().findOneBy({ id: formId });
    if (!form) {
      ctx.set.status = 404;
      return { error: 'Form not found' };
    }
    const rows = await inviteRepo().find({ where: { formId }, order: { id: 'DESC' } });
    return rows.map((row) => ({
      ...row,
      link: `/forms/${(form as any).slug}?invite=${row.token}`,
    }));
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin list invite links for form', tags: ['Applications'] },
  });

  app.post(prefix + '/admin/applications/forms/:id/invites', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!isAdmin(user)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const formId = Number(ctx.params.id);
    const form = await formRepo().findOneBy({ id: formId });
    if (!form) {
      ctx.set.status = 404;
      return { error: 'Form not found' };
    }
    const visibility = getEffectiveVisibility(form);
    if (visibility !== 'private_invite') {
      ctx.set.status = 400;
      return { error: 'Invite links are only available for private_invite forms' };
    }

    const body = (ctx.body || {}) as any;
    const token = randomBytes(20).toString('hex');
    const maxUses = body.maxUses != null ? Math.max(1, Number(body.maxUses || 1)) : null;
    const expiresHours = body.expiresHours != null ? Math.max(1, Number(body.expiresHours || 24)) : null;
    const expiresAt = expiresHours ? new Date(Date.now() + expiresHours * 3600_000) : null;

    const created = inviteRepo().create({
      formId,
      token,
      label: sanitizeText(body.label || '', 200) || null,
      email: sanitizeText(body.email || '', 300) || null,
      maxUses,
      uses: 0,
      expiresAt,
      revoked: false,
      createdBy: user?.id,
    });

    const saved = await inviteRepo().save(created);
    return { success: true, invite: saved, link: `/forms/${(form as any).slug}?invite=${saved.token}` };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin create invite link for private form', tags: ['Applications'] },
  });

  app.delete(prefix + '/admin/applications/invites/:inviteId', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!isAdmin(user)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const inviteId = Number(ctx.params.inviteId);
    const invite = await inviteRepo().findOneBy({ id: inviteId });
    if (!invite) {
      ctx.set.status = 404;
      return { error: 'Invite not found' };
    }

    invite.revoked = true;
    await inviteRepo().save(invite);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin revoke invite link', tags: ['Applications'] },
  });

  app.get(prefix + '/admin/applications/submissions', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!isAdmin(user)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const status = String(ctx.query?.status || '').trim().toLowerCase();
    const formId = Number(ctx.query?.formId || 0);

    const where: any = {};
    if (submissionStatuses.includes(status as any)) where.status = status;
    if (Number.isFinite(formId) && formId > 0) where.formId = formId;

    const rows = await submissionRepo().find({ where, order: { id: 'DESC' } });
    const formIds = Array.from(new Set(rows.map((r) => Number(r.formId)).filter((id) => Number.isFinite(id) && id > 0)));
    const userIds = Array.from(new Set(rows.map((r) => Number(r.userId)).filter((id) => Number.isFinite(id) && id > 0)));

    const forms = formIds.length > 0 ? await formRepo().findBy({ id: In(formIds) }) : [];
    const users = userIds.length > 0 ? await userRepo().findBy({ id: In(userIds) }) : [];

    const formMap = new Map<number, ApplicationForm>();
    for (const form of forms) formMap.set(form.id, form);

    const userMap = new Map<number, User>();
    for (const u of users) userMap.set(u.id, u);

    return rows.map((row) => {
      const form = formMap.get(Number(row.formId));
      const submitter = row.userId ? userMap.get(Number(row.userId)) : null;
      return {
        ...row,
        form: form ? normalizeFormForRead(form) : null,
        user: submitter
          ? {
              id: submitter.id,
              email: submitter.email,
              firstName: submitter.firstName,
              lastName: submitter.lastName,
              suspended: submitter.suspended,
            }
          : null,
      };
    });
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin list submissions', tags: ['Applications'] },
  });

  app.put(prefix + '/admin/applications/submissions/:id', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!isAdmin(user)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const submission = await submissionRepo().findOneBy({ id: Number(ctx.params.id) });
    if (!submission) {
      ctx.set.status = 404;
      return { error: 'Submission not found' };
    }

    const requestedStatus = String((ctx.body as any)?.status || '').trim().toLowerCase();
    if (!submissionStatuses.includes(requestedStatus as any)) {
      ctx.set.status = 400;
      return { error: 'Invalid status' };
    }

    submission.status = requestedStatus as any;
    submission.reviewedBy = user?.id;
    submission.reviewedAt = new Date();

    const saved = await submissionRepo().save(submission);
    return { success: true, submission: saved };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin update submission status', tags: ['Applications'] },
  });

  app.delete(prefix + '/admin/applications/submissions/:id', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!isAdmin(user)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    await submissionRepo().delete(Number(ctx.params.id));
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Admin delete submission', tags: ['Applications'] },
  });

  app.post(prefix + '/admin/applications/submissions/bulk-delete', async (ctx: any) => {
    const user = ctx.user as User | undefined;
    if (!isAdmin(user)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const body = (ctx.body || {}) as any;
    const ids = Array.isArray(body.ids)
      ? body.ids.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
      : [];

    if (ids.length === 0) {
      ctx.set.status = 400;
      return { error: 'ids array is required' };
    }

    const result = await submissionRepo()
      .createQueryBuilder()
      .delete()
      .from(ApplicationSubmission)
      .where('id IN (:...ids)', { ids })
      .execute();

    return {
      success: true,
      deleted: Number(result.affected || 0),
      requested: ids.length,
    };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean(), deleted: t.Number(), requested: t.Number() }),
      400: t.Object({ error: t.String() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Admin bulk delete submissions', tags: ['Applications'] },
  });
}