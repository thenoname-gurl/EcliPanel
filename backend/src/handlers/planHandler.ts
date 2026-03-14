import { AppDataSource } from '../config/typeorm';
import { t } from 'elysia';
import { Plan } from '../models/plan.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';

function isAdmin(ctx: any): boolean {
  const user = (ctx as any).user as User | undefined;
  const apiKey = (ctx as any).apiKey;
  if (apiKey?.type === 'admin') return true;
  return !!(user && ['admin', 'rootAdmin', '*'].includes(user.role ?? ''));
}

export async function planRoutes(app: any, prefix = '') {
  const planRepo = () => AppDataSource.getRepository(Plan);

  app.get(prefix + '/plans', async (_ctx) => {
    const plans = await planRepo().find({ order: { price: 'ASC' } });
    return plans;
  }, {
    detail: { summary: 'List all plans', tags: ['Plans'] },
    response: { 200: t.Array(t.Any()) }
  });

  app.get(prefix + '/plans/:id', async (ctx) => {
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
      memory, disk, cpu, serverLimit,
      portCount, isDefault, features,
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
      portCount: portCount != null ? Number(portCount) : 1,
      isDefault: isDefault ?? false,
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
      memory, disk, cpu, serverLimit,
      portCount, isDefault, features,
    } = ctx.body as any;

    if (name !== undefined) plan.name = name;
    if (type !== undefined) plan.type = type;
    if (price !== undefined) plan.price = Number(price);
    if (description !== undefined) plan.description = description || undefined;
    if (memory !== undefined) plan.memory = memory != null ? Number(memory) : undefined;
    if (disk !== undefined) plan.disk = disk != null ? Number(disk) : undefined;
    if (cpu !== undefined) plan.cpu = cpu != null ? Number(cpu) : undefined;
    if (serverLimit !== undefined) plan.serverLimit = serverLimit != null ? Number(serverLimit) : undefined;
    if (portCount !== undefined) plan.portCount = Number(portCount);
    if (isDefault !== undefined) plan.isDefault = Boolean(isDefault);
    if (features !== undefined) plan.features = features ?? undefined;

    await planRepo().save(plan);
    return { success: true, plan };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Update a plan (admin)', tags: ['Plans', 'Admin'] },
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
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