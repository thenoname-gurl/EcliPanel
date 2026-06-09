import { AppDataSource } from '../config/typeorm';
import { Coupon } from '../models/coupon.entity';
import { CouponUse } from '../models/couponUse.entity';
import { Order } from '../models/order.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { requireFeature } from '../middleware/featureToggle';
import { t } from 'elysia';
import crypto from 'crypto';

function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
}

export async function couponRoutes(app: any, prefix = '') {
  const couponRepo = AppDataSource.getRepository(Coupon);
  const couponUseRepo = AppDataSource.getRepository(CouponUse);
  const orderRepo = AppDataSource.getRepository(Order);

  app.get(
    prefix + '/admin/coupons',
    async (ctx: any) => {
      const coupons = await couponRepo.find({ order: { createdAt: 'DESC' } });
      return { coupons };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      detail: { summary: 'List all coupons (admin)', tags: ['Coupons'] },
    }
  );

  app.get(
    prefix + '/admin/coupons/:id',
    async (ctx: any) => {
      const coupon = await couponRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!coupon) {
        ctx.set.status = 404;
        return { error: 'Coupon not found' };
      }
      const uses = await couponUseRepo.find({
        where: { couponId: coupon.id },
        order: { usedAt: 'DESC' },
        take: 500,
      });
      return { coupon, uses };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      detail: { summary: 'Get coupon detail with uses (admin)', tags: ['Coupons'] },
    }
  );

  app.post(
    prefix + '/admin/coupons',
    async (ctx: any) => {
      const body = ctx.body as any;
      const code = body.code || generateCouponCode();

      const existing = await couponRepo.findOneBy({ code });
      if (existing) {
        ctx.set.status = 400;
        return { error: 'A coupon with this code already exists' };
      }

      if (!['percentage', 'fixed'].includes(body.discountType)) {
        ctx.set.status = 400;
        return { error: 'discountType must be "percentage" or "fixed"' };
      }

      if (body.discountType === 'percentage' && (body.discountValue < 0 || body.discountValue > 100)) {
        ctx.set.status = 400;
        return { error: 'Percentage discount must be between 0 and 100' };
      }

      if (body.discountType === 'fixed' && body.discountValue <= 0) {
        ctx.set.status = 400;
        return { error: 'Fixed discount must be greater than 0' };
      }

      const coupon = couponRepo.create({
        code,
        discountType: body.discountType,
        discountValue: Number(body.discountValue),
        minOrderAmount: body.minOrderAmount != null ? Number(body.minOrderAmount) : undefined,
        maxDiscountAmount: body.maxDiscountAmount != null ? Number(body.maxDiscountAmount) : undefined,
        maxUsesTotal: body.maxUsesTotal != null ? Number(body.maxUsesTotal) : undefined,
        maxUsesPerUser: body.maxUsesPerUser != null ? Number(body.maxUsesPerUser) : undefined,
        currentUsesTotal: 0,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        isActive: body.isActive !== false,
        createdBy: ctx.user?.id,
        createdAt: new Date(),
      });

      await couponRepo.save(coupon);
      return { success: true, coupon };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      detail: { summary: 'Create coupon (admin)', tags: ['Coupons'] },
    }
  );

  app.post(
    prefix + '/admin/coupons/generate-random',
    async (ctx: any) => {
      const body = ctx.body as any;
      const count = Math.min(Math.max(Number(body.count || 1), 1), 50);

      if (!['percentage', 'fixed'].includes(body.discountType)) {
        ctx.set.status = 400;
        return { error: 'discountType must be "percentage" or "fixed"' };
      }

      if (body.discountType === 'percentage' && (body.discountValue < 0 || body.discountValue > 100)) {
        ctx.set.status = 400;
        return { error: 'Percentage discount must be between 0 and 100' };
      }

      if (body.discountType === 'fixed' && body.discountValue <= 0) {
        ctx.set.status = 400;
        return { error: 'Fixed discount must be greater than 0' };
      }

      const coupons: Coupon[] = [];
      const usedCodes = new Set<string>();
      const existingAll = await couponRepo.find();
      for (const e of existingAll) usedCodes.add(e.code);

      for (let i = 0; i < count; i++) {
        let code: string;
        do {
          code = generateCouponCode();
        } while (usedCodes.has(code));
        usedCodes.add(code);

        const coupon = couponRepo.create({
          code,
          discountType: body.discountType,
          discountValue: Number(body.discountValue),
          minOrderAmount: body.minOrderAmount != null ? Number(body.minOrderAmount) : undefined,
          maxDiscountAmount: body.maxDiscountAmount != null ? Number(body.maxDiscountAmount) : undefined,
          maxUsesTotal: body.maxUsesTotal != null ? Number(body.maxUsesTotal) : undefined,
          maxUsesPerUser: body.maxUsesPerUser != null ? Number(body.maxUsesPerUser) : undefined,
          currentUsesTotal: 0,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          isActive: body.isActive !== false,
          createdBy: ctx.user?.id,
          createdAt: new Date(),
        });
        coupons.push(coupon);
      }

      await couponRepo.save(coupons);
      return { success: true, coupons, count: coupons.length };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      detail: { summary: 'Generate random coupons (admin)', tags: ['Coupons'] },
    }
  );

  app.put(
    prefix + '/admin/coupons/:id',
    async (ctx: any) => {
      const coupon = await couponRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!coupon) {
        ctx.set.status = 404;
        return { error: 'Coupon not found' };
      }

      const body = ctx.body as any;

      if (body.code !== undefined) {
        if (body.code !== coupon.code) {
          const existing = await couponRepo.findOneBy({ code: body.code });
          if (existing && existing.id !== coupon.id) {
            ctx.set.status = 400;
            return { error: 'A coupon with this code already exists' };
          }
        }
        coupon.code = body.code;
      }

      if (body.discountType !== undefined) {
        if (!['percentage', 'fixed'].includes(body.discountType)) {
          ctx.set.status = 400;
          return { error: 'discountType must be "percentage" or "fixed"' };
        }
        coupon.discountType = body.discountType;
      }

      if (body.discountValue !== undefined) {
        if ((body.discountType || coupon.discountType) === 'percentage' && (body.discountValue < 0 || body.discountValue > 100)) {
          ctx.set.status = 400;
          return { error: 'Percentage discount must be between 0 and 100' };
        }
        if ((body.discountType || coupon.discountType) === 'fixed' && body.discountValue <= 0) {
          ctx.set.status = 400;
          return { error: 'Fixed discount must be greater than 0' };
        }
        coupon.discountValue = Number(body.discountValue);
      }

      if (body.minOrderAmount !== undefined) coupon.minOrderAmount = body.minOrderAmount != null ? Number(body.minOrderAmount) : undefined;
      if (body.maxDiscountAmount !== undefined) coupon.maxDiscountAmount = body.maxDiscountAmount != null ? Number(body.maxDiscountAmount) : undefined;
      if (body.maxUsesTotal !== undefined) coupon.maxUsesTotal = body.maxUsesTotal != null ? Number(body.maxUsesTotal) : undefined;
      if (body.maxUsesPerUser !== undefined) coupon.maxUsesPerUser = body.maxUsesPerUser != null ? Number(body.maxUsesPerUser) : undefined;
      if (body.expiresAt !== undefined) coupon.expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
      if (body.isActive !== undefined) coupon.isActive = Boolean(body.isActive);

      await couponRepo.save(coupon);
      return { success: true, coupon };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      detail: { summary: 'Update coupon (admin)', tags: ['Coupons'] },
    }
  );

  app.delete(
    prefix + '/admin/coupons/:id',
    async (ctx: any) => {
      const coupon = await couponRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!coupon) {
        ctx.set.status = 404;
        return { error: 'Coupon not found' };
      }

      await couponUseRepo.delete({ couponId: coupon.id });
      await couponRepo.remove(coupon);
      return { success: true };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      detail: { summary: 'Delete coupon (admin)', tags: ['Coupons'] },
    }
  );

  app.post(
    prefix + '/coupons/validate',
    async (ctx: any) => {
      const f = await requireFeature(ctx, 'billing');
      if (f !== true) return f;

      const user = ctx.user as any;
      const body = ctx.body as any;
      const { code, orderAmount } = body;

      if (!code) {
        ctx.set.status = 400;
        return { error: 'Coupon code is required' };
      }

      const coupon = await couponRepo.findOneBy({ code: String(code).trim().toUpperCase() });
      if (!coupon) {
        ctx.set.status = 404;
        return { error: 'Invalid or expired coupon' };
      }

      if (!coupon.isActive) {
        ctx.set.status = 400;
        return { error: 'This coupon is no longer active' };
      }

      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        ctx.set.status = 400;
        return { error: 'This coupon has expired' };
      }

      if (coupon.maxUsesTotal != null && coupon.currentUsesTotal >= coupon.maxUsesTotal) {
        ctx.set.status = 400;
        return { error: 'This coupon has reached its global usage limit' };
      }

      if (coupon.maxUsesPerUser != null) {
        const userUseCount = await couponUseRepo.count({
          where: { couponId: coupon.id, userId: user.id },
        });
        if (userUseCount >= coupon.maxUsesPerUser) {
          ctx.set.status = 400;
          return { error: 'You have already used this coupon the maximum number of times' };
        }
      }

      let discountAmount = 0;
      if (coupon.discountType === 'percentage') {
        discountAmount = (Number(orderAmount || 0) * coupon.discountValue) / 100;
        if (coupon.maxDiscountAmount != null && discountAmount > coupon.maxDiscountAmount) {
          discountAmount = coupon.maxDiscountAmount;
        }
      } else if (coupon.discountType === 'fixed') {
        discountAmount = Math.min(coupon.discountValue, Number(orderAmount || 0));
      }

      if (coupon.minOrderAmount != null && Number(orderAmount || 0) < coupon.minOrderAmount) {
        ctx.set.status = 400;
        return { error: `Minimum order amount of $${coupon.minOrderAmount.toFixed(2)} required for this coupon` };
      }

      return {
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          discountAmount: Math.round(discountAmount * 100) / 100,
          newAmount: Math.max(0, Math.round((Number(orderAmount || 0) - discountAmount) * 100) / 100),
        },
      };
    },
    {
      beforeHandle: authenticate,
      body: t.Object({
        code: t.String(),
        orderAmount: t.Optional(t.Number()),
      }),
      detail: { summary: 'Validate a coupon code', tags: ['Coupons'] },
    }
  );

  app.post(
    prefix + '/coupons/redeem',
    async (ctx: any) => {
      const f = await requireFeature(ctx, 'billing');
      if (f !== true) return f;

      const user = ctx.user as any;
      const body = ctx.body as any;
      const { code, orderId } = body;

      if (!code || !orderId) {
        ctx.set.status = 400;
        return { error: 'Coupon code and order ID are required' };
      }

      const order = await orderRepo.findOneBy({ id: Number(orderId) });
      if (!order) {
        ctx.set.status = 404;
        return { error: 'Order not found' };
      }
      if (order.userId !== user.id) {
        ctx.set.status = 403;
        return { error: 'Forbidden' };
      }
      if (order.status !== 'pending') {
        ctx.set.status = 400;
        return { error: 'Coupon can only be applied to pending orders' };
      }
      if (order.couponId) {
        ctx.set.status = 400;
        return { error: 'A coupon has already been applied to this order' };
      }

      const normalizedCode = String(code).trim().toUpperCase();
      const coupon = await couponRepo.findOneBy({ code: normalizedCode });
      if (!coupon) {
        ctx.set.status = 404;
        return { error: 'Invalid or expired coupon' };
      }

      if (!coupon.isActive) {
        ctx.set.status = 400;
        return { error: 'This coupon is no longer active' };
      }

      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        ctx.set.status = 400;
        return { error: 'This coupon has expired' };
      }

      if (coupon.maxUsesTotal != null && coupon.currentUsesTotal >= coupon.maxUsesTotal) {
        ctx.set.status = 400;
        return { error: 'This coupon has reached its global usage limit' };
      }

      if (coupon.maxUsesPerUser != null) {
        const userUseCount = await couponUseRepo.count({
          where: { couponId: coupon.id, userId: user.id },
        });
        if (userUseCount >= coupon.maxUsesPerUser) {
          ctx.set.status = 400;
          return { error: 'You have already used this coupon the maximum number of times' };
        }
      }

      let discountAmount = 0;
      if (coupon.discountType === 'percentage') {
        discountAmount = (Number(order.amount) * coupon.discountValue) / 100;
        if (coupon.maxDiscountAmount != null && discountAmount > coupon.maxDiscountAmount) {
          discountAmount = coupon.maxDiscountAmount;
        }
      } else if (coupon.discountType === 'fixed') {
        discountAmount = Math.min(coupon.discountValue, Number(order.amount));
      }

      if (coupon.minOrderAmount != null && Number(order.amount) < coupon.minOrderAmount) {
        ctx.set.status = 400;
        return { error: `Minimum order amount of $${coupon.minOrderAmount.toFixed(2)} required for this coupon` };
      }

      discountAmount = Math.min(discountAmount, Number(order.amount));

      order.couponId = coupon.id;
      order.couponCode = coupon.code;
      order.discountAmount = Math.round(discountAmount * 100) / 100;
      order.amount = Math.max(0, Math.round((Number(order.amount) - discountAmount) * 100) / 100);

      if (order.amount === 0) {
        order.status = 'payment_sent';
        order.notes = order.notes
          ? `${order.notes}; Auto-paid by coupon ${coupon.code}`
          : `Auto-paid by coupon ${coupon.code}`;
      }

      coupon.currentUsesTotal += 1;

      const couponUse = couponUseRepo.create({
        couponId: coupon.id,
        userId: user.id,
        usedAt: new Date(),
      });

      await couponRepo.save(coupon);
      await couponUseRepo.save(couponUse);
      await orderRepo.save(order);

      return {
        success: true,
        order: {
          id: order.id,
          amount: order.amount,
          discountAmount: order.discountAmount,
          couponCode: order.couponCode,
          status: order.status,
          autoActivated: order.amount === 0,
        },
      };
    },
    {
      beforeHandle: authenticate,
      body: t.Object({
        code: t.String(),
        orderId: t.Number(),
      }),
      detail: { summary: 'Redeem a coupon on an order', tags: ['Coupons'] },
    }
  );
}
