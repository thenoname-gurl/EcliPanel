import { AppDataSource } from '../config/typeorm';
import { StudentVerification } from '../models/studentVerification.entity';
import { authenticate } from '../middleware/auth';
import { User } from '../models/user.entity';
import { encryptBufferToString } from '../utils/crypto';
import path from 'path';
import fs from 'fs';
import { t } from 'elysia';

function pickUpload(value: any): any {
  return Array.isArray(value) ? value[0] : value;
}

function isUploadFile(value: any): boolean {
  return Boolean(value) && typeof value.arrayBuffer === 'function';
}

export async function studentVerificationRoutes(app: any, prefix = '') {
  const uploadDir = path.join(process.cwd(), 'uploads', 'student-proofs');

  app.post(
    prefix + '/student-verification',
    async (ctx: any) => {
      const user = ctx.user as User;
      try {
        const ip = (ctx.ip || ctx.request?.ip || '').toString().slice(0, 200);
        const keyIp = `rate:student-verify:ip:${ip}`;
        const keyUser = `rate:student-verify:user:${user?.id}`;
        const rlIp = await require('../config/redis').consumeRateLimit(
          keyIp, Number(process.env.STUDENT_VERIFY_RATE_IP || 10), Number(process.env.STUDENT_VERIFY_WINDOW_IP || 3600)
        );
        if (!rlIp.allowed) {
          ctx.set.status = 429;
          ctx.set.headers = { ...(ctx.set.headers || {}), 'Retry-After': String(rlIp.retryAfterSeconds) };
          return { error: 'rate_limited', retryAfter: rlIp.retryAfterSeconds };
        }
        const rlUser = await require('../config/redis').consumeRateLimit(
          keyUser, Number(process.env.STUDENT_VERIFY_RATE_USER || 3), Number(process.env.STUDENT_VERIFY_WINDOW_USER || 86400)
        );
        if (!rlUser.allowed) {
          ctx.set.status = 429;
          ctx.set.headers = { ...(ctx.set.headers || {}), 'Retry-After': String(rlUser.retryAfterSeconds) };
          return { error: 'rate_limited', retryAfter: rlUser.retryAfterSeconds };
        }
      } catch (e) { /* proceed */ }

      if (!Bun.file(uploadDir).exists) {
        await fs.promises.mkdir(uploadDir, { recursive: true });
      }

      const repo = AppDataSource.getRepository(StudentVerification);

      const existing = await repo.findOne({ where: { userId: user.id, status: 'pending' } });
      if (existing) {
        ctx.set.status = 400;
        return { error: ctx.t('studentVerification.existingPending') };
      }

      let proofUrl: string | undefined;
      let proofType = 'other';
      let emailCode: string | undefined;

      try {
        const { proof, proofType: bodyProofType, emailCode: bodyEmailCode } = (ctx.body || {}) as any;

        if (bodyProofType && ['school_email', 'enrollment_doc', 'github_screenshot', 'other'].includes(String(bodyProofType))) {
          proofType = String(bodyProofType);
        }

        if (proofType === 'school_email' && bodyEmailCode) {
          emailCode = String(bodyEmailCode);
          proofUrl = null as any;
        } else {
          const proofFile = pickUpload(proof);
          if (!isUploadFile(proofFile)) {
            ctx.set.status = 400;
            return { error: ctx.t('studentVerification.proofRequired') };
          }

          const safeExt = path.extname(proofFile.name || proofFile.filename || '').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 6) || '.bin';
          const filename = `${user.id}-student-proof-${Date.now()}${safeExt}`;
          const filepath = path.join(uploadDir, filename);

          const ab = await proofFile.arrayBuffer();
          const buffer = Buffer.from(ab);
          if (buffer.length === 0) {
            ctx.set.status = 400;
            return { error: ctx.t('studentVerification.proofEmpty') };
          }
          const encrypted = encryptBufferToString(buffer);
          await Bun.write(filepath, encrypted);
          proofUrl = `/uploads/student-proofs/${filename}`;
        }
      } catch (err: any) {
        ctx.log?.error?.({ err: err?.message || err }, 'Student verification file upload failed');
        ctx.set.status = 400;
        return { error: ctx.t('studentVerification.uploadError') + (err?.message || 'unknown error') };
      }

      if (proofType !== 'school_email' && !proofUrl) {
        ctx.set.status = 400;
        return { error: ctx.t('studentVerification.proofRequired') };
      }

      let record = repo.create({
        userId: user.id,
        status: 'pending',
        provider: 'manual',
        proofUrl: proofUrl || undefined,
        proofType,
        adminNotes: emailCode ? `Email verification code: ${emailCode}` : undefined,
      });
      record = await repo.save(record);
      return { success: true, record };
    },
    {
      beforeHandle: authenticate,
      body: t.Any(),
      response: { 200: t.Object({ success: t.Boolean(), record: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'Submit student verification proof', description: 'User uploads proof of enrollment for manual review.', tags: ['Student Verification'] },
    }
  );

  app.get(
    prefix + '/student-verification/:id',
    async (ctx: any) => {
      const userId = Number(ctx.params['id']);
      const requester = ctx.user;
      if (requester?.id !== userId) {
        const { hasPermissionSync } = require('../middleware/authorize');
        if (!hasPermissionSync(ctx, 'admin:student:verify')) {
          ctx.set.status = 403;
          return { error: ctx.t('common.forbidden') };
        }
      }
      const repo = AppDataSource.getRepository(StudentVerification);
      const record = await repo.findOne({ where: { userId }, order: { id: 'DESC' } });
      if (!record) {
        ctx.set.status = 404;
        return { error: ctx.t('common.notFound') };
      }
      return JSON.parse(JSON.stringify(record));
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Fetch latest student verification for a user', tags: ['Student Verification'] },
    }
  );
}