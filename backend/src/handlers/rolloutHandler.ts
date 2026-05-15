import { t } from 'elysia';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import {
  getAllRollouts,
  createRollout,
  updateRollout,
  deleteRollout,
  getUserRollouts,
  getOverridesForRollout,
  addRolloutOverride,
  removeRolloutOverride,
} from '../services/rolloutService';

export async function rolloutRoutes(app: any, prefix = '') {
  app.get(prefix + '/admin/rollouts', async (ctx: any) => {
    const rollouts = await getAllRollouts();
    return Promise.all(rollouts.map(async (r) => {
      const overrides = await getOverridesForRollout(r.id);
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        key: r.key,
        active: r.active,
        hashRangeStart: r.hashRangeStart,
        hashRangeEnd: r.hashRangeEnd,
        treatment: r.treatment,
        overrideCount: overrides.length,
        overrides: overrides.map((o) => ({ id: o.id, userId: o.userId, createdAt: o.createdAt })),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    }));
  }, {
    beforeHandle: [authenticate, authorize('admin:access')],
    detail: { tags: ['Admin'], summary: 'List all rollouts with overrides' },
  });

  app.post(prefix + '/admin/rollouts', async (ctx: any) => {
    const body = ctx.body as any;
    if (!body?.name || !body?.key) {
      ctx.set.status = 400;
      return { error: 'name and key are required' };
    }

    const data: any = {
      name: String(body.name).trim(),
      key: String(body.key).trim(),
      description: body.description ? String(body.description).trim() : '',
      active: body.active !== undefined ? Boolean(body.active) : true,
      hashRangeStart: body.hashRangeStart !== undefined ? Number(body.hashRangeStart) : 0,
      hashRangeEnd: body.hashRangeEnd !== undefined ? Number(body.hashRangeEnd) : 9999,
      treatment: body.treatment ? String(body.treatment).trim() : 'treatment',
    };

    try {
      const rollout = await createRollout(data);
      ctx.set.status = 201;
      return rollout;
    } catch (err: any) {
      ctx.set.status = 400;
      return { error: err.message || 'Failed to create rollout' };
    }
  }, {
    beforeHandle: [authenticate, authorize('admin:access')],
    detail: { tags: ['Admin'], summary: 'Create a rollout' },
  });

  app.put(prefix + '/admin/rollouts/:id', async (ctx: any) => {
    const id = Number(ctx.params?.id);
    if (!id || isNaN(id)) {
      ctx.set.status = 400;
      return { error: 'Invalid rollout ID' };
    }

    const body = ctx.body as any;
    const data: any = {};

    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.description !== undefined) data.description = String(body.description).trim();
    if (body.key !== undefined) data.key = String(body.key).trim();
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.hashRangeStart !== undefined) data.hashRangeStart = Number(body.hashRangeStart);
    if (body.hashRangeEnd !== undefined) data.hashRangeEnd = Number(body.hashRangeEnd);
    if (body.treatment !== undefined) data.treatment = String(body.treatment).trim();
    try {
      const rollout = await updateRollout(id, data);
      if (!rollout) {
        ctx.set.status = 404;
        return { error: 'Rollout not found' };
      }
      return rollout;
    } catch (err: any) {
      ctx.set.status = 400;
      return { error: err.message || 'Failed to update rollout' };
    }
  }, {
    beforeHandle: [authenticate, authorize('admin:access')],
    detail: { tags: ['Admin'], summary: 'Update a rollout' },
  });

  app.delete(prefix + '/admin/rollouts/:id', async (ctx: any) => {
    const id = Number(ctx.params?.id);
    if (!id || isNaN(id)) {
      ctx.set.status = 400;
      return { error: 'Invalid rollout ID' };
    }

    const deleted = await deleteRollout(id);
    if (!deleted) {
      ctx.set.status = 404;
      return { error: 'Rollout not found' };
    }

    return { success: true };
  }, {
    beforeHandle: [authenticate, authorize('admin:access')],
    detail: { tags: ['Admin'], summary: 'Delete a rollout' },
  });

  // ─── Override endpoints ──────────────────────────────────────────────

  app.get(prefix + '/admin/rollouts/:id/overrides', async (ctx: any) => {
    const id = Number(ctx.params?.id);
    if (!id || isNaN(id)) {
      ctx.set.status = 400;
      return { error: 'Invalid rollout ID' };
    }
    const overrides = await getOverridesForRollout(id);
    return overrides.map((o) => ({ id: o.id, userId: o.userId, createdAt: o.createdAt }));
  }, {
    beforeHandle: [authenticate, authorize('admin:access')],
    detail: { tags: ['Admin'], summary: 'List user overrides for a rollout' },
  });

  app.post(prefix + '/admin/rollouts/:id/overrides', async (ctx: any) => {
    const id = Number(ctx.params?.id);
    if (!id || isNaN(id)) {
      ctx.set.status = 400;
      return { error: 'Invalid rollout ID' };
    }
    const body = ctx.body as any;
    const userId = Number(body?.userId);
    if (!userId || isNaN(userId)) {
      ctx.set.status = 400;
      return { error: 'Valid userId is required' };
    }
    try {
      const override = await addRolloutOverride(id, userId);
      ctx.set.status = 201;
      return { id: override.id, userId: override.userId, createdAt: override.createdAt };
    } catch (err: any) {
      ctx.set.status = 400;
      return { error: err.message || 'Failed to add override' };
    }
  }, {
    beforeHandle: [authenticate, authorize('admin:access')],
    detail: { tags: ['Admin'], summary: 'Add a user override to a rollout' },
  });

  app.delete(prefix + '/admin/rollouts/:id/overrides/:userId', async (ctx: any) => {
    const id = Number(ctx.params?.id);
    const userId = Number(ctx.params?.userId);
    if (!id || isNaN(id)) {
      ctx.set.status = 400;
      return { error: 'Invalid rollout ID' };
    }
    if (!userId || isNaN(userId)) {
      ctx.set.status = 400;
      return { error: 'Invalid userId' };
    }
    const removed = await removeRolloutOverride(id, userId);
    if (!removed) {
      ctx.set.status = 404;
      return { error: 'Override not found' };
    }
    return { success: true };
  }, {
    beforeHandle: [authenticate, authorize('admin:access')],
    detail: { tags: ['Admin'], summary: 'Remove a user override from a rollout' },
  });

  app.get(prefix + '/rollouts', async (ctx: any) => {
    const userId = ctx.user?.id;
    if (!userId) {
      return {};
    }
    return getUserRollouts(userId);
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Rollouts'], summary: 'Get active rollouts for the current user' },
  });
}