import { t } from 'elysia';
import { AppDataSource } from '../config/typeorm';
import { ServerSchedule } from '../models/serverSchedule.entity';
import { ServerScheduleStep } from '../models/serverScheduleStep.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { nodeService } from '../services/nodeService';
import { WingsApiService } from '../services/wingsApiService';
import type { AuthenticatedHandlerContext, ServerApp } from '../types';
import type { ScheduleRecord } from '../types/schedule';
import { buildWingsSchedules } from '../types/schedule';

const SCHEDULE_OP_TIMEOUT_MS = 25_000;
const SCHEDULE_LIMIT_DEFAULT = 25;

function scheduleRepo() { return AppDataSource.getRepository(ServerSchedule); }
function stepRepo() { return AppDataSource.getRepository(ServerScheduleStep); }
function cfgRepo() { return AppDataSource.getRepository(ServerConfig); }

async function serviceFor(serverId: string) {
  return nodeService.getServiceForServer(serverId);
}

async function getScheduleLimit(serverId: string): Promise<number> {
  const cfg = await cfgRepo().findOneBy({ uuid: serverId });
  return (cfg as any)?.maxSchedules || SCHEDULE_LIMIT_DEFAULT;
}

function validateScheduleName(name: unknown): string | null {
  if (typeof name !== 'string' || name.length < 1 || name.length > 255) {
    return 'Name must be between 1 and 255 characters';
  }
  return null;
}

function validateTriggers(triggers: unknown): string | null {
  if (!Array.isArray(triggers) || triggers.length === 0) return 'At least one trigger is required';
  for (const tr of triggers) {
    if (!tr || typeof tr !== 'object') return 'Invalid trigger';
    const type = (tr as any).type;
    const valid = ['cron','power_action','server_state','backup_status','schedule_completion','resource_usage','resource_usage_over_time','console_line','crash'];
    if (!valid.includes(type)) return `Invalid trigger type: ${type}`;
  }
  return null;
}

function validateCondition(cond: unknown, depth = 0): string | null {
  if (depth > 8) return 'Maximum condition nesting depth exceeded';
  if (!cond || typeof cond !== 'object') return 'Invalid condition';
  const c = cond as any;
  if (c.type === 'and' || c.type === 'or' || c.type === 'xor') {
    if (!Array.isArray(c.conditions)) return `${c.type} requires conditions array`;
    for (const sc of c.conditions) {
      const err = validateCondition(sc, depth + 1);
      if (err) return err;
    }
  } else if (c.type === 'not') {
    if (!c.condition) return 'not requires a condition';
    const err = validateCondition(c.condition, depth + 1);
    if (err) return err;
  }
  return null;
}

function validateAction(action: unknown): string | null {
  if (!action || typeof action !== 'object') return 'Invalid action';
  const a = action as any;
  if (!a.type) return 'Action type is required';
  if (a.type === 'send_power' && !['start','stop','restart','kill'].includes(a.action)) {
    return 'Invalid power action';
  }
  if (a.type === 'send_command' && typeof a.command !== 'string') {
    return 'Command must be a string';
  }
  return null;
}

function apiSchedule(s: ServerSchedule): any {
  return {
    uuid: s.uuid,
    name: s.name,
    enabled: s.enabled,
    triggers: s.triggers,
    condition: s.condition,
    last_run: s.lastRun ? new Date(s.lastRun).toISOString() : null,
    last_failure: s.lastFailure ? new Date(s.lastFailure).toISOString() : null,
    created: s.created ? new Date(s.created).toISOString() : null,
    steps_count: undefined as number | undefined,
  };
}

function apiStep(st: ServerScheduleStep): any {
  return {
    uuid: st.uuid,
    schedule_uuid: st.scheduleUuid,
    order: st.order_,
    action: st.action,
    created: st.created ? new Date(st.created).toISOString() : null,
  };
}

const pendingSyncs = new Map<string, ReturnType<typeof setTimeout>>();

// Throws on failure — debouncedSync catches it, trigger/abort propagate it.
async function syncSchedulesToWings(serverId: string) {
  const schedules = await scheduleRepo().find({
    where: { serverUuid: serverId, enabled: true },
    order: { created: 'ASC' },
  });
  const wingsSchedules = [];
  for (const s of schedules) {
    const sSteps = await stepRepo().find({
      where: { scheduleUuid: s.uuid },
      order: { order_: 'ASC', created: 'ASC' },
    });
    wingsSchedules.push({
      uuid: s.uuid,
      triggers: s.triggers,
      condition: s.condition,
      actions: sSteps.map(st => ({ uuid: st.uuid, ...st.action })),
    });
  }
  const svc = await serviceFor(serverId);
  await svc.syncServer(serverId, { schedules: wingsSchedules });
}

function debouncedSync(serverId: string) {
  const existing = pendingSyncs.get(serverId);
  if (existing) clearTimeout(existing);
  pendingSyncs.set(serverId, setTimeout(() => {
    pendingSyncs.delete(serverId);
    syncSchedulesToWings(serverId).catch(() => {});
  }, 500));
}

export async function scheduleRoutes(app: ServerApp, prefix = '') {
  const base = prefix + '/servers/v1/:id/schedules';

  app.get(
    base,
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = ctx.params as Record<string, string>;
      const page = Math.max(1, parseInt((ctx.query as any)?.page || '1', 10) || 1);
      const perPage = Math.min(100, Math.max(1, parseInt((ctx.query as any)?.per_page || '10', 10) || 10));
      const search = (ctx.query as any)?.search || '';

      const qb = scheduleRepo().createQueryBuilder('s')
        .where('s.serverUuid = :serverId', { serverId: id });
      if (search) {
        qb.andWhere('s.name LIKE :search', { search: `%${search}%` });
      }
      qb.orderBy('s.created', 'ASC').skip((page - 1) * perPage).take(perPage);
      const [items, total] = await qb.getManyAndCount();

      const data = await Promise.all(items.map(async (s) => {
        const count = await stepRepo().countBy({ scheduleUuid: s.uuid });
        return { ...apiSchedule(s), steps_count: count };
      }));

      return { schedules: { data, total, per_page: perPage, page } };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:read')],
      response: { 200: t.Any(), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'List schedules', tags: ['Schedules'] },
    }
  );

  app.post(
    base,
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = ctx.params as Record<string, string>;
      const body = ctx.body as Record<string, unknown>;

      const nameErr = validateScheduleName(body.name);
      if (nameErr) { ctx.set.status = 400; return { error: nameErr }; }
      const trigErr = validateTriggers(body.triggers);
      if (trigErr) { ctx.set.status = 400; return { error: trigErr }; }
      const condErr = validateCondition(body.condition);
      if (condErr) { ctx.set.status = 400; return { error: condErr }; }

      const limit = await getScheduleLimit(id);
      const count = await scheduleRepo().countBy({ serverUuid: id });
      if (count >= limit) {
        ctx.set.status = 417;
        return { error: 'Maximum number of schedules reached' };
      }

      const schedule = scheduleRepo().create({
        uuid: (body.uuid as string) || crypto.randomUUID(),
        serverUuid: id,
        name: body.name as string,
        enabled: body.enabled !== false,
        triggers: body.triggers as any[],
        condition: body.condition || { type: 'none' },
      });
      await scheduleRepo().save(schedule);

      debouncedSync(id);
      return { schedule: apiSchedule(schedule) };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:create')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 417: t.Object({ error: t.String() }) },
      detail: { summary: 'Create schedule', tags: ['Schedules'] },
    }
  );

  app.post(
    base + '/import',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = ctx.params as Record<string, string>;
      const body = ctx.body as Record<string, unknown>;

      const nameErr = validateScheduleName(body.name);
      if (nameErr) { ctx.set.status = 400; return { error: nameErr }; }

      const limit = await getScheduleLimit(id);
      const count = await scheduleRepo().countBy({ serverUuid: id });
      if (count >= limit) {
        ctx.set.status = 417;
        return { error: 'Maximum number of schedules reached' };
      }

      const steps = (body.steps || []) as any[];

      const schedule = scheduleRepo().create({
        uuid: crypto.randomUUID(),
        serverUuid: id,
        name: body.name as string,
        enabled: body.enabled !== false,
        triggers: body.triggers as any[] || [{ type: 'cron', schedule: '* * * * *' }],
        condition: body.condition || { type: 'none' },
      });
      await scheduleRepo().save(schedule);

      for (let i = 0; i < steps.length; i++) {
        const step = stepRepo().create({
          uuid: crypto.randomUUID(),
          scheduleUuid: schedule.uuid,
          order_: steps[i].order ?? i,
          action: steps[i].action || steps[i],
        });
        await stepRepo().save(step);
      }

      debouncedSync(id);
      return { schedule: apiSchedule(schedule) };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:create')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }) },
      detail: { summary: 'Import schedule', tags: ['Schedules'] },
    }
  );

  app.get(
    base + '/:sid',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid } = ctx.params as Record<string, string>;
      const s = await scheduleRepo().findOneBy({ uuid: sid, serverUuid: id });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found' }; }
      const steps = await stepRepo().find({ where: { scheduleUuid: sid }, order: { order_: 'ASC', created: 'ASC' } });
      return { schedule: { ...apiSchedule(s), steps: steps.map(apiStep) } };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:read')],
      response: { 200: t.Any(), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Get schedule', tags: ['Schedules'] },
    }
  );

  app.post(
    base + '/:sid',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid } = ctx.params as Record<string, string>;
      const body = ctx.body as Record<string, unknown>;
      const s = await scheduleRepo().findOneBy({ uuid: sid, serverUuid: id });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found' }; }

      if (body.name !== undefined) {
        const err = validateScheduleName(body.name);
        if (err) { ctx.set.status = 400; return { error: err }; }
        s.name = body.name as string;
      }
      if (body.enabled !== undefined) s.enabled = !!body.enabled;
      if (body.triggers !== undefined) {
        const err = validateTriggers(body.triggers);
        if (err) { ctx.set.status = 400; return { error: err }; }
        s.triggers = body.triggers as any[];
      }
      if (body.condition !== undefined) {
        const err = validateCondition(body.condition);
        if (err) { ctx.set.status = 400; return { error: err }; }
        s.condition = body.condition;
      }

      await scheduleRepo().save(s);
      debouncedSync(id);
      return { schedule: apiSchedule(s) };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:write')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Update schedule', tags: ['Schedules'] },
    }
  );

  app.delete(
    base + '/:sid',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid } = ctx.params as Record<string, string>;
      const s = await scheduleRepo().findOneBy({ uuid: sid, serverUuid: id });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found' }; }
      await stepRepo().delete({ scheduleUuid: sid });
      await scheduleRepo().remove(s);
      debouncedSync(id);
      return { success: true };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:write')],
      response: { 200: t.Object({ success: t.Boolean() }), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Delete schedule', tags: ['Schedules'] },
    }
  );

  app.post(
    base + '/:sid/trigger',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid } = ctx.params as Record<string, string>;
      const body = (ctx.body || {}) as { skip_condition?: boolean };
      try {
        const svc = await serviceFor(id) as WingsApiService;
        await syncSchedulesToWings(id);
        const res = await svc.triggerServerSchedule(id, sid, body.skip_condition || false, SCHEDULE_OP_TIMEOUT_MS);
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: any) {
        const status = e?.response?.status || 502;
        const msg = e?.response?.data?.error || e?.message || 'Trigger failed';
        ctx.set.status = status;
        return { error: msg };
      }
    },
    {
      beforeHandle: [authenticate, authorize('schedules:write')],
      response: { 200: t.Any(), 502: t.Object({ error: t.String() }) },
      detail: { summary: 'Trigger schedule', tags: ['Schedules'] },
    }
  );

  app.post(
    base + '/:sid/abort',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid } = ctx.params as Record<string, string>;
      try {
        const svc = await serviceFor(id) as WingsApiService;
        await syncSchedulesToWings(id);
        const res = await svc.abortServerSchedule(id, sid, SCHEDULE_OP_TIMEOUT_MS);
        return res.data && typeof res.data === 'object' ? res.data : { success: true };
      } catch (e: any) {
        ctx.set.status = e?.response?.status || 502;
        return { error: e?.response?.data?.error || e?.message || 'Abort failed' };
      }
    },
    {
      beforeHandle: [authenticate, authorize('schedules:write')],
      response: { 200: t.Any(), 502: t.Object({ error: t.String() }) },
      detail: { summary: 'Abort schedule', tags: ['Schedules'] },
    }
  );

  app.post(
    base + '/:sid/duplicate',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid } = ctx.params as Record<string, string>;
      const body = (ctx.body || {}) as { name?: string };
      const s = await scheduleRepo().findOneBy({ uuid: sid, serverUuid: id });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found' }; }

      const limit = await getScheduleLimit(id);
      const count = await scheduleRepo().countBy({ serverUuid: id });
      if (count >= limit) {
        ctx.set.status = 417;
        return { error: 'Maximum number of schedules reached' };
      }

      const newUuid = crypto.randomUUID();
      const dup = scheduleRepo().create({
        uuid: newUuid,
        serverUuid: id,
        name: body.name || `${s.name} (copy)`,
        enabled: s.enabled,
        triggers: s.triggers,
        condition: s.condition,
      });
      await scheduleRepo().save(dup);

      const steps = await stepRepo().find({ where: { scheduleUuid: sid }, order: { order_: 'ASC' } });
      for (const st of steps) {
        const newStep = stepRepo().create({
          uuid: crypto.randomUUID(),
          scheduleUuid: newUuid,
          order_: st.order_,
          action: st.action,
        });
        await stepRepo().save(newStep);
      }

      debouncedSync(id);
      return { schedule: apiSchedule(dup) };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:write')],
      response: { 200: t.Any(), 404: t.Object({ error: t.String() }), 417: t.Object({ error: t.String() }) },
      detail: { summary: 'Duplicate schedule', tags: ['Schedules'] },
    }
  );

  app.get(
    base + '/:sid/export',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid } = ctx.params as Record<string, string>;
      const s = await scheduleRepo().findOneBy({ uuid: sid, serverUuid: id });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found' }; }
      const steps = await stepRepo().find({ where: { scheduleUuid: sid }, order: { order_: 'ASC', created: 'ASC' } });
      return {
        name: s.name,
        enabled: s.enabled,
        triggers: s.triggers,
        condition: s.condition,
        steps: steps.map(st => ({ order: st.order_, action: st.action })),
      };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:read')],
      response: { 200: t.Any(), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Export schedule', tags: ['Schedules'] },
    }
  );

  app.get(
    base + '/:sid/status',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid } = ctx.params as Record<string, string>;
      try {
        const svc = await serviceFor(id) as WingsApiService;
        const res = await svc.serverRequest(id, `/schedules/${sid}`, 'get');
        return (res as any).data || res;
      } catch (e: any) {
        ctx.set.status = e?.response?.status || 502;
        return { error: e?.response?.data?.error || e?.message || 'Status check failed' };
      }
    },
    {
      beforeHandle: [authenticate, authorize('schedules:read')],
      response: { 200: t.Any(), 502: t.Object({ error: t.String() }) },
      detail: { summary: 'Get schedule status from Wings', tags: ['Schedules'] },
    }
  );

  const stepBase = base + '/:sid/steps';

  app.get(
    stepBase,
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid } = ctx.params as Record<string, string>;
      const s = await scheduleRepo().findOneBy({ uuid: sid, serverUuid: id });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found' }; }
      const steps = await stepRepo().find({ where: { scheduleUuid: sid }, order: { order_: 'ASC', created: 'ASC' } });
      return { steps: steps.map(apiStep) };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:read')],
      response: { 200: t.Any(), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'List schedule steps', tags: ['Schedules'] },
    }
  );

  app.post(
    stepBase,
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid } = ctx.params as Record<string, string>;
      const body = ctx.body as Record<string, unknown>;
      const s = await scheduleRepo().findOneBy({ uuid: sid, serverUuid: id });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found' }; }

      const action = body.action || body;
      const actErr = validateAction(action);
      if (actErr) { ctx.set.status = 400; return { error: actErr }; }

      const maxOrder = await stepRepo().maximum('order_', { scheduleUuid: sid }) || -1;

      const step = stepRepo().create({
        uuid: crypto.randomUUID(),
        scheduleUuid: sid,
        order_: (body.order as number) ?? maxOrder + 1,
        action,
      });
      await stepRepo().save(step);

      debouncedSync(id);
      return { step: apiStep(step) };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:write')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Create schedule step', tags: ['Schedules'] },
    }
  );

  app.post(
    stepBase + '/order',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid } = ctx.params as Record<string, string>;
      const body = ctx.body as { steps?: { uuid: string; order: number }[] };
      const s = await scheduleRepo().findOneBy({ uuid: sid, serverUuid: id });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found' }; }

      if (body.steps && Array.isArray(body.steps)) {
        for (const item of body.steps) {
          await stepRepo().update({ uuid: item.uuid, scheduleUuid: sid }, { order_: item.order });
        }
      }

      debouncedSync(id);
      const steps = await stepRepo().find({ where: { scheduleUuid: sid }, order: { order_: 'ASC', created: 'ASC' } });
      return { steps: steps.map(apiStep) };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:write')],
      response: { 200: t.Any(), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Reorder schedule steps', tags: ['Schedules'] },
    }
  );

  app.get(
    stepBase + '/:stepId',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid, stepId } = ctx.params as Record<string, string>;
      const s = await scheduleRepo().findOneBy({ uuid: sid, serverUuid: id });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found' }; }
      const step = await stepRepo().findOneBy({ uuid: stepId, scheduleUuid: sid });
      if (!step) { ctx.set.status = 404; return { error: 'Step not found' }; }
      return { step: apiStep(step) };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:read')],
      response: { 200: t.Any(), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Get schedule step', tags: ['Schedules'] },
    }
  );

  app.post(
    stepBase + '/:stepId',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid, stepId } = ctx.params as Record<string, string>;
      const body = ctx.body as Record<string, unknown>;
      const step = await stepRepo().findOneBy({ uuid: stepId, scheduleUuid: sid });
      if (!step) { ctx.set.status = 404; return { error: 'Step not found' }; }

      if (body.action !== undefined) {
        const err = validateAction(body.action);
        if (err) { ctx.set.status = 400; return { error: err }; }
        step.action = body.action;
      }
      if (body.order !== undefined) step.order_ = body.order as number;

      await stepRepo().save(step);
      debouncedSync(id);
      return { step: apiStep(step) };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:write')],
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Update schedule step', tags: ['Schedules'] },
    }
  );

  app.delete(
    stepBase + '/:stepId',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid, stepId } = ctx.params as Record<string, string>;
      const step = await stepRepo().findOneBy({ uuid: stepId, scheduleUuid: sid });
      if (!step) { ctx.set.status = 404; return { error: 'Step not found' }; }
      await stepRepo().remove(step);
      debouncedSync(id);
      return { success: true };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:write')],
      response: { 200: t.Object({ success: t.Boolean() }), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Delete schedule step', tags: ['Schedules'] },
    }
  );

  app.post(
    stepBase + '/:stepId/duplicate',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, sid, stepId } = ctx.params as Record<string, string>;
      const step = await stepRepo().findOneBy({ uuid: stepId, scheduleUuid: sid });
      if (!step) { ctx.set.status = 404; return { error: 'Step not found' }; }

      const dup = stepRepo().create({
        uuid: crypto.randomUUID(),
        scheduleUuid: sid,
        order_: step.order_ + 1,
        action: step.action,
      });
      await stepRepo().save(dup);

      const later = await stepRepo().find({
        where: { scheduleUuid: sid },
        order: { order_: 'ASC' },
      });
      for (const s of later) {
        if (s.uuid !== dup.uuid && s.order_ >= dup.order_) {
          s.order_ += 1;
          await stepRepo().save(s);
        }
      }

      debouncedSync(id);
      return { step: apiStep(dup) };
    },
    {
      beforeHandle: [authenticate, authorize('schedules:write')],
      response: { 200: t.Any(), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Duplicate schedule step', tags: ['Schedules'] },
    }
  );
}