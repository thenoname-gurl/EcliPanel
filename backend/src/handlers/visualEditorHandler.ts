import { t } from 'elysia';
import { authenticate } from '../middleware/auth';
import { isFeatureEnabled } from '../utils/featureToggles';
import {
  BLOCK_DEFINITIONS,
  CATEGORIES,
  generateCode,
  getBlockDefinition,
  validateProject,
  createBlueprint,
  updateBlueprint,
  deleteBlueprint,
  getBlueprint,
  getUserBlueprints,
  createLibraryItem,
  deleteLibraryItem,
  getUserLibraryItems,
  exportBlueprintAsZip,
} from '../services/visualEditorService';

const genQueues = new Map<string, Promise<void>>();

async function enqueueGenerate(userId: number | string, fn: () => Promise<any>) {
  const key = String(userId);
  const prev = genQueues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  genQueues.set(key, next.catch(() => {}));
  return next;
}

async function guard(ctx: any) {
  const enabled = await isFeatureEnabled('visualeditor');
  if (!enabled) {
    ctx.set.status = 503;
    return { error: 'Visual Editor feature is disabled' };
  }
}

export async function visualEditorRoutes(app: any, prefix = '') {

  app.get(
    prefix + '/infrastructure/visual-editor/block-definitions',
    async () => {
      return {
        categories: CATEGORIES,
        blocks: BLOCK_DEFINITIONS,
      };
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Get visual editor block definitions' },
    }
  );

  app.get(
    prefix + '/infrastructure/visual-editor/block-definitions/:type',
    async (ctx: any) => {
      const def = getBlockDefinition(ctx.params?.type);
      if (!def) {
        ctx.set.status = 404;
        return { error: 'Block definition not found' };
      }
      return def;
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Get a single block definition' },
    }
  );

  app.post(
    prefix + '/infrastructure/visual-editor/generate',
    async (ctx: any) => {
      const body = ctx.body as any;
      if (!body?.blocks || !Array.isArray(body.blocks)) {
        ctx.set.status = 400;
        return { error: 'Blocks array is required' };
      }
      return enqueueGenerate(ctx.user?.id || 0, async () => {
        const code = generateCode(body.blocks);
        return { code };
      });
    },
    {
      beforeHandle: [authenticate, guard],
      body: t.Object({
        blocks: t.Array(t.Any()),
      }),
      detail: { tags: ['Infrastructure'], summary: 'Generate Bun/TS code from visual blocks' },
    }
  );

  app.post(
    prefix + '/infrastructure/visual-editor/generate-multi',
    async (ctx: any) => {
      const body = ctx.body as any;
      if (!body?.files || !Array.isArray(body.files)) {
        ctx.set.status = 400;
        return { error: 'Files array is required' };
      }
      return enqueueGenerate(ctx.user?.id || 0, async () => {
        const files = body.files as { name: string; blocks: any[] }[];
        const result: { name: string; code: string }[] = [];
        for (const file of files) {
          const code = generateCode(Array.isArray(file.blocks) ? file.blocks : []);
          result.push({ name: file.name || 'untitled.ts', code });
        }
        return { files: result };
      });
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Generate Bun/TS code from multiple files' },
    }
  );

  app.post(
    prefix + '/infrastructure/visual-editor/validate',
    async (ctx: any) => {
      const body = ctx.body as any;
      if (!body?.files || !Array.isArray(body.files)) {
        ctx.set.status = 400;
        return { error: 'Files array is required' };
      }
      return validateProject(body.files);
    },
    {
      beforeHandle: [authenticate, guard],
      body: t.Object({
        files: t.Array(t.Any()),
      }),
      detail: { tags: ['Infrastructure'], summary: 'Validate visual editor project on the backend' },
    }
  );

  app.get(
    prefix + '/infrastructure/visual-editor/blueprints',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      if (!userId) {
        ctx.set.status = 401;
        return { error: 'Unauthorized' };
      }
      return getUserBlueprints(userId);
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'List user blueprints' },
    }
  );

  app.get(
    prefix + '/infrastructure/visual-editor/library',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      if (!userId) {
        ctx.set.status = 401;
        return { error: 'Unauthorized' };
      }
      return getUserLibraryItems(userId);
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'List user library items' },
    }
  );

  app.post(
    prefix + '/infrastructure/visual-editor/library',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      if (!userId) {
        ctx.set.status = 401;
        return { error: 'Unauthorized' };
      }
      const body = ctx.body as any;
      if (!body?.blocks || !Array.isArray(body.blocks)) {
        ctx.set.status = 400;
        return { error: 'Blocks array is required' };
      }
      try {
        const item = await createLibraryItem(
          userId,
          String(body.name ?? '').trim() || 'Snippet',
          body.blocks,
          body.description ? String(body.description).trim() : undefined
        );
        ctx.set.status = 201;
        return item;
      } catch (err: any) {
        ctx.set.status = 400;
        return { error: err.message || 'Failed to create library item' };
      }
    },
    {
      beforeHandle: [authenticate, guard],
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        blocks: t.Array(t.Any()),
      }),
      detail: { tags: ['Infrastructure'], summary: 'Create a library item' },
    }
  );

  app.delete(
    prefix + '/infrastructure/visual-editor/library/:id',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id || isNaN(id)) {
        ctx.set.status = 400;
        return { error: 'Invalid request' };
      }
      const deleted = await deleteLibraryItem(id, userId);
      if (!deleted) {
        ctx.set.status = 404;
        return { error: 'Library item not found' };
      }
      return { success: true };
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Delete a library item' },
    }
  );

  app.get(
    prefix + '/infrastructure/visual-editor/blueprints/:id',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id || isNaN(id)) {
        ctx.set.status = 400;
        return { error: 'Invalid request' };
      }
      const blueprint = await getBlueprint(id, userId);
      if (!blueprint) {
        ctx.set.status = 404;
        return { error: 'Blueprint not found' };
      }
      return blueprint;
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Get a blueprint' },
    }
  );

  app.post(
    prefix + '/infrastructure/visual-editor/blueprints',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      if (!userId) {
        ctx.set.status = 401;
        return { error: 'Unauthorized' };
      }
      const body = ctx.body as any;
      if (!body?.name || !body?.projectData) {
        ctx.set.status = 400;
        return { error: 'Name and project data required' };
      }
      try {
        const blueprint = await createBlueprint(
          userId,
          String(body.name).trim(),
          body.description ? String(body.description).trim() : undefined,
          body.projectData,
          body.latestGeneratedCode ? String(body.latestGeneratedCode) : undefined
        );
        ctx.set.status = 201;
        return blueprint;
      } catch (err: any) {
        ctx.set.status = 400;
        return { error: err.message || 'Failed to create blueprint' };
      }
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Create a blueprint' },
    }
  );

  app.put(
    prefix + '/infrastructure/visual-editor/blueprints/:id',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id || isNaN(id)) {
        ctx.set.status = 400;
        return { error: 'Invalid request' };
      }
      const body = ctx.body as any;
      const data: any = {};
      if (body.name !== undefined) data.name = String(body.name).trim();
      if (body.description !== undefined) data.description = String(body.description).trim();
      if (body.projectData !== undefined) data.projectData = body.projectData;
      if (body.latestGeneratedCode !== undefined) data.latestGeneratedCode = body.latestGeneratedCode;

      try {
        const blueprint = await updateBlueprint(id, userId, data);
        if (!blueprint) {
          ctx.set.status = 404;
          return { error: 'Blueprint not found' };
        }
        return blueprint;
      } catch (err: any) {
        ctx.set.status = 400;
        return { error: err.message || 'Failed to update blueprint' };
      }
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Update a blueprint' },
    }
  );

  app.delete(
    prefix + '/infrastructure/visual-editor/blueprints/:id',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id || isNaN(id)) {
        ctx.set.status = 400;
        return { error: 'Invalid request' };
      }
      const deleted = await deleteBlueprint(id, userId);
      if (!deleted) {
        ctx.set.status = 404;
        return { error: 'Blueprint not found' };
      }
      return { success: true };
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Delete a blueprint' },
    }
  );

  app.get(
    prefix + '/infrastructure/visual-editor/blueprints/:id/export',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id || isNaN(id)) {
        ctx.set.status = 400;
        return { error: 'Invalid request' };
      }
      const result = await exportBlueprintAsZip(id, userId);
      if (!result) {
        ctx.set.status = 404;
        return { error: 'Blueprint not found' };
      }
      ctx.set.headers['Content-Type'] = 'application/zip';
      ctx.set.headers['Content-Disposition'] = `attachment; filename="${result.name}"`;
      return new Response(new Uint8Array(result.data));
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Export a blueprint as ZIP' },
    }
  );

  app.get(
    prefix + '/infrastructure/visual-editor/library',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      if (!userId) { ctx.set.status = 401; return { error: 'Unauthorized' } }
      return getUserLibraryItems(userId);
    },
    { beforeHandle: [authenticate, guard], detail: { tags: ['Infrastructure'], summary: 'List user library items' } }
  );

  app.post(
    prefix + '/infrastructure/visual-editor/library',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      if (!userId) { ctx.set.status = 401; return { error: 'Unauthorized' } }
      const body = ctx.body as any;
      if (!body?.name || !body?.blocks) { ctx.set.status = 400; return { error: 'Name and blocks required' } }
      try {
        const item = await createLibraryItem(userId, String(body.name).trim(), body.blocks, body.description ? String(body.description) : undefined);
        ctx.set.status = 201;
        return item;
      } catch (err: any) {
        ctx.set.status = 400;
        return { error: err.message || 'Failed to save library item' };
      }
    },
    { beforeHandle: [authenticate, guard], detail: { tags: ['Infrastructure'], summary: 'Create a library item' } }
  );

  app.delete(
    prefix + '/infrastructure/visual-editor/library/:id',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id || isNaN(id)) { ctx.set.status = 400; return { error: 'Invalid request' } }
      const deleted = await deleteLibraryItem(id, userId);
      if (!deleted) { ctx.set.status = 404; return { error: 'Library item not found' } }
      return { success: true };
    },
    { beforeHandle: [authenticate, guard], detail: { tags: ['Infrastructure'], summary: 'Delete a library item' } }
  );
}