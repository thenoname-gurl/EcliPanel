import { AppDataSource } from '../config/typeorm';
import { t } from 'elysia';
import { RegionalPrice } from '../models/regionalPrice.entity';
import { Plan } from '../models/plan.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

export async function regionalPriceRoutes(app: any, prefix = '') {

  app.get(
    prefix + '/admin/regional-prices/:planId',
    async ctx => {
      const planId = Number((ctx.params as any).planId);
      const planRepo = AppDataSource.getRepository(Plan);
      const plan = await planRepo.findOneBy({ id: planId });
      if (!plan) {
        ctx.set.status = 404;
        return { error: ctx.t('plan.notFound') };
      }
      const repo = AppDataSource.getRepository(RegionalPrice);
      const prices = await repo.find({ where: { planId }, order: { countryCode: 'ASC' } });
      return prices;
    },
    {
      beforeHandle: [authenticate, authorize('admin:plans:view')],
      detail: { summary: 'List regional prices for a plan', tags: ['Plans', 'Admin'] },
      response: { 200: t.Array(t.Any()), 403: t.Object({ error: t.String() }) },
    }
  );

  app.post(
    prefix + '/admin/regional-prices/:planId',
    async ctx => {
      const planId = Number((ctx.params as any).planId);
      const planRepo = AppDataSource.getRepository(Plan);
      const plan = await planRepo.findOneBy({ id: planId });
      if (!plan) {
        ctx.set.status = 404;
        return { error: ctx.t('plan.notFound') };
      }

      const { countryCode, price } = ctx.body as any;
      if (!countryCode || typeof countryCode !== 'string' || countryCode.length !== 2) {
        ctx.set.status = 400;
        return { error: 'Invalid country code' };
      }
      if (price == null || !Number.isFinite(Number(price)) || Number(price) < 0) {
        ctx.set.status = 400;
        return { error: 'Invalid price' };
      }

      const code = countryCode.toUpperCase();
      const repo = AppDataSource.getRepository(RegionalPrice);
      let existing = await repo.findOneBy({ planId, countryCode: code });
      if (existing) {
        existing.price = Number(price);
        await repo.save(existing);
        return { success: true, regionalPrice: existing };
      }

      const rp = repo.create({ planId, countryCode: code, price: Number(price) });
      await repo.save(rp);
      return { success: true, regionalPrice: rp };
    },
    {
      beforeHandle: [authenticate, authorize('admin:plans:manage')],
      detail: { summary: 'Create or update a regional price for a plan', tags: ['Plans', 'Admin'] },
      response: {
        200: t.Object({ success: t.Boolean(), regionalPrice: t.Any() }),
        400: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    }
  );

  app.delete(
    prefix + '/admin/regional-prices/:planId/:countryCode',
    async ctx => {
      const planId = Number((ctx.params as any).planId);
      const countryCode = String((ctx.params as any).countryCode).toUpperCase();
      const repo = AppDataSource.getRepository(RegionalPrice);
      const rp = await repo.findOneBy({ planId, countryCode });
      if (!rp) {
        ctx.set.status = 404;
        return { error: 'Regional price not found' };
      }
      await repo.remove(rp);
      return { success: true };
    },
    {
      beforeHandle: [authenticate, authorize('admin:plans:manage')],
      detail: { summary: 'Delete a regional price', tags: ['Plans', 'Admin'] },
      response: {
        200: t.Object({ success: t.Boolean() }),
        404: t.Object({ error: t.String() }),
      },
    }
  );

  app.get(
    prefix + '/public/regional-prices',
    async () => {
      const planRepo = AppDataSource.getRepository(Plan);
      const plans = await planRepo.find({ where: { hiddenFromBilling: false } });
      const planIds = plans.map(p => p.id);
      if (planIds.length === 0) return [];
      const repo = AppDataSource.getRepository(RegionalPrice);
      const prices = await repo
        .createQueryBuilder('rp')
        .where('rp.planId IN (:...planIds)', { planIds })
        .getMany();
      return prices;
    },
    {
      detail: { summary: 'Public regional pricing data', tags: ['Public'] },
      response: { 200: t.Array(t.Any()) },
    }
  );
}