import { AppDataSource } from '../config/typeorm';
import { Feedback } from '../models/feedback.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { PanelSetting } from '../models/panelSetting.entity';
import { getRolloutTreatment } from '../services/rolloutService';
import { In } from 'typeorm';

const ROLLOUT_KEY = 'feedback_prompt';

const WORD_LIMIT = 250;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function getPromptChance(): Promise<number> {
  try {
    const repo = AppDataSource.getRepository(PanelSetting);
    const row = await repo.findOneBy({ key: 'feedbackPromptChance' });
    if (row) {
      const val = parseFloat(row.value);
      if (!isNaN(val) && val >= 0 && val <= 1) return val;
    }
  } catch {}
  return 0.3;
}

async function requireRollout(ctx: any): Promise<true | { error: string }> {
  const { inRollout } = await getRolloutTreatment(ctx.user.id, ROLLOUT_KEY);
  if (!inRollout) {
    ctx.set.status = 403;
    return { error: ctx.t('common.featureNotAvailable') };
  }
  return true;
}

export async function feedbackRoutes(app: any, prefix = '') {
  app.post(
    prefix + '/feedback',
    async (ctx: any) => {
      const rolloutCheck = await requireRollout(ctx);
      if (rolloutCheck !== true) return rolloutCheck;

      const userId = ctx.user.id;
      const body = ctx.body as any;
      const rating = Number(body?.rating);
      const message = String(body?.message || '').trim();

      if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.ratingIntegerRequired') };
      }

      if (message.length > 0 && countWords(message) > WORD_LIMIT) {
        ctx.set.status = 400;
        return { error: `Message must be ${WORD_LIMIT} words or fewer` };
      }

      const repo = AppDataSource.getRepository(Feedback);
      let feedback = await repo.findOne({ where: { userId } });

      if (feedback) {
        feedback.rating = rating;
        feedback.message = message;
        await repo.save(feedback);
      } else {
        feedback = repo.create({ userId, rating, message });
        await repo.save(feedback);
        ctx.set.status = 201;
      }

      return {
        id: feedback.id,
        rating: feedback.rating,
        message: feedback.message,
        createdAt: feedback.createdAt,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Feedback'], summary: 'Submit or update feedback' },
    }
  );

  app.get(
    prefix + '/feedback',
    async (ctx: any) => {
      const rolloutCheck = await requireRollout(ctx);
      if (rolloutCheck !== true) return rolloutCheck;

      const repo = AppDataSource.getRepository(Feedback);
      const feedback = await repo.findOne({ where: { userId: ctx.user.id } });

      if (!feedback) return null;

      return {
        id: feedback.id,
        rating: feedback.rating,
        message: feedback.message,
        createdAt: feedback.createdAt,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Feedback'], summary: 'Get current user feedback' },
    }
  );

  app.get(
    prefix + '/feedback/check',
    async (ctx: any) => {
      const rolloutCheck = await requireRollout(ctx);
      if (rolloutCheck !== true) return { shouldPrompt: false, reason: 'not_in_rollout' };

      const userId = ctx.user.id;

      const repo = AppDataSource.getRepository(Feedback);
      const existing = await repo.findOne({ where: { userId } });
      if (existing) {
        return { shouldPrompt: false, reason: 'already_submitted' };
      }

      const chance = await getPromptChance();
      const shouldPrompt = Math.random() < chance;

      return { shouldPrompt, reason: shouldPrompt ? 'random_selected' : 'random_skipped' };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Feedback'], summary: 'Check if user should be prompted for feedback' },
    }
  );

  app.get(
    prefix + '/feedback/status',
    async (ctx: any) => {
      const rolloutCheck = await requireRollout(ctx);
      if (rolloutCheck !== true) return { inRollout: false };

      const userId = ctx.user.id;

      const repo = AppDataSource.getRepository(Feedback);
      const existing = await repo.findOne({ where: { userId } });

      return { inRollout: true, submitted: !!existing };
    },
    {
      beforeHandle: [authenticate],
      detail: { tags: ['Feedback'], summary: 'Check feedback eligibility for the user' },
    }
  );

  app.get(
    prefix + '/admin/feedback',
    async (ctx: any) => {
      const page = Math.max(1, Number(ctx.query?.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(ctx.query?.limit) || 50));
      const rating = ctx.query?.rating ? Number(ctx.query.rating) : undefined;

      const repo = AppDataSource.getRepository(Feedback);
      const userRepo = AppDataSource.getRepository(User);

      const where: any = {};
      if (rating !== undefined && !isNaN(rating)) {
        where.rating = rating;
      }

      const [rows, total] = await repo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      const userIds = [...new Set(rows.map(r => r.userId))];
      const users = userIds.length > 0 ? await userRepo.findBy({ id: In(userIds) }) : [];
      const userMap = new Map(users.map(u => [u.id, u]));

      const data = rows.map(r => {
        const u = userMap.get(r.userId);
        return {
          id: r.id,
          rating: r.rating,
          message: r.message,
          createdAt: r.createdAt,
          user: u
            ? {
                id: u.id,
                firstName: u.firstName,
                lastName: u.lastName,
                email: u.email,
                avatarUrl: u.avatarUrl,
              }
            : null,
        };
      });

      return { data, total, page, limit };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      detail: { tags: ['Admin'], summary: 'List feedback submissions' },
    }
  );

  app.delete(
    prefix + '/admin/feedback/:id',
    async (ctx: any) => {
      const id = Number(ctx.params?.id);
      if (!id || isNaN(id)) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.invalidFeedbackId') };
      }

      const repo = AppDataSource.getRepository(Feedback);
      const result = await repo.delete(id);
      if (!result.affected) {
        ctx.set.status = 404;
        return { error: ctx.t('organisation.feedbackNotFound') };
      }

      return { success: true };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      detail: { tags: ['Admin'], summary: 'Delete a feedback submission' },
    }
  );
}
