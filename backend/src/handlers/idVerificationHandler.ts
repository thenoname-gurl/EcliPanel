import { AppDataSource } from '../config/typeorm';
import { IDVerification } from '../models/idVerification.entity';
import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { User } from '../models/user.entity';
import { canPerformIdVerification } from '../utils/eu';
import { encryptBuffer, encryptBufferToString } from '../utils/crypto';
import path from 'path';
import fs from 'fs';
import { t } from 'elysia';

function getSafeRelativeFilePath(base: string, relPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(String(relPath || ''));
  } catch {
    return null;
  }
  const normalized = path.normalize(decoded).replace(/^[/\\]+/, '');
  const fullPath = path.join(base, normalized);
  const relative = path.relative(base, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return fullPath;
}

function pickUpload(value: any): any {
  return Array.isArray(value) ? value[0] : value;
}

function isUploadFile(value: any): boolean {
  return Boolean(value) && typeof value.arrayBuffer === 'function';
}

export async function idVerificationRoutes(app: any, prefix = '') {
  app.post(
    prefix + '/id-verification',
    async (ctx: any) => {
      const user = ctx.user as User;
      try {
        const ip = (ctx.ip || ctx.request?.ip || '').toString().slice(0, 200);
        const keyIp = `rate:kyc:ip:${ip}`;
        const keyUser = `rate:kyc:user:${user?.id}`;
        const rlIp = await require('../config/redis').consumeRateLimit(
          keyIp,
          Number(process.env.KYC_RATE_IP || 20),
          Number(process.env.KYC_WINDOW_IP || 3600)
        );
        if (!rlIp.allowed) {
          ctx.set.status = 429;
          ctx.set.headers = {
            ...(ctx.set.headers || {}),
            'Retry-After': String(rlIp.retryAfterSeconds),
          };
          return { error: 'rate_limited', retryAfter: rlIp.retryAfterSeconds };
        }
        const rlUser = await require('../config/redis').consumeRateLimit(
          keyUser,
          Number(process.env.KYC_RATE_USER || 3),
          Number(process.env.KYC_WINDOW_USER || 86400)
        );
        if (!rlUser.allowed) {
          ctx.set.status = 429;
          ctx.set.headers = {
            ...(ctx.set.headers || {}),
            'Retry-After': String(rlUser.retryAfterSeconds),
          };
          return { error: 'rate_limited', retryAfter: rlUser.retryAfterSeconds };
        }
      } catch (e) {}

      if (!(await canPerformIdVerification(user?.billingCountry))) {
        ctx.set.status = 403;
        return { error: ctx.t('user.geoBlocked') };
      }

      const repo = AppDataSource.getRepository(IDVerification);

      const uploadDir = path.join(process.cwd(), 'uploads', 'id-docs');
      if (Bun.file(uploadDir).size === 0) await fs.promises.mkdir(uploadDir, { recursive: true });

      let idDocumentUrl: string | undefined;
      let selfieUrl: string | undefined;

      try {
        const { idDocument, selfie } = (ctx.body || {}) as any;
        const idDocumentFile = pickUpload(idDocument);
        const selfieFile = pickUpload(selfie);

        if (!isUploadFile(idDocumentFile) || !isUploadFile(selfieFile)) {
          ctx.set.status = 400;
          return { error: ctx.t('validation.bothIDDocumentAndSelfieFilesAreRequired') };
        }

        const files = [
          { field: 'idDocument', item: idDocumentFile },
          { field: 'selfie', item: selfieFile },
        ];

        for (const entry of files) {
          const uploadFile = entry.item;

          const safeExt =
            path
              .extname(uploadFile.name || uploadFile.filename || '')
              .replace(/[^a-zA-Z0-9.]/g, '')
              .slice(0, 6) || '.bin';
          const filename = `${user.id}-${entry.field}-${Date.now()}${safeExt}`;
          const filepath = path.join(uploadDir, filename);

          const ab = await uploadFile.arrayBuffer();
          const buffer = Buffer.from(ab);
          if (buffer.length === 0) {
            ctx.set.status = 400;
            return { error: `${entry.field} must not be empty` };
          }
          const encrypted = encryptBufferToString(buffer);
          await Bun.write(filepath, encrypted);

          const url = `/uploads/id-docs/${filename}`;
          if (entry.field === 'idDocument') idDocumentUrl = url;
          if (entry.field === 'selfie') selfieUrl = url;
        }
      } catch (err: any) {
        ctx.log.error({ err: err?.message || err }, 'ID verification file upload failed');
        ctx.set.status = 400;
        return {
          error: ctx.t('idVerification.fileUploadError') + (err?.message || 'unknown error'),
        };
      }

      if (!idDocumentUrl || !selfieUrl) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.bothIdDocumentAndSelfieFilesAreRequired') };
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
    },
    {
      beforeHandle: authenticate,
      body: t.Any(),
      response: {
        200: t.Object({ success: t.Boolean(), record: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
      },
      detail: {
        summary: 'Submit ID verification',
        description: 'User submits scanned ID and selfie for manual review.',
        tags: ['Identity'],
      },
    }
  );

  app.get(
    prefix + '/id-verification/:id',
    async (ctx: any) => {
      const userId = Number(ctx.params['id']);
      const requester = ctx.user;
      if (requester?.id !== userId && !hasPermissionSync(ctx, 'idverification:read')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const repo = AppDataSource.getRepository(IDVerification);
      const record = await repo.findOne({ where: { userId }, order: { id: 'DESC' } });
      if (!record) {
        ctx.set.status = 404;
        return { error: ctx.t('common.notFound') };
      }
      return JSON.parse(JSON.stringify(record));
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Fetch latest ID verification for a user', tags: ['Identity'] },
    }
  );

  app.put(
    prefix + '/id-verification/:id',
    async (ctx: any) => {
      const requester = ctx.user;
      if (!hasPermissionSync(ctx, 'idverification:write')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const repo = AppDataSource.getRepository(IDVerification);
      const rec = await repo.findOneBy({ id: Number(ctx.params['id']) });
      if (!rec) {
        ctx.set.status = 404;
        return { error: ctx.t('common.notFound') };
      }
      const { status } = ctx.body as any;
      if (!['pending', 'verified', 'failed'].includes(status)) {
        ctx.set.status = 400;
        return { error: ctx.t('common.invalidStatus') };
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
            locale: ctx.locale,
          });
        }
      } catch {}
      return { success: true, rec };
    },
    {
      beforeHandle: authenticate,
      body: t.Object({
        status: t.Enum({ pending: 'pending', verified: 'verified', failed: 'failed' }),
      }),
      response: {
        200: t.Object({ success: t.Boolean(), rec: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Approve or reject an ID verification', tags: ['Identity'] },
    }
  );

  app.delete(
    prefix + '/id-verification/:id',
    async (ctx: any) => {
      const requester = ctx.user;
      if (!hasPermissionSync(ctx, 'idverification:write')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const repo = AppDataSource.getRepository(IDVerification);
      const rec = await repo.findOneBy({ id: Number(ctx.params['id']) });
      if (!rec) {
        ctx.set.status = 404;
        return { error: ctx.t('common.notFound') };
      }

      const uploadDir = process.cwd();
      for (const url of [rec.idDocumentUrl, rec.selfieUrl]) {
        if (typeof url === 'string' && url.trim()) {
          const filepath = getSafeRelativeFilePath(uploadDir, url);
          if (!filepath) continue;
          try {
            await fs.promises.unlink(filepath);
          } catch {}
        }
      }

      await repo.remove(rec);
      return { success: true };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Delete an ID verification record', tags: ['Identity'] },
    }
  );
}
