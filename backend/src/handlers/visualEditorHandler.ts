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
  type Block,
  type ProjectFile,
} from '../services/visualEditorService';

const genQueues = new Map<string, Promise<void>>();

async function enqueueGenerate<T>(userId: number | string, fn: () => Promise<T>): Promise<T> {
  const key = String(userId);
  const prev = genQueues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  genQueues.set(key, next.then(() => {}, () => {}));
  return next;
}

async function guard(ctx: { set: { status: number }; t: (k: string) => string }) {
  const enabled = await isFeatureEnabled('visualeditor');
  if (!enabled) {
    ctx.set.status = 503;
    return { error: ctx.t('visualEditor.visual_editor_feature_is_disabled') };
  }
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parsePagination(query: { page?: string; limit?: string }): { skip: number; take: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE));
  return { skip: (page - 1) * limit, take: limit };
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
        return { error: ctx.t('visualEditor.block_definition_not_found') };
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
      const body = ctx.body as { blocks: Block[] };
      if (!body?.blocks || !Array.isArray(body.blocks)) {
        ctx.set.status = 400;
        return { error: ctx.t('visualEditor.blocks_array_is_required') };
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
      const body = ctx.body as { files: { name: string; blocks: Block[] }[] };
      if (!body?.files || !Array.isArray(body.files)) {
        ctx.set.status = 400;
        return { error: ctx.t('visualEditor.files_array_is_required') };
      }
      return enqueueGenerate(ctx.user?.id || 0, async () => {
        const result: { name: string; code: string }[] = [];
        for (const file of body.files) {
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
      const body = ctx.body as { files: ProjectFile[] };
      if (!body?.files || !Array.isArray(body.files)) {
        ctx.set.status = 400;
        return { error: ctx.t('visualEditor.files_array_is_required') };
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
        return { error: ctx.t('visualEditor.unauthorized') };
      }
      const { skip, take } = parsePagination(ctx.query || {});
      return getUserBlueprints(userId, skip, take);
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
        return { error: ctx.t('visualEditor.unauthorized') };
      }
      const { skip, take } = parsePagination(ctx.query || {});
      return getUserLibraryItems(userId, skip, take);
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
        return { error: ctx.t('visualEditor.unauthorized') };
      }
      const body = ctx.body as { name?: string; blocks: Block[]; description?: string };
      if (!body?.blocks || !Array.isArray(body.blocks)) {
        ctx.set.status = 400;
        return { error: ctx.t('visualEditor.blocks_array_is_required') };
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
      } catch (err: unknown) {
        ctx.set.status = 400;
        return { error: err instanceof Error ? err.message : 'Failed to create library item' };
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
        return { error: ctx.t('visualEditor.invalid_request') };
      }
      const deleted = await deleteLibraryItem(id, userId);
      if (!deleted) {
        ctx.set.status = 404;
        return { error: ctx.t('visualEditor.library_item_not_found') };
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
        return { error: ctx.t('visualEditor.invalid_request') };
      }
      const blueprint = await getBlueprint(id, userId);
      if (!blueprint) {
        ctx.set.status = 404;
        return { error: ctx.t('visualEditor.blueprint_not_found') };
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
        return { error: ctx.t('visualEditor.unauthorized') };
      }
      const body = ctx.body as { name: string; description?: string; projectData: unknown; latestGeneratedCode?: string };
      if (!body?.name || !body?.projectData) {
        ctx.set.status = 400;
        return { error: ctx.t('visualEditor.name_and_project_data_required') };
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
      } catch (err: unknown) {
        ctx.set.status = 400;
        return { error: err instanceof Error ? err.message : 'Failed to create blueprint' };
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
        return { error: ctx.t('visualEditor.invalid_request') };
      }
      const body = ctx.body as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = String(body.name).trim();
      if (body.description !== undefined) data.description = String(body.description).trim();
      if (body.projectData !== undefined) data.projectData = body.projectData;
      if (body.latestGeneratedCode !== undefined) data.latestGeneratedCode = body.latestGeneratedCode;

      try {
        const blueprint = await updateBlueprint(id, userId, data);
        if (!blueprint) {
          ctx.set.status = 404;
          return { error: ctx.t('visualEditor.blueprint_not_found') };
        }
        return blueprint;
      } catch (err: unknown) {
        ctx.set.status = 400;
        return { error: err instanceof Error ? err.message : 'Failed to update blueprint' };
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
        return { error: ctx.t('visualEditor.invalid_request') };
      }
      const deleted = await deleteBlueprint(id, userId);
      if (!deleted) {
        ctx.set.status = 404;
        return { error: ctx.t('visualEditor.blueprint_not_found') };
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
        return { error: ctx.t('visualEditor.invalid_request') };
      }
      const result = await exportBlueprintAsZip(id, userId);
      if (!result) {
        ctx.set.status = 404;
        return { error: ctx.t('visualEditor.blueprint_not_found') };
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
}