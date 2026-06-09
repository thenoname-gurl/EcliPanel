import { AppDataSource } from '../config/typeorm';
import { Order } from '../models/order.entity';
import { Coupon } from '../models/coupon.entity';
import { CouponUse } from '../models/couponUse.entity';
import { User } from '../models/user.entity';
import { Plan } from '../models/plan.entity';
import { Node } from '../models/node.entity';
import { PanelSetting } from '../models/panelSetting.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { requireFeature } from '../middleware/featureToggle';
import { sendMail } from '../services/mailService';
import { createT, getMessages } from '../i18n';
import { t } from 'elysia';

interface PaymentMethodDef {
  id: string;
  type: 'crypto' | 'paypal' | 'bank_transfer' | 'other';
  label: string;
  enabled: boolean;
  address: string;
  currency?: string;
  network?: string;
  instructions?: string;
}

const VALID_METHOD_TYPES = ['crypto', 'paypal', 'bank_transfer', 'other'] as const;
const VALID_NETWORKS = ['bitcoin', 'ethereum', 'usdt_erc20', 'usdt_trc20', 'litecoin', 'monero', 'solana', 'lightning'] as const;

function validatePaymentMethod(method: any): method is PaymentMethodDef {
  if (!method || typeof method !== 'object') return false;
  if (typeof method.id !== 'string' || !method.id) return false;
  if (!VALID_METHOD_TYPES.includes(method.type)) return false;
  if (typeof method.label !== 'string' || !method.label.trim()) return false;
  if (typeof method.enabled !== 'boolean') return false;
  if (typeof method.address !== 'string' || !method.address.trim()) return false;
  if (method.currency !== undefined && typeof method.currency !== 'string') return false;
  if (method.network !== undefined && !VALID_NETWORKS.includes(method.network)) return false;
  if (method.instructions !== undefined && typeof method.instructions !== 'string') return false;
  return true;
}

function sanitizePaymentMethod(method: PaymentMethodDef): PaymentMethodDef {
  return {
    id: String(method.id),
    type: method.type,
    label: String(method.label).trim(),
    enabled: Boolean(method.enabled),
    address: String(method.address).trim(),
    currency: method.currency ? String(method.currency).trim() : undefined,
    network: method.network ? String(method.network) : undefined,
    instructions: method.instructions ? String(method.instructions).trim() : undefined,
  };
}

async function getPaymentMethods(): Promise<PaymentMethodDef[]> {
  const settingRepo = AppDataSource.getRepository(PanelSetting);
  const row = await settingRepo.findOneBy({ key: 'paymentMethods' });
  if (!row?.value) return [];
  try {
    return JSON.parse(row.value);
  } catch {
    return [];
  }
}

async function savePaymentMethods(methods: PaymentMethodDef[]) {
  const settingRepo = AppDataSource.getRepository(PanelSetting);
  let row = await settingRepo.findOneBy({ key: 'paymentMethods' });
  const value = JSON.stringify(methods);
  if (row) {
    row.value = value;
    await settingRepo.save(row);
  } else {
    row = settingRepo.create({ key: 'paymentMethods', value });
    await settingRepo.save(row);
  }
  return methods;
}

function requireAdminPermission(ctx: any, perm: string) {
  if (!ctx.user || !ctx.userPermissions) {
    ctx.set.status = 401;
    return { error: ctx.t('auth.unauthorized') };
  }
  const perms: string[] = ctx.userPermissions || [];
  if (
    ctx.user.rootAdmin ||
    (ctx.user.role && ctx.user.role === '*') ||
    perms.includes(perm) ||
    perms.includes('*') ||
    perms.includes('admin:*')
  ) {
    return true;
  }
  ctx.set.status = 403;
  return { error: ctx.t('common.forbidden') };
}

export async function paymentRoutes(app: any, prefix = '') {
  const orderRepo = AppDataSource.getRepository(Order);

  app.get(
    prefix + '/payments/methods',
    async (ctx: any) => {
      const f = await requireFeature(ctx, 'billing');
      if (f !== true) return f;
      const methods = await getPaymentMethods();
      const publicMethods = methods
        .filter((m) => m.enabled)
        .map(({ id, type, label, currency, network }) => {
          const base: any = { id, type, label };
          if (type === 'crypto') {
            if (currency) base.currency = currency;
            if (network) base.network = network;
          }
          return base;
        });
      return { methods: publicMethods };
    },
    {
      beforeHandle: authenticate,
      detail: { summary: 'List available payment methods', tags: ['Payments'] },
    }
  );

  app.post(
    prefix + '/orders/:id/checkout',
    async (ctx: any) => {
      const f = await requireFeature(ctx, 'billing');
      if (f !== true) return f;
      const user = ctx.user as any;
      const orderId = Number(ctx.params.id);
      const { paymentMethodId, activateMode } = ctx.body as any;

      if (!paymentMethodId) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.paymentMethodRequired') };
      }

      const order = await orderRepo.findOneBy({ id: orderId });
      if (!order) {
        ctx.set.status = 404;
        return { error: ctx.t('order.notFound') };
      }
      if (order.userId !== user.id) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      if (order.status !== 'pending') {
        ctx.set.status = 400;
        return { error: ctx.t('payment.orderNotPending') };
      }

      const methods = await getPaymentMethods();
      const method = methods.find((m) => m.id === paymentMethodId && m.enabled);
      if (!method) {
        ctx.set.status = 400;
        return { error: ctx.t('payment.methodNotFound') };
      }

      order.paymentMethod = method.id;
      order.paymentProvider = method.type;
      order.status = 'awaiting_payment';
      if (activateMode === 'renewal') {
        order.notes = order.notes
          ? `${order.notes}; queue_for_renewal:true`
          : 'queue_for_renewal:true';
      }
      if (method.type === 'crypto') {
        order.cryptoAddress = method.address;
        order.cryptoCurrency = method.currency || 'BTC';
        order.cryptoNetwork = method.network || 'bitcoin';
      }
      await orderRepo.save(order);

      try {
        const userRepo = AppDataSource.getRepository(User);
        const u = await userRepo.findOneBy({ id: user.id });
        if (u?.email) {
          const userLocale = (u as any).locale || (u as any).language || 'en';
          const t = createT(getMessages(userLocale as any));
          await sendMail({
            to: u.email,
            from: process.env.SMTP_FROM || 'noreply@ecli.app',
            subject: t('paymentInstructions.subject', { orderId: order.id }),
            template: 'payment-instructions',
            locale: userLocale as any,
            vars: {
              orderId: order.id,
              amount: order.amount,
              paymentMethod: method.label,
              address: method.address,
              instructions: method.instructions,
              ...(method.type === 'crypto' ? {
                currency: method.currency,
                network: method.network,
              } : {}),
            },
          }).catch(() => {});
        }
      } catch {}

      const response: any = {
        success: true,
        order: {
          id: order.id,
          status: order.status,
          paymentMethod: order.paymentMethod,
          paymentProvider: order.paymentProvider,
        },
        payment: {
          type: method.type,
          label: method.label,
          address: method.address,
          instructions: method.instructions,
          amount: order.amount,
          ...(method.type === 'crypto' ? {
            currency: method.currency,
            network: method.network,
            cryptoAddress: method.address,
            cryptoCurrency: method.currency,
            cryptoNetwork: method.network,
          } : {}),
        },
      };

      return response;
    },
    {
      beforeHandle: [authenticate, authorize('orders:create')],
      body: t.Object({ paymentMethodId: t.String(), activateMode: t.Optional(t.String()) }),
      detail: { summary: 'Initiate payment for an order', tags: ['Payments'] },
    }
  );

  app.post(
    prefix + '/orders/:id/mark-sent',
    async (ctx: any) => {
      const user = ctx.user as any;
      const orderId = Number(ctx.params.id);
      const { txId } = ctx.body as any;

      const order = await orderRepo.findOneBy({ id: orderId });
      if (!order) {
        ctx.set.status = 404;
        return { error: ctx.t('order.notFound') };
      }
      if (order.userId !== user.id) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      if (order.status !== 'awaiting_payment') {
        ctx.set.status = 400;
        return { error: ctx.t('payment.invalidStatus') };
      }

      order.status = 'payment_sent';
      order.paymentTxId = txId || undefined;
      await orderRepo.save(order);

      return { success: true, status: order.status };
    },
    {
      beforeHandle: authenticate,
      body: t.Object({ txId: t.Optional(t.String()) }),
      detail: { summary: 'Mark order as payment sent', tags: ['Payments'] },
    }
  );

  app.get(
    prefix + '/orders/:id/payment-status',
    async (ctx: any) => {
      const user = ctx.user as any;
      const orderId = Number(ctx.params.id);

      const order = await orderRepo.findOneBy({ id: orderId });
      if (!order) {
        ctx.set.status = 404;
        return { error: ctx.t('order.notFound') };
      }
      if (order.userId !== user.id) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }

      const methods = await getPaymentMethods();
      const method = methods.find((m) => m.id === order.paymentMethod);

      return {
        id: order.id,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentProvider: order.paymentProvider,
        paymentTxId: order.paymentTxId,
        payment: method
          ? {
              type: method.type,
              label: method.label,
              address: method.address,
              currency: method.currency,
              network: method.network,
              instructions: method.instructions,
              amount: order.amount,
            }
          : null,
      };
    },
    {
      beforeHandle: authenticate,
      detail: { summary: 'Get payment status for an order', tags: ['Payments'] },
    }
  );

  app.post(
    prefix + '/admin/payment-methods',
    async (ctx: any) => {
      const adminErr = requireAdminPermission(ctx, 'admin:payment:manage');
      if (adminErr !== true) return adminErr;
      const { methods } = ctx.body as any;
      if (!Array.isArray(methods)) {
        ctx.set.status = 400;
        return { error: ctx.t('validation.invalidPaymentMethods') };
      }
      if (methods.length > 20) {
        ctx.set.status = 400;
        return { error: ctx.t('payment.tooManyMethods') };
      }
      const validMethods: PaymentMethodDef[] = [];
      for (const m of methods) {
        if (!validatePaymentMethod(m)) {
          ctx.set.status = 400;
          return { error: ctx.t('payment.invalidMethod', { id: m?.id || 'unknown' }) };
        }
        validMethods.push(sanitizePaymentMethod(m));
      }
      const saved = await savePaymentMethods(validMethods);
      return { success: true, methods: saved };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      body: t.Object({
        methods: t.Array(
          t.Object({
            id: t.String(),
            type: t.Union([t.Literal('crypto'), t.Literal('paypal'), t.Literal('bank_transfer'), t.Literal('other')]),
            label: t.String(),
            enabled: t.Boolean(),
            address: t.String(),
            currency: t.Optional(t.String()),
            network: t.Optional(t.String()),
            instructions: t.Optional(t.String()),
          })
        ),
      }),
      detail: { summary: 'Set payment methods (admin)', tags: ['Admin'] },
    }
  );

  app.get(
    prefix + '/admin/payment-methods',
    async (ctx: any) => {
      const adminErr = requireAdminPermission(ctx, 'admin:payment:manage');
      if (adminErr !== true) return adminErr;
      const methods = await getPaymentMethods();
      return { methods };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      detail: { summary: 'Get payment methods (admin)', tags: ['Admin'] },
    }
  );

  app.post(
    prefix + '/admin/orders/:id/confirm-payment',
    async (ctx: any) => {
      const adminErr = requireAdminPermission(ctx, 'admin:payment:manage');
      if (adminErr !== true) return adminErr;
      const orderId = Number(ctx.params.id);
      const { txId, notes } = ctx.body as any;

      const order = await orderRepo.findOneBy({ id: orderId });
      if (!order) {
        ctx.set.status = 404;
        return { error: ctx.t('order.notFound') };
      }

      const allowedStatuses = ['awaiting_payment', 'payment_sent', 'pending'];
      if (!allowedStatuses.includes(order.status)) {
        ctx.set.status = 400;
        return { error: ctx.t('payment.cannotConfirm') };
      }

      order.status = 'active';
      order.paymentTxId = txId || order.paymentTxId || undefined;
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      order.expiresAt = nextMonth;
      if (notes) order.notes = order.notes ? `${order.notes}; ${notes}` : notes;

      const isQueuedForRenewal = (order.notes || '').includes('queue_for_renewal');

      const prevActive = await orderRepo.find({
        where: { userId: order.userId, status: 'active' },
      });
      if (prevActive.length > 0 && !isQueuedForRenewal) {
        for (const prev of prevActive) {
          if (prev.id !== order.id) {
            prev.status = 'cancelled';
            prev.notes = prev.notes
              ? `${prev.notes}; Replaced by order #${order.id} on ${new Date().toISOString()}`
              : `Replaced by order #${order.id} on ${new Date().toISOString()}`;
          }
        }
        await orderRepo.save(prevActive);

        const couponRepo = AppDataSource.getRepository(Coupon);
        const couponUseRepo = AppDataSource.getRepository(CouponUse);
        for (const prev of prevActive) {
          if (prev.couponId) {
            const coupon = await couponRepo.findOneBy({ id: Number(prev.couponId) });
            if (coupon) {
              coupon.currentUsesTotal = Math.max(0, coupon.currentUsesTotal - 1);
              await couponRepo.save(coupon);
            }
            await couponUseRepo.delete({
              couponId: prev.couponId,
              userId: prev.userId,
            });
          }
        }
      }

      if (isQueuedForRenewal && prevActive.length > 0) {
        const latestActive = prevActive.reduce((latest, o) =>
          new Date(o.expiresAt) > new Date(latest.expiresAt) ? o : latest
        , prevActive[0]);
        const queueStart = new Date(latestActive.expiresAt);
        queueStart.setMonth(queueStart.getMonth() + 1);
        order.expiresAt = queueStart;
      }

      if (order.planId) {
        const userRepo = AppDataSource.getRepository(User);
        const planRepo = AppDataSource.getRepository(Plan);
        const nodeRepo = AppDataSource.getRepository(Node);

        const user = await userRepo.findOneBy({ id: order.userId });
        const plan = await planRepo.findOneBy({ id: order.planId });

        if (user && plan) {
          const limits: Record<string, number> = {};
          if (plan.type === 'enterprise' && (user as any).nodeId) {
            const node = await nodeRepo.findOneBy({ id: (user as any).nodeId });
            if (node) {
              if (node.memory != null) limits.memory = Number(node.memory);
              if (node.disk != null) limits.disk = Number(node.disk);
              if (node.cpu != null) limits.cpu = Number(node.cpu);
              if (node.serverLimit != null) limits.serverLimit = Number(node.serverLimit);
            }
          }
          if (Object.keys(limits).length === 0) {
            if (plan.memory != null) limits.memory = plan.memory;
            if (plan.disk != null) limits.disk = plan.disk;
            if (plan.cpu != null) limits.cpu = plan.cpu;
            if (plan.serverLimit != null) limits.serverLimit = plan.serverLimit;
          }

          const existingLimits = (user as any).limits || {};
          if (Object.keys(limits).length) {
            for (const key of Object.keys(limits)) {
              if ((existingLimits[key] ?? 0) < limits[key]) {
                existingLimits[key] = limits[key];
              }
            }
            user.limits = existingLimits;
          }

          user.portalType = plan.type;
          await userRepo.save(user);
        }
      }

      await orderRepo.save(order);

      try {
        const userRepo = AppDataSource.getRepository(User);
        const u = await userRepo.findOneBy({ id: order.userId });
        if (u?.email) {
          const userLocale = (u as any).locale || (u as any).language || 'en';
          const _t = createT(getMessages(userLocale as any));
          await sendMail({
            to: u.email,
            from: process.env.SMTP_FROM || 'noreply@ecli.app',
            subject: _t('paymentConfirmedEmail.subject', { orderId: order.id }),
            template: 'payment-confirmed',
            locale: userLocale as any,
            vars: { orderId: order.id, amount: order.amount },
          }).catch(() => {});
        }
      } catch {}

      return { success: true, order: { id: order.id, status: order.status } };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      body: t.Object({
        txId: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: { summary: 'Confirm payment and activate order (admin)', tags: ['Admin'] },
    }
  );

  app.post(
    prefix + '/admin/orders/:id/reject-payment',
    async (ctx: any) => {
      const adminErr = requireAdminPermission(ctx, 'orders:update');
      if (adminErr !== true) return adminErr;
      const orderId = Number(ctx.params.id);
      const { reason } = ctx.body as any;

      const order = await orderRepo.findOneBy({ id: orderId });
      if (!order) {
        ctx.set.status = 404;
        return { error: ctx.t('order.notFound') };
      }

      const allowedStatuses = ['awaiting_payment', 'payment_sent', 'pending'];
      if (!allowedStatuses.includes(order.status)) {
        ctx.set.status = 400;
        return { error: ctx.t('payment.cannotReject') };
      }

      order.status = 'cancelled';
      const rejectNote = `Payment rejected${reason ? `: ${reason}` : ''} on ${new Date().toISOString()}`;
      order.notes = order.notes ? `${order.notes}; ${rejectNote}` : rejectNote;
      await orderRepo.save(order);

      return { success: true, order: { id: order.id, status: order.status } };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      body: t.Object({ reason: t.Optional(t.String()) }),
      detail: { summary: 'Reject payment for an order (admin)', tags: ['Admin'] },
    }
  );
}