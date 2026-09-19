import { t } from 'elysia';
import prettier from 'prettier';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { isFeatureEnabled } from '../utils/featureToggles';
import {
  BLOCK_DEFINITIONS,
  CATEGORIES,
  generateCode,
  generateBlockCode,
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
  createCustomBlock,
  getUserCustomBlocks,
  updateCustomBlock,
  deleteCustomBlock,
  expandCustomBlockRefs,
  shareCustomBlock,
  unshareCustomBlock,
  browseSharedBlocks,
  downloadSharedBlock,
  updateSharedBlockTags,
  createBlockPack,
  deleteBlockPack,
  browseBlockPacks,
  getUserBlockPacks,
  downloadBlockPack,
  updateBlockPack,
  adminListSharedBlocks,
  adminDeleteSharedBlock,
  adminListBlockPacks,
  adminDeleteBlockPack,
  type Block,
  type ProjectFile,
  type BlockPackItem,
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

async function prettifyCode(code: string): Promise<string> {
  const trimmed = code.trim();
  if (!trimmed) return code;
  try {
    return await prettier.format(trimmed, { parser: 'babel', tabWidth: 2, singleQuote: true, arrowParens: 'always' });
  } catch {
    return code;
  }
}

async function getCustomBlockResolver(userId: number): Promise<Map<number, { code: string; settingsDefinition?: import('../services/visualEditorService').SettingDef[] }>> {
  const resolver = new Map<number, { code: string; settingsDefinition?: import('../services/visualEditorService').SettingDef[] }>();
  if (!userId) return resolver;
  try {
    const items = await getUserCustomBlocks(userId, 0, 200);
    for (const item of items) resolver.set(item.id, { code: item.code, settingsDefinition: item.settingsDefinition });
  } catch {
    // wowwwww
  }
  return resolver;
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
        const resolver = await getCustomBlockResolver(ctx.user?.id || 0);
        const code = await prettifyCode(generateCode(expandCustomBlockRefs(body.blocks, resolver)));
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
    prefix + '/infrastructure/visual-editor/block-code',
    async (ctx: any) => {
      const body = ctx.body as { block: Block };
      if (!body?.block || typeof body.block !== 'object') {
        ctx.set.status = 400;
        return { error: ctx.t('visualEditor.block_required') };
      }
      return enqueueGenerate(ctx.user?.id || 0, async () => {
        const resolver = await getCustomBlockResolver(ctx.user?.id || 0);
        const code = await prettifyCode(generateBlockCode(expandCustomBlockRefs([body.block], resolver)[0]));
        return { code };
      });
    },
    {
      beforeHandle: [authenticate, guard],
      body: t.Object({
        block: t.Any(),
      }),
      detail: { tags: ['Infrastructure'], summary: 'Generate Bun/TS code for a single block subtree' },
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
        const resolver = await getCustomBlockResolver(ctx.user?.id || 0);
        const result: { name: string; code: string }[] = [];
        for (const file of body.files) {
          const code = await prettifyCode(generateCode(expandCustomBlockRefs(Array.isArray(file.blocks) ? file.blocks : [], resolver)));
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
    prefix + '/infrastructure/visual-editor/custom-blocks',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      if (!userId) {
        ctx.set.status = 401;
        return { error: ctx.t('visualEditor.unauthorized') };
      }
      const { skip, take } = parsePagination(ctx.query || {});
      return getUserCustomBlocks(userId, skip, Math.min(Math.max(take, 1), 200));
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'List user custom blocks' },
    }
  );

  app.post(
    prefix + '/infrastructure/visual-editor/custom-blocks',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      if (!userId) {
        ctx.set.status = 401;
        return { error: ctx.t('visualEditor.unauthorized') };
      }
      const body = ctx.body as { name?: string; code?: string; blocks?: Block[]; description?: string; settingsDefinition?: import('../services/visualEditorService').SettingDef[] };
      try {
        const item = await createCustomBlock(
          userId,
          String(body.name ?? '').trim() || 'My Block',
          String(body.code ?? ''),
          Array.isArray(body.blocks) ? body.blocks : [],
          body.description ? String(body.description).trim() : undefined,
          Array.isArray(body.settingsDefinition) ? body.settingsDefinition : undefined
        );
        ctx.set.status = 201;
        return item;
      } catch (err: unknown) {
        ctx.set.status = 400;
        return { error: err instanceof Error ? err.message : 'Failed to create custom block' };
      }
    },
    {
      beforeHandle: [authenticate, guard],
      body: t.Object({
        name: t.Optional(t.String()),
        code: t.Optional(t.String()),
        description: t.Optional(t.String()),
        blocks: t.Optional(t.Array(t.Any())),
        settingsDefinition: t.Optional(t.Array(t.Any())),
      }),
      detail: { tags: ['Infrastructure'], summary: 'Create a user custom block' },
    }
  );

  app.patch(
    prefix + '/infrastructure/visual-editor/custom-blocks/:id',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id || isNaN(id)) {
        ctx.set.status = 400;
        return { error: ctx.t('visualEditor.invalid_request') };
      }
      const body = ctx.body as { name?: string; code?: string; blocks?: Block[]; description?: string; settingsDefinition?: import('../services/visualEditorService').SettingDef[] };
      const item = await updateCustomBlock(id, userId, body);
      if (!item) {
        ctx.set.status = 404;
        return { error: ctx.t('visualEditor.library_item_not_found') };
      }
      return item;
    },
    {
      beforeHandle: [authenticate, guard],
      body: t.Object({
        name: t.Optional(t.String()),
        code: t.Optional(t.String()),
        description: t.Optional(t.String()),
        blocks: t.Optional(t.Array(t.Any())),
        settingsDefinition: t.Optional(t.Array(t.Any())),
      }),
      detail: { tags: ['Infrastructure'], summary: 'Update a user custom block' },
    }
  );

  app.delete(
    prefix + '/infrastructure/visual-editor/custom-blocks/:id',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id || isNaN(id)) {
        ctx.set.status = 400;
        return { error: ctx.t('visualEditor.invalid_request') };
      }
      const deleted = await deleteCustomBlock(id, userId);
      if (!deleted) {
        ctx.set.status = 404;
        return { error: ctx.t('visualEditor.library_item_not_found') };
      }
      return { success: true };
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Delete a user custom block' },
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

  app.get(
    prefix + '/infrastructure/visual-editor/shared-blocks',
    async (ctx: any) => {
      const { skip, take } = parsePagination(ctx.query || {});
      const search = ctx.query?.search ? String(ctx.query.search) : undefined;
      const tag = ctx.query?.tag ? String(ctx.query.tag) : undefined;
      return browseSharedBlocks(skip, take, search, tag);
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Browse shared blocks in the public library' },
    }
  );

  app.post(
    prefix + '/infrastructure/visual-editor/shared-blocks',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      if (!userId) { ctx.set.status = 401; return { error: ctx.t('visualEditor.unauthorized') }; }
      const body = ctx.body as { customBlockId?: number };
      if (!body.customBlockId) { ctx.set.status = 400; return { error: 'customBlockId required' }; }
      try {
        const authorName = ctx.user?.firstName || ctx.user?.email || 'Anonymous';
        const item = await shareCustomBlock(userId, authorName, body.customBlockId);
        ctx.set.status = 201;
        return item;
      } catch (err: unknown) {
        ctx.set.status = 400;
        return { error: err instanceof Error ? err.message : 'Failed to share block' };
      }
    },
    {
      beforeHandle: [authenticate, guard],
      body: t.Object({ customBlockId: t.Number() }),
      detail: { tags: ['Infrastructure'], summary: 'Share a custom block to the public library' },
    }
  );

  app.delete(
    prefix + '/infrastructure/visual-editor/shared-blocks/:id',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id) { ctx.set.status = 400; return { error: ctx.t('visualEditor.invalid_request') }; }
      const ok = await unshareCustomBlock(id, userId);
      if (!ok) { ctx.set.status = 404; return { error: 'Not found' }; }
      return { success: true };
    },
    { beforeHandle: [authenticate, guard], detail: { tags: ['Infrastructure'], summary: 'Remove a shared block from the library' } }
  );

  app.post(
    prefix + '/infrastructure/visual-editor/shared-blocks/:id/download',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id) { ctx.set.status = 400; return { error: ctx.t('visualEditor.invalid_request') }; }
      try {
        const authorName = ctx.user?.firstName || ctx.user?.email || 'Anonymous';
        return await downloadSharedBlock(id, userId, authorName);
      } catch (err: unknown) {
        ctx.set.status = 400;
        return { error: err instanceof Error ? err.message : 'Failed to download block' };
      }
    },
    { beforeHandle: [authenticate, guard], detail: { tags: ['Infrastructure'], summary: 'Download (copy) a shared block to your custom blocks' } }
  );

  app.patch(
    prefix + '/infrastructure/visual-editor/shared-blocks/:id/tags',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id) { ctx.set.status = 400; return { error: ctx.t('visualEditor.invalid_request') }; }
      const body = ctx.body as { tags?: string[] };
      const item = await updateSharedBlockTags(id, userId, body.tags || []);
      if (!item) { ctx.set.status = 404; return { error: 'Not found' }; }
      return item;
    },
    {
      beforeHandle: [authenticate, guard],
      body: t.Object({ tags: t.Array(t.String()) }),
      detail: { tags: ['Infrastructure'], summary: 'Update tags on your shared block' },
    }
  );

  app.get(
    prefix + '/infrastructure/visual-editor/block-packs',
    async (ctx: any) => {
      const { skip, take } = parsePagination(ctx.query || {});
      const search = ctx.query?.search ? String(ctx.query.search) : undefined;
      const tag = ctx.query?.tag ? String(ctx.query.tag) : undefined;
      return browseBlockPacks(skip, take, search, tag);
    },
    {
      beforeHandle: [authenticate, guard],
      detail: { tags: ['Infrastructure'], summary: 'Browse block packs in the public library' },
    }
  );

  app.post(
    prefix + '/infrastructure/visual-editor/block-packs',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      if (!userId) { ctx.set.status = 401; return { error: ctx.t('visualEditor.unauthorized') }; }
      const body = ctx.body as { name?: string; description?: string; tags?: string[]; items?: BlockPackItem[]; isPublic?: boolean };
      if (!Array.isArray(body.items) || body.items.length === 0) {
        ctx.set.status = 400; return { error: 'Pack must contain at least one block' };
      }
      try {
        const authorName = ctx.user?.firstName || ctx.user?.email || 'Anonymous';
        const pack = await createBlockPack(
          userId, authorName,
          String(body.name || '').trim() || 'Untitled Pack',
          body.items,
          body.description ? String(body.description).trim() : undefined,
          body.tags,
          Boolean(body.isPublic),
        );
        ctx.set.status = 201;
        return pack;
      } catch (err: unknown) {
        ctx.set.status = 400;
        return { error: err instanceof Error ? err.message : 'Failed to create pack' };
      }
    },
    {
      beforeHandle: [authenticate, guard],
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
        items: t.Array(t.Any()),
        isPublic: t.Optional(t.Boolean()),
      }),
      detail: { tags: ['Infrastructure'], summary: 'Create a block pack from custom blocks' },
    }
  );

  app.patch(
    prefix + '/infrastructure/visual-editor/block-packs/:id',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id) { ctx.set.status = 400; return { error: ctx.t('visualEditor.invalid_request') }; }
      const body = ctx.body as { name?: string; description?: string; tags?: string[]; items?: BlockPackItem[]; isPublic?: boolean };
      const pack = await updateBlockPack(id, userId, body);
      if (!pack) { ctx.set.status = 404; return { error: 'Not found' }; }
      return pack;
    },
    {
      beforeHandle: [authenticate, guard],
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
        items: t.Optional(t.Array(t.Any())),
        isPublic: t.Optional(t.Boolean()),
      }),
      detail: { tags: ['Infrastructure'], summary: 'Update a block pack' },
    }
  );

  app.delete(
    prefix + '/infrastructure/visual-editor/block-packs/:id',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id) { ctx.set.status = 400; return { error: ctx.t('visualEditor.invalid_request') }; }
      const ok = await deleteBlockPack(id, userId);
      if (!ok) { ctx.set.status = 404; return { error: 'Not found' }; }
      return { success: true };
    },
    { beforeHandle: [authenticate, guard], detail: { tags: ['Infrastructure'], summary: 'Delete a block pack' } }
  );

  app.post(
    prefix + '/infrastructure/visual-editor/block-packs/:id/download',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      const id = Number(ctx.params?.id);
      if (!userId || !id) { ctx.set.status = 400; return { error: ctx.t('visualEditor.invalid_request') }; }
      try {
        const authorName = ctx.user?.firstName || ctx.user?.email || 'Anonymous';
        const created = await downloadBlockPack(id, userId, authorName);
        return { imported: created.length, blocks: created };
      } catch (err: unknown) {
        ctx.set.status = 400;
        return { error: err instanceof Error ? err.message : 'Failed to download pack' };
      }
    },
    { beforeHandle: [authenticate, guard], detail: { tags: ['Infrastructure'], summary: 'Download (copy) all blocks from a pack to your custom blocks' } }
  );

  app.get(
    prefix + '/infrastructure/visual-editor/user/block-packs',
    async (ctx: any) => {
      const userId = ctx.user?.id;
      if (!userId) { ctx.set.status = 401; return { error: ctx.t('visualEditor.unauthorized') }; }
      const { skip, take } = parsePagination(ctx.query || {});
      return getUserBlockPacks(userId, skip, take);
    },
    { beforeHandle: [authenticate, guard], detail: { tags: ['Infrastructure'], summary: 'List your own block packs (public + private)' } }
  );

  const adminGuard = [authenticate, authorize('admin:access')];

  app.get(
    prefix + '/infrastructure/visual-editor/admin/shared-blocks',
    async (ctx: any) => {
      const { skip, take } = parsePagination(ctx.query || {});
      const search = ctx.query?.search ? String(ctx.query.search) : undefined;
      return adminListSharedBlocks(skip, take, search);
    },
    { beforeHandle: adminGuard, detail: { tags: ['Admin'], summary: 'Admin: list all shared blocks' } }
  );

  app.delete(
    prefix + '/infrastructure/visual-editor/admin/shared-blocks/:id',
    async (ctx: any) => {
      const id = Number(ctx.params?.id);
      if (!id) { ctx.set.status = 400; return { error: 'Invalid id' }; }
      const ok = await adminDeleteSharedBlock(id);
      if (!ok) { ctx.set.status = 404; return { error: 'Not found' }; }
      return { success: true };
    },
    { beforeHandle: adminGuard, detail: { tags: ['Admin'], summary: 'Admin: remove a shared block' } }
  );

  app.get(
    prefix + '/infrastructure/visual-editor/admin/block-packs',
    async (ctx: any) => {
      const { skip, take } = parsePagination(ctx.query || {});
      const search = ctx.query?.search ? String(ctx.query.search) : undefined;
      return adminListBlockPacks(skip, take, search);
    },
    { beforeHandle: adminGuard, detail: { tags: ['Admin'], summary: 'Admin: list all block packs' } }
  );

  app.delete(
    prefix + '/infrastructure/visual-editor/admin/block-packs/:id',
    async (ctx: any) => {
      const id = Number(ctx.params?.id);
      if (!id) { ctx.set.status = 400; return { error: 'Invalid id' }; }
      const ok = await adminDeleteBlockPack(id);
      if (!ok) { ctx.set.status = 404; return { error: 'Not found' }; }
      return { success: true };
    },
    { beforeHandle: adminGuard, detail: { tags: ['Admin'], summary: 'Admin: remove a block pack' } }
  );
}