import { AppDataSource } from '../config/typeorm';
import { t } from 'elysia';
import { Plan } from '../models/plan.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { requireFeature } from '../middleware/featureToggle';

function isAdmin(ctx: any): boolean {
  const user = (ctx as any).user as User | undefined;
  const apiKey = (ctx as any).apiKey;
  if (apiKey?.type === 'admin') return true;
  return !!(user && hasPermissionSync(ctx, 'admin:access'));
}

export async function planRoutes(app: any, prefix = '') {
  const planRepo = () => AppDataSource.getRepository(Plan);

  app.get(prefix + '/plans', async (ctx) => {
    const f = await requireFeature(ctx, 'billing'); if (f !== true) return f;
    const plans = await planRepo().find({ order: { price: 'ASC' } });
    return plans;
  }, {
    detail: { summary: 'List all plans', tags: ['Plans'] },
    response: { 200: t.Array(t.Any()) }
  });

  app.get(prefix + '/plans/:id', async (ctx) => {
    const f = await requireFeature(ctx, 'billing'); if (f !== true) return f;
    const plan = await planRepo().findOneBy({ id: Number((ctx.params as any).id) });
    if (!plan) {
      ctx.set.status = 404;
      return { error: 'Plan not found' };
    }
    return plan;
  }, {
    detail: { summary: 'Get plan by id', tags: ['Plans'] },
    response: { 200: t.Any(), 404: t.Object({ error: t.String() }) }
  });

  app.get(prefix + '/admin/plans', async (ctx) => {
    if (!isAdmin(ctx)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const f = await requireFeature(ctx, 'billing'); if (f !== true) return f;
    const plans = await planRepo().find({ order: { price: 'ASC' } });
    return plans;
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'List all plans (admin)', tags: ['Plans', 'Admin'] },
    response: { 200: t.Array(t.Any()), 403: t.Object({ error: t.String() }) }
  });

  app.post(prefix + '/admin/plans', async (ctx) => {
    if (!isAdmin(ctx)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const {
      name, type, price, description,
      memory, disk, cpu, serverLimit, databases, backups,
      emailSendDailyLimit, emailSendQueueLimit,
      portCount, isDefault, hiddenFromBilling, features,
    } = ctx.body as any;
    if (!name || !type) {
      ctx.set.status = 400;
      return { error: 'name and type are required' };
    }

    const plan = planRepo().create({
      name,
      type,
      price: price != null ? Number(price) : 0,
      description: description || undefined,
      memory: memory != null ? Number(memory) : undefined,
      disk: disk != null ? Number(disk) : undefined,
      cpu: cpu != null ? Number(cpu) : undefined,
      serverLimit: serverLimit != null ? Number(serverLimit) : undefined,
      databases: databases != null ? Number(databases) : undefined,
      backups: backups != null ? Number(backups) : undefined,
      emailSendDailyLimit: emailSendDailyLimit != null ? Number(emailSendDailyLimit) : undefined,
      emailSendQueueLimit: emailSendQueueLimit != null ? Number(emailSendQueueLimit) : undefined,
      portCount: portCount != null ? Number(portCount) : 1,
      isDefault: isDefault ?? false,
      hiddenFromBilling: hiddenFromBilling ?? false,
      features: features ?? undefined,
    });
    await planRepo().save(plan);
    return { success: true, plan };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Create a plan (admin)', tags: ['Plans', 'Admin'] },
    response: { 200: t.Object({ success: t.Boolean(), plan: t.Any() }), 400: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) }
  });

  app.put(prefix + '/admin/plans/:id', async (ctx) => {
    if (!isAdmin(ctx)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const plan = await planRepo().findOneBy({ id: Number((ctx.params as any).id) });
    if (!plan) {
      ctx.set.status = 404;
      return { error: 'Plan not found' };
    }

    const {
      name, type, price, description,
      memory, disk, cpu, serverLimit, databases, backups,
      emailSendDailyLimit, emailSendQueueLimit,
      portCount, isDefault, hiddenFromBilling, features,
    } = ctx.body as any;

    if (name !== undefined) plan.name = name;
    if (type !== undefined) plan.type = type;
    if (price !== undefined) plan.price = Number(price);
    if (description !== undefined) plan.description = description || undefined;
    if (memory !== undefined) plan.memory = memory != null ? Number(memory) : undefined;
    if (disk !== undefined) plan.disk = disk != null ? Number(disk) : undefined;
    if (cpu !== undefined) plan.cpu = cpu != null ? Number(cpu) : undefined;
    if (serverLimit !== undefined) plan.serverLimit = serverLimit != null ? Number(serverLimit) : undefined;
    if (databases !== undefined) plan.databases = databases != null ? Number(databases) : undefined;
    if (backups !== undefined) plan.backups = backups != null ? Number(backups) : undefined;
    if (emailSendDailyLimit !== undefined) plan.emailSendDailyLimit = emailSendDailyLimit != null ? Number(emailSendDailyLimit) : undefined;
    if (emailSendQueueLimit !== undefined) plan.emailSendQueueLimit = emailSendQueueLimit != null ? Number(emailSendQueueLimit) : undefined;
    if (portCount !== undefined) plan.portCount = Number(portCount);
    if (isDefault !== undefined) plan.isDefault = Boolean(isDefault);
    if (hiddenFromBilling !== undefined) plan.hiddenFromBilling = Boolean(hiddenFromBilling);
    if (features !== undefined) plan.features = features ?? undefined;

    await planRepo().save(plan);
    return { success: true, plan };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Update a plan (admin)', tags: ['Plans', 'Admin'] },
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });

  app.post(prefix + '/admin/plans/:id/reapply-limits', async (ctx) => {
    if (!isAdmin(ctx)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const plan = await planRepo().findOneBy({ id: Number((ctx.params as any).id) });
    if (!plan) {
      ctx.set.status = 404;
      return { error: 'Plan not found' };
    }

    const force = (ctx.query?.force === 'true' || ctx.query?.force === true || ctx.body?.force === true);

    const userRepo = AppDataSource.getRepository(User);
    const users = await userRepo.find({ where: { portalType: plan.type } });

    const planLimits: Record<string, number> = {};
    if (plan.memory != null) planLimits.memory = Number(plan.memory);
    if (plan.disk != null) planLimits.disk = Number(plan.disk);
    if (plan.cpu != null) planLimits.cpu = Number(plan.cpu);
    if (plan.serverLimit != null) planLimits.serverLimit = Number(plan.serverLimit);
    if (plan.databases != null) planLimits.databases = Number(plan.databases);
    if (plan.backups != null) planLimits.backups = Number(plan.backups);

    const isCustomLimits = (userLimits: Record<string, any> | null | undefined, planLimits: Record<string, number>) => {
      if (!userLimits || Object.keys(userLimits).length === 0) return false;
      if (Object.keys(planLimits).length === 0) return false; 
      const planKeys = Object.keys(planLimits);
      const extraKeys = Object.keys(userLimits).filter((k) => !planKeys.includes(k));
      if (extraKeys.length > 0) return true;
      for (const key of planKeys) {
        const userValue = userLimits[key];
        if (userValue == null) return true;
        if (Number(userValue) !== Number(planLimits[key])) return true;
      }

      return false;
    };

    let updated = 0;
    const toSave: User[] = [];
    for (const u of users) {
      const existingPlanScopedLimits = plan.type === 'educational' ? (u.educationLimits || u.limits) : u.limits;
      if (!force && isCustomLimits(existingPlanScopedLimits, planLimits)) continue;

      if (Object.keys(planLimits).length > 0) {
        if (plan.type === 'educational') {
          u.educationLimits = { ...planLimits };
          u.limits = { ...planLimits };
        } else {
          u.limits = { ...planLimits };
        }
      } else {
        if (plan.type === 'educational') {
          u.educationLimits = null;
          u.limits = null;
        } else {
          u.limits = null;
        }
      }

      toSave.push(u);
      updated++;
    }

    if (toSave.length > 0) await userRepo.save(toSave);

    return { success: true, updated };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Reapply plan limits to users without custom limits', tags: ['Plans', 'Admin'] },
    response: { 200: t.Object({ success: t.Boolean(), updated: t.Number() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });

  app.delete(prefix + '/admin/plans/:id', async (ctx) => {
    if (!isAdmin(ctx)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const plan = await planRepo().findOneBy({ id: Number((ctx.params as any).id) });
    if (!plan) {
      ctx.set.status = 404;
      return { error: 'Plan not found' };
    }
    await planRepo().remove(plan);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Delete a plan (admin)', tags: ['Plans', 'Admin'] },
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });
}