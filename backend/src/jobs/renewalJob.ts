import { AppDataSource } from '../config/typeorm';
import { Order } from '../models/order.entity';
import { Plan } from '../models/plan.entity';
import { User } from '../models/user.entity';
import { Node } from '../models/node.entity';
import { schedule } from '../utils/cron';
import { sendMail } from '../services/mailService';
import { resolveLocale } from '../i18n/resolve';

async function processRenewals() {
  if (!AppDataSource.isInitialized) return;

  const orderRepo = AppDataSource.getRepository(Order);
  const planRepo = AppDataSource.getRepository(Plan);
  const userRepo = AppDataSource.getRepository(User);
  const nodeRepo = AppDataSource.getRepository(Node);

  const now = new Date();
  const upcomingWindow = new Date();
  upcomingWindow.setDate(upcomingWindow.getDate() + 7);

  const dueOrders = await orderRepo
    .createQueryBuilder('o')
    .where('o.status = :status', { status: 'active' })
    .andWhere('o.planId IS NOT NULL')
    .andWhere('(o.billingType IS NULL OR o.billingType != :lifetime)', { lifetime: 'lifetime' })
    .andWhere('o.expiresAt <= :upcomingWindow', { upcomingWindow: upcomingWindow.toISOString() })
    .andWhere('o.expiresAt > :now', { now: now.toISOString() })
    .orderBy('o.expiresAt', 'ASC')
    .getMany();

  let extended = 0;
  let issued = 0;

  for (const order of dueOrders) {
    try {
      const plan = await planRepo.findOneBy({ id: order.planId! });
      const user = await userRepo.findOneBy({ id: order.userId });

      if (!plan || !user) continue;

      const existingRenewal = await orderRepo.findOne({
        where: {
          userId: order.userId,
          planId: order.planId,
        },
        order: { createdAt: 'DESC' },
      });

      if (existingRenewal && existingRenewal.id !== order.id) {
        const renewCreated = new Date(existingRenewal.createdAt).getTime();
        const threeDaysAgo = now.getTime() - 3 * 24 * 60 * 60 * 1000;
        if (renewCreated > threeDaysAgo) {
          continue;
        }
      }

      const renewalAmount = order.amount ?? plan.price ?? 0;
      const isFree = renewalAmount === 0;

      if (isFree) {
        const oldExpiry = new Date(order.expiresAt);
        oldExpiry.setDate(oldExpiry.getDate() + 30);
        order.expiresAt = oldExpiry;
        order.notes = order.notes
          ? `${order.notes}; Auto-renewed on ${now.toISOString()} — extended to ${oldExpiry.toISOString()}`
          : `Auto-renewed on ${now.toISOString()} — extended to ${oldExpiry.toISOString()}`;
        await orderRepo.save(order);

        try {
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
        } catch {}

        try {
          const panelUrl = process.env.PANEL_URL || 'https://ecli.app';
          sendMail({
            to: user.email,
            template: 'notification',
            vars: {
              title: `Subscription Renewed — ${plan.name}`,
              message: `Your ${plan.name} subscription has been automatically renewed until ${oldExpiry.toLocaleDateString()}.`,
              details: `Order: #${order.id}\nPlan: ${plan.name}\nExtended to: ${oldExpiry.toLocaleDateString()}\nPanel: ${panelUrl}`,
            },
            locale: resolveLocale({ user }),
          }).catch((e: any) => console.error('[renewalJob] failed to send renewal email', e));
        } catch {}

        extended++;
      } else {
        const extensionDate = new Date(order.expiresAt);
        extensionDate.setDate(extensionDate.getDate() + 30);

        const renewalItems = JSON.stringify([
          { description: order.description || plan.name || 'Renewal', quantity: 1, price: renewalAmount },
        ]);

        const renewalOrder = orderRepo.create({
          userId: order.userId,
          description: `${order.description || plan.name} (Auto-Renewal)`,
          planId: order.planId,
          amount: renewalAmount,
          taxAmount: order.taxAmount ?? 0,
          taxRate: order.taxRate ?? 0,
          items: renewalItems,
          status: 'pending',
          notes: `Auto-renewal of order #${order.id}`,
          createdAt: new Date(),
          expiresAt: extensionDate,
        });

        await orderRepo.save(renewalOrder);

        try {
          const panelUrl = process.env.PANEL_URL || 'https://ecli.app';
          sendMail({
            to: user.email,
            template: 'notification',
            vars: {
              title: `Subscription Renewal Issued — ${plan.name}`,
              message: `A renewal for your ${plan.name} subscription has been automatically issued. Order #${renewalOrder.id} — $${renewalAmount.toFixed(2)}. Please complete payment before it expires.`,
              details: `Renewal Order: #${renewalOrder.id}\nPlan: ${plan.name}\nAmount: $${renewalAmount.toFixed(2)}\nStatus: Pending Payment\nPanel: ${panelUrl}`,
            },
            locale: resolveLocale({ user }),
          }).catch((e: any) => console.error('[renewalJob] failed to send renewal email', e));
        } catch {}

        issued++;
      }
    } catch (err: any) {
      console.error('[renewalJob] failed for order', order.id, err?.message || err);
    }
  }

  if (extended > 0 || issued > 0) {
    console.log(`[renewalJob] extended ${extended} free orders, issued ${issued} paid renewal orders`);
  }
}

export function scheduleRenewalJob() {
  processRenewals().catch((e: any) =>
    console.error('[renewalJob] initial run failed', e)
  );
  schedule('0 2 * * *', async () => {
    await processRenewals().catch((e: any) =>
      console.error('[renewalJob] run failed', e)
    );
  });
}