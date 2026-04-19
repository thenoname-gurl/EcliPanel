import { AppDataSource } from '../config/typeorm';
import { IDVerification } from '../models/idVerification.entity';
import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { User } from '../models/user.entity';
import { canPerformIdVerification } from '../utils/eu';
import { encryptBuffer } from '../utils/crypto';
import { encryptBufferWithWorker } from '../workers/cryptoWorker';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { t } from 'elysia';

function getSafeRelativeFilePath(base: string, relPath: string): string | null {
  const normalised = path.normalize(String(relPath || '')).replace(/^([/\\])+/, '').replace(/^(\.{2}(\/|\\|$))+/,'');
  const fullPath = path.join(base, normalised);
  const relative = path.relative(base, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return fullPath;
}

export async function idVerificationRoutes(app: any, prefix = '') {
  app.post(prefix + '/id-verification', async (ctx: any) => {
    const user = ctx.user as User;
    if (!(await canPerformIdVerification(user?.billingCountry))) {
      ctx.set.status = 403;
      return { error: 'ID verification is not available for your country under geo-block policy' };
    }

    const repo = AppDataSource.getRepository(IDVerification);

    const uploadDir = path.join(process.cwd(), 'uploads', 'id-docs');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    let idDocumentUrl: string | undefined;
    let selfieUrl: string | undefined;

    try {
      const { idDocument, selfie } = (ctx.body || {}) as any;
      const files = [
        { field: 'idDocument', item: Array.isArray(idDocument) ? idDocument[0] : idDocument },
        { field: 'selfie', item: Array.isArray(selfie) ? selfie[0] : selfie },
      ];

      for (const entry of files) {
        const uploadFile = entry.item;
        if (!uploadFile) continue;

        const safeExt = path.extname(uploadFile.name || uploadFile.filename || '').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 6) || '.bin';
        const filename = `${user.id}-${entry.field}-${Date.now()}${safeExt}`;
        const filepath = path.join(uploadDir, filename);

        const ab = await uploadFile.arrayBuffer();
        const buffer = Buffer.from(ab);
        const encrypted = await encryptBufferWithWorker(buffer).catch(() => encryptBuffer(buffer));
        fs.writeFileSync(filepath, encrypted);

        const url = `/uploads/id-docs/${filename}`;
        if (entry.field === 'idDocument') idDocumentUrl = url;
        if (entry.field === 'selfie') selfieUrl = url;
      }
    } catch (err: any) {
      ctx.log.error({ err: err?.message || err }, 'ID verification file upload failed');
      ctx.set.status = 400;
      return { error: 'Failed to process uploaded files: ' + (err?.message || 'unknown error') };
    }

    if (!idDocumentUrl || !selfieUrl) {
      ctx.set.status = 400;
      return { error: 'Both idDocument and selfie files are required' };
    }

    let record = repo.create({
      userId: user.id,
      status: 'pending',
      provider: 'manual',
      idDocumentUrl,
      selfieUrl,
    });
    record = await repo.save(record);
    return { success: true, record };
  }, {beforeHandle: authenticate,
    body: t.Any(),
    response: { 200: t.Object({ success: t.Boolean(), record: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'Submit ID verification', description: 'User submits scanned ID and selfie for manual review.', tags: ['Identity'] }
  });

  app.get(prefix + '/id-verification/:id', async (ctx: any) => {
    const userId = Number(ctx.params['id']);
    const requester = ctx.user;
    if (requester?.id !== userId && !hasPermissionSync(ctx, 'idverification:read')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const repo = AppDataSource.getRepository(IDVerification);
    const record = await repo.findOne({ where: { userId }, order: { id: 'DESC' } });
    if (!record) {
      ctx.set.status = 404;
      return { error: 'Not found' };
    }
    return JSON.parse(JSON.stringify(record));
  }, {beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Fetch latest ID verification for a user', tags: ['Identity'] }
  });

  app.put(prefix + '/id-verification/:id', async (ctx: any) => {
    const requester = ctx.user;
    if (!hasPermissionSync(ctx, 'idverification:write')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const repo = AppDataSource.getRepository(IDVerification);
    const rec = await repo.findOneBy({ id: Number(ctx.params['id']) });
    if (!rec) {
      ctx.set.status = 404;
      return { error: 'Not found' };
    }
    const { status } = ctx.body as any;
    if (!['pending', 'verified', 'failed'].includes(status)) {
      ctx.set.status = 400;
      return { error: 'Invalid status' };
    }
    rec.status = status;
    rec.verifiedAt = status === 'verified' ? new Date() : rec.verifiedAt;
    await repo.save(rec);
    try {
      const { sendMail } = require('../services/mailService');
      const user = await AppDataSource.getRepository(User).findOneBy({ id: rec.userId });
      if (user) {
        await sendMail({
          to: user.email,
          subject: 'ID verification status updated',
          template: 'verification',
          vars: { name: user.firstName, status: rec.status },
        });
      }
    } catch {}
    return { success: true, rec };
  }, {beforeHandle: authenticate,
    body: t.Object({ status: t.Enum({ pending: 'pending', verified: 'verified', failed: 'failed' }) }),
    response: { 200: t.Object({ success: t.Boolean(), rec: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Approve or reject an ID verification', tags: ['Identity'] }
  });

  app.delete(prefix + '/id-verification/:id', async (ctx: any) => {
    const requester = ctx.user;
    if (!hasPermissionSync(ctx, 'idverification:write')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    const repo = AppDataSource.getRepository(IDVerification);
    const rec = await repo.findOneBy({ id: Number(ctx.params['id']) });
    if (!rec) {
      ctx.set.status = 404;
      return { error: 'Not found' };
    }

    const uploadDir = process.cwd();
    for (const url of [rec.idDocumentUrl, rec.selfieUrl]) {
      if (url) {
        const filepath = getSafeRelativeFilePath(uploadDir, url);
        if (!filepath) continue;
        try { fs.unlinkSync(filepath); } catch {}
      }
    }

    await repo.remove(rec);
    return { success: true };
  }, {beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete an ID verification record', tags: ['Identity'] }
  });
}
