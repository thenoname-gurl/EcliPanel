import { t } from 'elysia';
import { AppDataSource } from '../config/typeorm';
import { BackupConfiguration } from '../models/backupConfiguration.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import type { AuthenticatedHandlerContext, ServerApp } from '../types';

function repo() { return AppDataSource.getRepository(BackupConfiguration); }

function apiConfig(c: BackupConfiguration) {
  return {
    uuid: c.uuid,
    name: c.name,
    description: c.description,
    backupDisk: c.backupDisk,
    config: c.config,
    shared: c.shared,
    maintenanceEnabled: c.maintenanceEnabled,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function backupConfigRoutes(app: ServerApp, prefix = '') {
  const base = prefix + '/admin/backup-configurations';

  app.get(base, async () => {
    const configs = await repo().find({ order: { createdAt: 'DESC' } });
    return { data: configs.map(apiConfig) };
  }, {
    beforeHandle: [authenticate, authorize('admin:read')],
    detail: { summary: 'List backup configurations', tags: ['Backup Configs'] },
  });

  app.get(base + '/:uuid', async (ctx: AuthenticatedHandlerContext) => {
    const c = await repo().findOneBy({ uuid: (ctx.params as any).uuid });
    if (!c) { ctx.set.status = 404; return { error: 'Not found' }; }
    return apiConfig(c);
  }, {
    beforeHandle: [authenticate, authorize('admin:read')],
    detail: { summary: 'Get backup configuration', tags: ['Backup Configs'] },
  });

  app.post(base, async (ctx: AuthenticatedHandlerContext) => {
    const body = ctx.body as any;
    const name = body?.name?.trim();
    if (!name || name.length < 1 || name.length > 255) {
      ctx.set.status = 400; return { error: 'Name required (1-255 chars)' };
    }
    const c = repo().create({
      uuid: crypto.randomUUID(),
      name,
      description: body.description || null,
      backupDisk: body.backupDisk || 'local',
      config: body.config || null,
      shared: body.shared === true,
      maintenanceEnabled: body.maintenanceEnabled !== false,
    });
    await repo().save(c);
    ctx.set.status = 201;
    return apiConfig(c);
  }, {
    beforeHandle: [authenticate, authorize('admin:write')],
    body: t.Any(),
    detail: { summary: 'Create backup configuration', tags: ['Backup Configs'] },
  });

  app.put(base + '/:uuid', async (ctx: AuthenticatedHandlerContext) => {
    const c = await repo().findOneBy({ uuid: (ctx.params as any).uuid });
    if (!c) { ctx.set.status = 404; return { error: 'Not found' }; }
    const body = ctx.body as any;
    if (body.name !== undefined) c.name = body.name;
    if (body.description !== undefined) c.description = body.description;
    if (body.backupDisk !== undefined) c.backupDisk = body.backupDisk;
    if (body.config !== undefined) c.config = body.config;
    if (body.shared !== undefined) c.shared = body.shared;
    if (body.maintenanceEnabled !== undefined) c.maintenanceEnabled = body.maintenanceEnabled;
    await repo().save(c);
    return apiConfig(c);
  }, {
    beforeHandle: [authenticate, authorize('admin:write')],
    body: t.Any(),
    detail: { summary: 'Update backup configuration', tags: ['Backup Configs'] },
  });

  app.delete(base + '/:uuid', async (ctx: AuthenticatedHandlerContext) => {
    const c = await repo().findOneBy({ uuid: (ctx.params as any).uuid });
    if (!c) { ctx.set.status = 404; return { error: 'Not found' }; }
    await repo().remove(c);
    return { success: true };
  }, {
    beforeHandle: [authenticate, authorize('admin:write')],
    detail: { summary: 'Delete backup configuration', tags: ['Backup Configs'] },
  });
}