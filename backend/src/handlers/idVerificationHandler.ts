import { AppDataSource } from '../config/typeorm';
import { IDVerification } from '../models/idVerification.entity';
import { authenticate } from '../middleware/auth';
import { hasPermissionSync } from '../middleware/authorize';
import { User } from '../models/user.entity';
import { canPerformIdVerification, getMinimumAgeForCountry } from '../utils/eu';
import { encryptBuffer } from '../utils/crypto';
import { encryptBufferWithWorker } from '../workers/cryptoWorker';
import { estimateAgeFromSelfie } from '../services/faceApiService';
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

  app.post(prefix + '/id-verification/age-selfie', async (ctx: any) => {
    const user = ctx.user as User;
    if (!user) {
      ctx.set.status = 401;
      return { error: 'Unauthorized' };
    }

    const body = (ctx.body || {}) as any;
    const selfie = Array.isArray(body.selfie) ? body.selfie[0] : body.selfie;
    if (!selfie) {
      ctx.set.status = 400;
      return { error: 'selfie_required', message: 'A selfie image is required for age verification.' };
    }

    const settings = user.settings && typeof user.settings === 'object' ? { ...user.settings } : {};
    const attempts = Number(settings.ageVerificationSelfieAttempts ?? 0);
    if (attempts >= 3) {
      ctx.set.status = 403;
      return { error: 'selfie_attempts_exceeded', message: 'Maximum selfie verification attempts reached.' };
    }

    const dateOfBirth = body.dateOfBirth ? new Date(String(body.dateOfBirth)) : user.dateOfBirth ? new Date(String(user.dateOfBirth)) : null;
    if (!dateOfBirth || isNaN(dateOfBirth.getTime())) {
      ctx.set.status = 400;
      return { error: 'date_of_birth_required', message: 'Your date of birth is required for selfie age verification.' };
    }
    const age = ((): number | null => {
      const now = new Date();
      let calculated = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
      const monthDiff = now.getUTCMonth() - dateOfBirth.getUTCMonth();
      const dayDiff = now.getUTCDate() - dateOfBirth.getUTCDate();
      if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) calculated -= 1;
      return Number.isFinite(calculated) ? calculated : null;
    })();
    if (age === null) {
      ctx.set.status = 400;
      return { error: 'invalid_date_of_birth', message: 'dateOfBirth must be a valid date string in YYYY-MM-DD format.' };
    }

    try {
      const data = await selfie.arrayBuffer();
      const buffer = Buffer.from(data);
      const predictedAge = await estimateAgeFromSelfie(buffer);
      if (predictedAge === null) {
        ctx.set.status = 400;
        return { error: 'no_face_detected', message: 'Could not detect a face in the selfie. Please try again.' };
      }

      const effectiveCountry = typeof body.billingCountry === 'string' ? body.billingCountry : user.billingCountry;
      const minimumAge = await getMinimumAgeForCountry(effectiveCountry);
      if (age < minimumAge) {
        await AppDataSource.getRepository(User).save({
          id: user.id,
          suspended: true,
          fraudFlag: true,
          fraudReason: `Underage account (<${minimumAge} years)`,
          fraudDetectedAt: new Date(),
        });
        ctx.set.status = 400;
        return { error: 'minimum_age', message: `Users must be at least ${minimumAge} years old.` };
      }

      const maxDelta = 11;
      const difference = Math.abs(predictedAge - age);
      const remaining = Math.max(0, 3 - attempts - 1);

      if (difference > maxDelta) {
        settings.ageVerificationSelfieAttempts = attempts + 1;
        settings.ageVerificationSelfieLastAttemptAt = new Date().toISOString();
        await AppDataSource.getRepository(User).save({ id: user.id, settings });

        ctx.set.status = 400;
        return {
          error: 'age_mismatch',
          message: `Estimated age ${predictedAge.toFixed(1)} does not match your DOB age ${age}. Please ensure your face is clearly visible in the selfie and try again.`,
          attempts: settings.ageVerificationSelfieAttempts,
          remaining,
        };
      }

      settings.ageVerificationSelfieAttempts = 0;
      settings.ageVerificationSelfieVerifiedAt = new Date().toISOString();

      const update: any = { id: user.id, settings };
      if (!user.dateOfBirth) {
        update.dateOfBirth = dateOfBirth;
      }
      await AppDataSource.getRepository(User).save(update);

      return {
        success: true,
        age: predictedAge,
        difference,
        maxError: maxDelta,
        attempts: 0,
        remaining: 3,
      };
    } catch (err: any) {
      ctx.log.error({ err: err?.message || err }, 'Selfie age verification failed');
      ctx.set.status = 500;
      return {
        error: 'age_verification_failed',
        message: 'Failed to estimate age from the selfie. Please try again later.',
        details: String(err?.message || err || 'unknown error'),
      };
    }
  }, { beforeHandle: authenticate,
    body: t.Any(),
    response: {
      200: t.Object({ success: t.Boolean(), age: t.Number(), difference: t.Number(), maxError: t.Number(), attempts: t.Number(), remaining: t.Number() }),
      400: t.Object({ error: t.String(), message: t.String(), details: t.Optional(t.String()) }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
    },
    detail: { summary: 'Verify age from selfie', description: 'Estimate a user age from selfie data and compare against the provided date of birth.', tags: ['Identity'] }
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
