import { t } from 'elysia';
import { AppDataSource } from '../config/typeorm';
import { BackupGroup } from '../models/backupGroup.entity';
import { ServerBackup } from '../models/serverBackup.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import type { AuthenticatedHandlerContext, ServerApp } from '../types';

function groupRepo() { return AppDataSource.getRepository(BackupGroup); }
function backupRepo() { return AppDataSource.getRepository(ServerBackup); }

function apiGroup(g: BackupGroup) {
  return {
    uuid: g.uuid,
    name: g.name,
    description: g.description,
    serverUuid: g.serverUuid,
    backupUuids: g.backupUuids,
    compressionType: g.compressionType,
    locked: g.locked,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export async function backupGroupRoutes(app: ServerApp, prefix = '') {
  const base = prefix + '/servers/v1/:id/backup-groups';

  app.get(
    base,
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = ctx.params as Record<string, string>;
      const groups = await groupRepo().find({
        where: { serverUuid: id },
        order: { createdAt: 'DESC' },
      });
      return { groups: groups.map(apiGroup) };
    },
    {
      beforeHandle: [authenticate, authorize('backups:read')],
      detail: { summary: 'List backup groups', tags: ['Backup Groups'] },
    },
  );

  app.post(
    base,
    async (ctx: AuthenticatedHandlerContext) => {
      const { id } = ctx.params as Record<string, string>;
      const body = ctx.body as any;
      const name = body?.name?.trim();
      if (!name || name.length < 1 || name.length > 255) {
        ctx.set.status = 400;
        return { error: 'Name must be 1-255 characters' };
      }
      const g = groupRepo().create({
        uuid: crypto.randomUUID(),
        serverUuid: id,
        name,
        description: body?.description?.trim() || null,
        backupUuids: Array.isArray(body?.backupUuids) ? body.backupUuids : [],
        compressionType: body?.compressionType || null,
      });
      await groupRepo().save(g);
      return { group: apiGroup(g) };
    },
    {
      beforeHandle: [authenticate, authorize('backups:write')],
      body: t.Any(),
      detail: { summary: 'Create backup group', tags: ['Backup Groups'] },
    },
  );

  app.get(
    base + '/:groupId',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, groupId } = ctx.params as Record<string, string>;
      const g = await groupRepo().findOneBy({ uuid: groupId, serverUuid: id });
      if (!g) { ctx.set.status = 404; return { error: 'Group not found' }; }
      return { group: apiGroup(g) };
    },
    {
      beforeHandle: [authenticate, authorize('backups:read')],
      detail: { summary: 'Get backup group', tags: ['Backup Groups'] },
    },
  );

  app.put(
    base + '/:groupId',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, groupId } = ctx.params as Record<string, string>;
      const g = await groupRepo().findOneBy({ uuid: groupId, serverUuid: id });
      if (!g) { ctx.set.status = 404; return { error: 'Group not found' }; }
      if (g.locked) { ctx.set.status = 423; return { error: 'Group is locked' }; }

      const body = ctx.body as any;
      if (body?.name !== undefined) {
        const name = body.name?.trim();
        if (!name || name.length < 1 || name.length > 255) {
          ctx.set.status = 400;
          return { error: 'Name must be 1-255 characters' };
        }
        g.name = name;
      }
      if (body?.description !== undefined) g.description = body.description?.trim() || null;
      if (body?.backupUuids !== undefined) g.backupUuids = Array.isArray(body.backupUuids) ? body.backupUuids : [];
      if (body?.compressionType !== undefined) g.compressionType = body.compressionType || null;

      await groupRepo().save(g);
      return { group: apiGroup(g) };
    },
    {
      beforeHandle: [authenticate, authorize('backups:write')],
      body: t.Any(),
      detail: { summary: 'Update backup group', tags: ['Backup Groups'] },
    },
  );

  app.delete(
    base + '/:groupId',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, groupId } = ctx.params as Record<string, string>;
      const g = await groupRepo().findOneBy({ uuid: groupId, serverUuid: id });
      if (!g) { ctx.set.status = 404; return { error: 'Group not found' }; }
      await groupRepo().remove(g);
      return { success: true };
    },
    {
      beforeHandle: [authenticate, authorize('backups:write')],
      detail: { summary: 'Delete backup group', tags: ['Backup Groups'] },
    },
  );

  app.post(
    base + '/:groupId/backups/:backupUuid',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, groupId, backupUuid } = ctx.params as Record<string, string>;
      const g = await groupRepo().findOneBy({ uuid: groupId, serverUuid: id });
      if (!g) { ctx.set.status = 404; return { error: 'Group not found' }; }
      if (g.locked) { ctx.set.status = 423; return { error: 'Group is locked' }; }

      const backup = await backupRepo().findOneBy({ uuid: backupUuid });
      if (!backup) { ctx.set.status = 404; return { error: 'Backup not found' }; }

      if (!g.backupUuids.includes(backupUuid)) {
        g.backupUuids.push(backupUuid);
        await groupRepo().save(g);
      }
      return { group: apiGroup(g) };
    },
    {
      beforeHandle: [authenticate, authorize('backups:write')],
      detail: { summary: 'Add backup to group', tags: ['Backup Groups'] },
    },
  );

  app.delete(
    base + '/:groupId/backups/:backupUuid',
    async (ctx: AuthenticatedHandlerContext) => {
      const { id, groupId, backupUuid } = ctx.params as Record<string, string>;
      const g = await groupRepo().findOneBy({ uuid: groupId, serverUuid: id });
      if (!g) { ctx.set.status = 404; return { error: 'Group not found' }; }
      if (g.locked) { ctx.set.status = 423; return { error: 'Group is locked' }; }

      g.backupUuids = g.backupUuids.filter(u => u !== backupUuid);
      await groupRepo().save(g);
      return { group: apiGroup(g) };
    },
    {
      beforeHandle: [authenticate, authorize('backups:write')],
      detail: { summary: 'Remove backup from group', tags: ['Backup Groups'] },
    },
  );
}