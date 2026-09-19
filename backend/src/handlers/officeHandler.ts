import { t } from 'elysia';
import path from 'path';
import fs from 'fs';
import { In, IsNull } from 'typeorm';
import { AppDataSource } from '../config/typeorm';
import { OfficeDocument } from '../models/officeDocument.entity';
import { OfficeShare } from '../models/officeShare.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { verifyAnyToken } from '../utils/pqJwt';
import {
  getRoom,
  getOrCreateRoom,
  joinRoom,
  leaveRoom,
  applyIncomingUpdate,
  setRoomAwareness,
  roomStatePayload,
  loadDocContent,
  persistDocContent,
  officeContentPath,
  officeThumbnailPath,
} from '../services/officeSyncService';
import {
  getOrProvisionStorage,
  writeStorageBlob,
  downloadStorageBlob,
  readStorageBlob,
  deleteStoragePrefix,
} from '../services/cloudStorageService';

type Permission = 'view' | 'comment' | 'edit';
type Role = Permission | 'owner';

function publicDocMeta(doc: OfficeDocument, role: Role) {
  return {
    id: doc.id,
    type: doc.type,
    name: doc.name,
    description: doc.description,
    ownerId: doc.userId,
    orgId: doc.orgId,
    role,
    isStarred: doc.isStarred,
    folder: doc.folder,
    thumbnailUrl: doc.thumbnailUrl,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function publicDoc(doc: OfficeDocument, role: Role) {
  let content: unknown = null;
  try {
    content = await loadDocContent(doc);
  } catch { /* amogus */ }
  const hasState = doc.cloudStored || Boolean(doc.yjsState);
  return { ...publicDocMeta(doc, role), content, hasCollabState: hasState };
}

async function resolveOffice(ctx: any, docId: number): Promise<{ doc: OfficeDocument; role: Role } | { error: string }> {
  const repo = AppDataSource.getRepository(OfficeDocument);
  const doc = await repo.findOneBy({ id: docId });
  if (!doc) {
    ctx.set.status = 404;
    return { error: ctx.t('office.documentNotFound') };
  }
  if (doc.userId === ctx.user.id) {
    return { doc, role: 'owner' };
  }
  const shareRepo = AppDataSource.getRepository(OfficeShare);
  const share = await shareRepo.findOneBy({ documentId: docId, userId: ctx.user.id });
  if (share) {
    return { doc, role: (share.permission || 'view') as Role };
  }
  ctx.set.status = 403;
  return { error: ctx.t('office.noAccess') };
}

function canEdit(role: Role): boolean {
  return role === 'owner' || role === 'edit';
}

function defaultName(type: string): string {
  const stamp = new Date().toLocaleDateString('en-GB');
  if (type === 'spreadsheet') return `Untitled spreadsheet ${stamp}`;
  if (type === 'presentation') return `Untitled presentation ${stamp}`;
  if (type === 'notebook') return `Untitled notebook ${stamp}`;
  return `Untitled document ${stamp}`;
}

function backendBaseFor(ctx: any): string {
  return (
    (process.env.BACKEND_URL || '').replace(/\/+$/, '') ||
    (() => {
      const proto = (ctx.request?.headers?.get?.('x-forwarded-proto') || 'https') as string;
      const host = (ctx.request?.headers?.get?.('host') || 'localhost') as string;
      return `${proto}://${host}`;
    })()
  );
}

export function officeRoutes(app: any, prefix = '') {
  app.get(
    prefix + '/office',
    async (ctx: any) => {
      const query = (ctx.query || {}) as any;
      const type = String(query.type || '');
      const folder = query.folder === undefined ? undefined : String(query.folder);
      const trashed = String(query.trashed || '') === 'true';
      const search = String(query.search || '').trim().toLowerCase();
      const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
      const offset = Math.max(Number(query.offset) || 0, 0);

      const docRepo = AppDataSource.getRepository(OfficeDocument);
      const ownDocs = await docRepo.find({
        where: {
          userId: ctx.user.id,
          ...(type ? { type: type as any } : {}),
          ...(trashed ? { isTrashed: true } : { isTrashed: false }),
          ...(folder !== undefined ? { folder: folder === '' ? IsNull() : folder } : {}),
        },
        order: { updatedAt: 'DESC' },
        take: limit,
        skip: offset,
      });

      const shareRepo = AppDataSource.getRepository(OfficeShare);
      const shares = await shareRepo.find({ where: { userId: ctx.user.id }, order: { createdAt: 'DESC' } });
      let sharedDocs: OfficeDocument[] = [];
      if (shares.length > 0) {
        sharedDocs = await docRepo.find({
          where: { id: In(shares.map((s) => s.documentId)), isTrashed: false },
          order: { updatedAt: 'DESC' },
        });
      }

      let docs = [...ownDocs, ...sharedDocs];
      const seen = new Set<number>();
      docs = docs.filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });

      if (search) {
        docs = docs.filter(
          (d) => d.name.toLowerCase().includes(search) || (d.description || '').toLowerCase().includes(search)
        );
      }

      const roleFor = (doc: OfficeDocument): Role => {
        if (doc.userId === ctx.user.id) return 'owner';
        const share = shares.find((s) => s.documentId === doc.id);
        return ((share?.permission as Permission) || 'view');
      };

      return await Promise.all(
        docs.map(async (d) => ({ ...(await publicDoc(d, roleFor(d))), shared: d.userId !== ctx.user.id }))
      );
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'List office documents (owned + shared)' },
    }
  );

  app.post(
    prefix + '/office',
    async (ctx: any) => {
      const body = (ctx.body || {}) as any;
      const type = String(body.type || 'document');
      if (!['document', 'spreadsheet', 'presentation', 'notebook'].includes(type)) {
        ctx.set.status = 400;
        return { error: ctx.t('office.invalidType') };
      }
      const name = String(body.name || '').trim() || defaultName(type);
      const orgId = body.orgId ? Number(body.orgId) : null;

      const repo = AppDataSource.getRepository(OfficeDocument);
      const doc = repo.create({
        userId: ctx.user.id,
        orgId,
        type: type as OfficeDocument['type'],
        name: name.slice(0, 255),
        description: body.description ? String(body.description).slice(0, 2000) : null,
        content: null,
        yjsState: null,
        cloudStored: false,
      });
      await repo.save(doc);
      void getOrProvisionStorage(ctx.user.id).catch((e: unknown) =>
        console.warn('[office] storage provisioning deferred:', (e as Error)?.message || e)
      );
      ctx.set.status = 201;
      return publicDoc(doc, 'owner');
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Create an office document' },
    }
  );

  app.get(
    prefix + '/office/:id',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      return publicDoc(resolved.doc, resolved.role);
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Get a single office document' },
    }
  );

  app.patch(
    prefix + '/office/:id',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      const { doc, role } = resolved;
      if (role !== 'owner') {
        ctx.set.status = 403;
        return { error: ctx.t('office.metadataOwnerOnly') };
      }
      const body = (ctx.body || {}) as any;
      if (body.name !== undefined) doc.name = String(body.name).slice(0, 255);
      if (body.description !== undefined) doc.description = body.description ? String(body.description).slice(0, 2000) : null;
      if (body.folder !== undefined) doc.folder = body.folder ? String(body.folder).slice(0, 64) : null;
      if (body.isStarred !== undefined) doc.isStarred = Boolean(body.isStarred);
      if (body.thumbnailUrl !== undefined) doc.thumbnailUrl = body.thumbnailUrl ? String(body.thumbnailUrl) : null;
      if (body.orgId !== undefined) doc.orgId = body.orgId ? Number(body.orgId) : null;
      await AppDataSource.getRepository(OfficeDocument).save(doc);
      return publicDoc(doc, role);
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Update office document metadata' },
    }
  );

  app.put(
    prefix + '/office/:id/content',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      const { doc, role } = resolved;
      if (!canEdit(role)) {
        ctx.set.status = 403;
        return { error: ctx.t('office.readOnly') };
      }
      const body = (ctx.body || {}) as any;
      const repo = AppDataSource.getRepository(OfficeDocument);
      let stored = false;
      let cloudError: unknown = null;

      try {
        const writes: Promise<unknown>[] = [];
        if (body.content !== undefined && body.content !== null) {
          writes.push(persistDocContent(docId, doc.userId, body.content));
        }
        if (body.yjsState !== undefined && body.yjsState !== null) {
          writes.push(writeStorageBlob(doc.userId, `office/${docId}/state`, String(body.yjsState)));
        }
        if (body.thumbnail !== undefined && body.thumbnail !== null) {
          writes.push(writeStorageBlob(doc.userId, officeThumbnailPath(docId), String(body.thumbnail)));
        }
        if (writes.length > 0) await Promise.all(writes);
        stored = true;
      } catch (e: unknown) {
        cloudError = e;
      }

      if (stored) {
        const partial: Partial<OfficeDocument> = { cloudStored: true };
        if (body.content !== undefined) partial.content = null;
        if (body.yjsState !== undefined) partial.yjsState = null;
        await repo.save({ id: docId, ...partial });
      } else {
        if (body.content !== undefined && body.content !== null) {
          doc.content = typeof body.content === 'string' ? body.content : JSON.stringify(body.content);
        }
        if (body.yjsState !== undefined && body.yjsState !== null) {
          doc.yjsState = String(body.yjsState);
        }
        if (body.thumbnail !== undefined && body.thumbnail !== null) {
          doc.thumbnailUrl = body.thumbnail ? String(body.thumbnail) : doc.thumbnailUrl;
        }
        await repo.save(doc);
        if (cloudError) {
          console.warn('[office] content save fell back to DB:', cloudError);
        }
      }
      return { ok: true, updatedAt: doc.updatedAt, hasCollabState: stored || Boolean(doc.yjsState) };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Save editor content snapshot + collab state' },
    }
  );

  app.get(
    prefix + '/office/:id/thumbnail',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      const { doc } = resolved;
      try {
        const bytes = await downloadStorageBlob(doc.userId, officeThumbnailPath(docId));
        if (bytes) {
          ctx.set.headers = {
            'Content-Type': 'image/png',
            'Cache-Control': 'private, max-age=3600',
          };
          ctx.set.status = 200;
          return new Response(bytes as unknown as BodyInit);
        }
      } catch {}
      const legacyUrl = doc.thumbnailUrl;
      if (legacyUrl && legacyUrl.includes('/uploads/office/')) {
        const filePath = path.join(process.cwd(), legacyUrl.replace(/^https?:\/\/[^/]+/, ''));
        try {
          const buf = await fs.promises.readFile(filePath);
          ctx.set.headers = { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' };
          ctx.set.status = 200;
          return new Response(buf);
        } catch {}
      }
      ctx.set.status = 404;
      return { error: ctx.t('office.thumbnailNotFound') };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Stream document thumbnail from cloud storage' },
    }
  );

  app.post(
    prefix + '/office/:id/duplicate',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      const { doc } = resolved;
      const repo = AppDataSource.getRepository(OfficeDocument);
      const copy = repo.create({
        userId: ctx.user.id,
        orgId: doc.orgId,
        type: doc.type,
        name: `${doc.name} (Copy)`,
        description: doc.description,
        content: null,
        yjsState: null,
        folder: doc.folder,
        cloudStored: false,
      });
      await repo.save(copy);
      try {
        const content = await loadDocContent(doc);
        if (content != null) await persistDocContent(copy.id, copy.userId, content);
        const state = await readStorageBlob(doc.userId, `office/${doc.id}/state`);
        if (state != null) {
          await writeStorageBlob(copy.userId, `office/${copy.id}/state`, state);
        }
        const thumb = await downloadStorageBlob(doc.userId, officeThumbnailPath(doc.id));
        if (thumb) {
          await writeStorageBlob(copy.userId, officeThumbnailPath(copy.id), thumb);
          copy.thumbnailUrl = `${backendBaseFor(ctx)}/api/office/${copy.id}/thumbnail`;
        }
        if (content != null || state != null || thumb) copy.cloudStored = true;
        await repo.save(copy);
      } catch (e: unknown) {
        console.warn('[office] duplicate cloud copy failed, DB-only:', (e as Error)?.message || e);
      }
      ctx.set.status = 201;
      return publicDoc(copy, 'owner');
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Duplicate an office document' },
    }
  );

  app.post(
    prefix + '/office/:id/trash',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      if (!canEdit(resolved.role)) {
        ctx.set.status = 403;
        return { error: ctx.t('office.readOnly') };
      }
      resolved.doc.isTrashed = true;
      resolved.doc.trashedAt = new Date();
      await AppDataSource.getRepository(OfficeDocument).save(resolved.doc);
      return { ok: true, id: docId };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Move office document to trash' },
    }
  );

  app.post(
    prefix + '/office/:id/restore',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      if (!canEdit(resolved.role)) {
        ctx.set.status = 403;
        return { error: ctx.t('office.readOnly') };
      }
      resolved.doc.isTrashed = false;
      resolved.doc.trashedAt = null;
      await AppDataSource.getRepository(OfficeDocument).save(resolved.doc);
      return { ok: true, id: docId };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Restore office document from trash' },
    }
  );

  app.delete(
    prefix + '/office/:id',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      if (resolved.role !== 'owner') {
        ctx.set.status = 403;
        return { error: ctx.t('office.metadataOwnerOnly') };
      }
      await AppDataSource.getRepository(OfficeDocument).remove(resolved.doc);
      await AppDataSource.getRepository(OfficeShare).delete({ documentId: docId });
      try {
        await deleteStoragePrefix(resolved.doc.userId, `office/${docId}`);
      } catch (e: any) {
        console.warn(`[office] storage cleanup failed for doc ${docId}:`, e?.message || e);
      }
      return { ok: true, id: docId };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Permanently delete an office document' },
    }
  );

  app.get(
    prefix + '/office/:id/shares',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      if (resolved.role !== 'owner') {
        ctx.set.status = 403;
        return { error: ctx.t('office.metadataOwnerOnly') };
      }
      const shares = await AppDataSource.getRepository(OfficeShare).find({
        where: { documentId: docId },
        order: { createdAt: 'ASC' },
      });
      const users = shares.length
        ? await AppDataSource.getRepository(User).find({
            where: { id: In(shares.map((s) => s.userId)) },
            select: { id: true, displayName: true, firstName: true, lastName: true, email: true, avatarUrl: true },
          })
        : [];
      return shares.map((s) => ({
        id: s.id,
        userId: s.userId,
        permission: s.permission,
        createdAt: s.createdAt,
        user: users.find((u) => u.id === s.userId) || null,
      }));
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'List shares for an office document' },
    }
  );

  app.post(
    prefix + '/office/:id/shares',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      if (resolved.role !== 'owner') {
        ctx.set.status = 403;
        return { error: ctx.t('office.metadataOwnerOnly') };
      }
      const body = (ctx.body || {}) as any;
      const permission = (['view', 'comment', 'edit'].includes(body.permission) ? body.permission : 'view') as Permission;
      let userId = body.userId ? Number(body.userId) : null;
      if (!userId && body.email) {
        const user = await AppDataSource.getRepository(User).findOneBy({
          email: String(body.email).toLowerCase(),
        });
        if (user) userId = user.id;
      }
      if (!userId) {
        ctx.set.status = 400;
        return { error: ctx.t('office.userNotFound') };
      }
      if (userId === ctx.user.id) {
        ctx.set.status = 400;
        return { error: ctx.t('office.cannotShareToSelf') };
      }
      const shareRepo = AppDataSource.getRepository(OfficeShare);
      let share = await shareRepo.findOneBy({ documentId: docId, userId });
      if (share) {
        share.permission = permission;
        await shareRepo.save(share);
      } else {
        share = shareRepo.create({ documentId: docId, userId, permission });
        await shareRepo.save(share);
        ctx.set.status = 201;
      }
      return { id: share.id, documentId: docId, userId, permission };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Share an office document with a user' },
    }
  );

  app.delete(
    prefix + '/office/:id/shares/:shareId',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      if (resolved.role !== 'owner') {
        ctx.set.status = 403;
        return { error: ctx.t('office.metadataOwnerOnly') };
      }
      const shareRepo = AppDataSource.getRepository(OfficeShare);
      const share = await shareRepo.findOneBy({ id: Number(ctx.params.shareId), documentId: docId });
      if (!share) {
        ctx.set.status = 404;
        return { error: ctx.t('office.shareNotFound') };
      }
      await shareRepo.remove(share);
      return { ok: true };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Remove a share from an office document' },
    }
  );

  app.post(
    prefix + '/office/:id/thumbnail',
    async (ctx: any) => {
      const docId = Number(ctx.params.id);
      const resolved = await resolveOffice(ctx, docId);
      if ('error' in resolved) return resolved;
      if (!canEdit(resolved.role)) {
        ctx.set.status = 403;
        return { error: ctx.t('office.readOnly') };
      }
      const { file } = (ctx.body || {}) as any;
      const uploadFile = Array.isArray(file) ? file[0] : file;
      if (!uploadFile) {
        ctx.set.status = 400;
        return { error: ctx.t('office.noFileProvided') };
      }
      const mime = (uploadFile.type || uploadFile.mimetype || '').toString();
      const allowed = ['image/png', 'image/jpeg', 'image/webp'];
      if (!allowed.includes(mime)) {
        ctx.set.status = 400;
        return { error: ctx.t('office.invalidImageType') };
      }
      const ab = await uploadFile.arrayBuffer();
      if (ab.byteLength > 5 * 1024 * 1024) {
        ctx.set.status = 400;
        return { error: ctx.t('office.imageTooLarge') };
      }
      const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
      const bytes = Buffer.from(ab);

      let url: string;
      try {
        await writeStorageBlob(resolved.doc.userId, officeThumbnailPath(docId), bytes);
        const backendBase = backendBaseFor(ctx);
        url = `${backendBase}/api/office/${docId}/thumbnail`;
      } catch (e: unknown) {
        console.warn('[office] thumbnail cloud write failed, local fallback:', (e as Error)?.message || e);
        const filename = `office_${docId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        const uploadDir = path.join(process.cwd(), 'uploads', 'office');
        await fs.promises.mkdir(uploadDir, { recursive: true });
        await Bun.write(path.join(uploadDir, filename), bytes);
        const backendBase = backendBaseFor(ctx);
        url = `${backendBase}/uploads/office/${filename}`;
      }

      resolved.doc.thumbnailUrl = url;
      await AppDataSource.getRepository(OfficeDocument).save(resolved.doc);
      return { url: resolved.doc.thumbnailUrl };
    },
    {
      body: t.Object({ file: t.File() }),
      beforeHandle: [authenticate],
      detail: { tags: ['Office'], summary: 'Upload an office document thumbnail' },
    }
  );

  app.ws(prefix + '/ws/office', {
    open(ws: any) {
      let userId = 0;
      try {
        const cookieName = process.env.JWT_COOKIE_NAME || 'token';
        const cookie = ws.request?.headers?.get?.('cookie') || '';
        const parts = String(cookie).split(';').map((s: string) => s.trim());
        const pair = parts.find((p) => p.startsWith(cookieName + '='));
        if (pair) {
          const decoded = verifyAnyToken(pair.split('=')[1]) as any;
          if (decoded?.userId) userId = Number(decoded.userId) || 0;
        }
      } catch {}
      ws.data.officeDocs = new Map<number, string>();
      ws.data.officeUserId = userId;
      try {
        ws.send(JSON.stringify({ type: 'connected', ts: Date.now() }));
      } catch {}
    },
    message(ws: any, message: any) {
      void handleOfficeSocketMessage(ws, message);
    },
    close(ws: any) {
      for (const [docId] of ws.data?.officeDocs || []) {
        const room = getRoom(docId);
        if (room) leaveRoom(room, ws);
      }
      try {
        ws.data?.officeDocs?.clear?.();
      } catch {}
    },
    error(ws: any) {
      for (const [docId] of ws.data?.officeDocs || []) {
        const room = getRoom(docId);
        if (room) leaveRoom(room, ws);
      }
      try {
        ws.data?.officeDocs?.clear?.();
      } catch {}
    },
  });
}

async function handleOfficeSocketMessage(ws: any, message: any): Promise<void> {
  try {
    const dataRaw: any = typeof message === 'string' ? message : Buffer.isBuffer(message) || message instanceof Uint8Array
      ? Buffer.from(message as Uint8Array).toString('utf8')
      : message;
    const data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
    const userId = ws.data?.officeUserId || 0;
    if (!userId) {
      try {
        ws.send(JSON.stringify({ type: 'error', message: 'unauthorized' }));
      } catch {}
      return;
    }

    if (data.type === 'subscribe' && data.docId) {
      const docId = Number(data.docId);
      const repo = AppDataSource.getRepository(OfficeDocument);
      const doc = await repo.findOneBy({ id: docId });
      if (!doc) {
        try {
          ws.send(JSON.stringify({ type: 'error', docId, message: 'documentNotFound' }));
        } catch {}
        return;
      }
      let permission: string = 'view';
      if (doc.userId === userId) {
        permission = 'edit';
      } else {
        const share = await AppDataSource.getRepository(OfficeShare).findOneBy({ documentId: docId, userId });
        if (!share) {
          try {
            ws.send(JSON.stringify({ type: 'error', docId, message: 'forbidden' }));
          } catch {}
          return;
        }
        permission = share.permission || 'view';
      }

      const room = await getOrCreateRoom(doc);
      joinRoom(room, ws, userId, permission);
      ws.data.officeDocs.set(docId, permission);

      try {
        ws.send(
          JSON.stringify({
            type: 'sync',
            docId,
            state: roomStatePayload(room),
            awareness: room.awareness,
            permission,
            participants: room.sockets.size,
          })
        );
      } catch {}
      return;
    }

    const docId = data.docId ? Number(data.docId) : null;
    const permission = docId ? ws.data?.officeDocs?.get(docId) : null;
    if (!docId || !permission) return;
    const room = getRoom(docId);
    if (!room) return;

    if (data.type === 'unsubscribe') {
      ws.data.officeDocs.delete(docId);
      leaveRoom(room, ws);
      return;
    }

    if (data.type === 'update' && data.update && permission !== 'view') {
      applyIncomingUpdate(room, String(data.update));
      const payload = JSON.stringify({ type: 'update', docId, update: String(data.update), from: userId });
      for (const [sock] of room.sockets) {
        if (sock !== ws) {
          try {
            sock.send(payload);
          } catch {}
        }
      }
      return;
    }

    if (data.type === 'awareness' && data.awareness) {
      setRoomAwareness(room, String(data.awareness));
      const payload = JSON.stringify({ type: 'awareness', docId, awareness: String(data.awareness), from: userId });
      for (const [sock] of room.sockets) {
        if (sock !== ws) {
          try {
            sock.send(payload);
          } catch {}
        }
      }
      return;
    }
  } catch {}
}