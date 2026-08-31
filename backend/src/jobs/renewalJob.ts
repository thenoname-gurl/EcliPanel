import { AppDataSource } from '../config/typeorm';
import { Order } from '../models/order.entity';
import { Plan } from '../models/plan.entity';
import { User } from '../models/user.entity';
import { Node } from '../models/node.entity';
import { schedule } from '../utils/cron';
import { sendMail } from '../services/mailService';
import { resolveLocale } from '../i18n/resolve';
import { applyMembershipDiscount } from '../utils/regionalPricing';

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

      const priceChanged =
        order.nextRenewalAmount != null && order.nextRenewalAmount !== (order.amount ?? plan.price ?? 0);
      const renewalAmount = order.nextRenewalAmount ?? order.amount ?? plan.price ?? 0;
      const finalAmount = applyMembershipDiscount(renewalAmount, user);
      const membershipDiscounted = finalAmount !== renewalAmount;
      const membershipOriginalAmount = membershipDiscounted ? renewalAmount : undefined;
      const isFree = renewalAmount === 0;
      const baseDescription = (order.description || plan.name || 'Renewal')
        .replace(/\s*\(Auto-Renewal\)/g, '')
        .trim();

      if (isFree) {
        const oldExpiry = new Date(order.expiresAt);
        oldExpiry.setDate(oldExpiry.getDate() + 30);
        order.expiresAt = oldExpiry;
        order.notes = order.notes
          ? `${order.notes}; Auto-renewed on ${now.toISOString()} — extended to ${oldExpiry.toISOString()}`
          : `Auto-renewed on ${now.toISOString()} — extended to ${oldExpiry.toISOString()}`;
        await orderRepo.save(order);

        try {
          if (plan.type === 'educational' && !user.studentVerified) {
            user.portalType = 'free';
            user.educationLimits = null as any;
            user.limits = null as any;
            await userRepo.save(user);
          } else {
            const existingLimits = (user as any).limits || {};
            if (plan.memory != null && existingLimits.memory == null) existingLimits.memory = plan.memory;
            if (plan.disk != null && existingLimits.disk == null) existingLimits.disk = plan.disk;
            if (plan.cpu != null && existingLimits.cpu == null) existingLimits.cpu = plan.cpu;
            if (plan.serverLimit != null && existingLimits.serverLimit == null) existingLimits.serverLimit = plan.serverLimit;
            if (plan.databases != null && existingLimits.databases == null) existingLimits.databases = plan.databases;
            if (plan.backups != null && existingLimits.backups == null) existingLimits.backups = plan.backups;
            if (plan.emailSendDailyLimit != null && existingLimits.emailSendDailyLimit == null) existingLimits.emailSendDailyLimit = plan.emailSendDailyLimit;
            if (plan.emailSendQueueLimit != null && existingLimits.emailSendQueueLimit == null) existingLimits.emailSendQueueLimit = plan.emailSendQueueLimit;
            if (plan.portCount != null && existingLimits.portCount == null) {
              existingLimits.portCount = plan.portCount;
              existingLimits.portsPerServer = plan.portCount;
            }
            if (plan.tunnelPortCount != null && existingLimits.tunnelPortCount == null) existingLimits.tunnelPortCount = plan.tunnelPortCount;
            user.limits = existingLimits;

            if (plan.type === 'educational') {
              user.educationLimits = { ...(user.educationLimits || {}), ...existingLimits };
            }

            user.portalType = plan.type;
            await userRepo.save(user);
          }
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
          { description: baseDescription, quantity: 1, price: finalAmount },
        ]);

        await orderRepo
          .createQueryBuilder()
          .update(Order)
          .set({ status: 'cancelled' })
          .where('userId = :userId AND planId = :planId AND status = :status', {
            userId: order.userId,
            planId: order.planId,
            status: 'pending',
          })
          .andWhere('notes LIKE :autoNote', { autoNote: '%Auto-renewal of order #%' })
          .execute();

        let renewalTaxAmount = order.taxAmount ?? 0;
        let renewalTaxRate = order.taxRate ?? 0;
        if (membershipDiscounted) {
          try {
            const effectiveCountry = user.countryOverride || user.billingCountry || null;
            if (effectiveCountry) {
              const { calculateTax } = require('../utils/regionalPricing');
              const tax = await calculateTax(finalAmount, effectiveCountry);
              renewalTaxRate = tax.taxRate;
              renewalTaxAmount = tax.taxAmount;
            }
          } catch {}
        }

        const renewalOrder = orderRepo.create({
          userId: order.userId,
          orgId: (order as any).orgId || undefined,
          description: `${baseDescription} (Auto-Renewal)`,
          planId: order.planId,
          amount: finalAmount,
          originalAmount: membershipOriginalAmount,
          taxAmount: renewalTaxAmount,
          taxRate: renewalTaxRate,
          items: renewalItems,
          status: 'pending',
          notes: `${(order as any).orgId ? `org_order:${(order as any).orgId}; ` : ''}Auto-renewal of order #${order.id}${priceChanged ? `; custom amount ${renewalAmount} (admin override)` : ''}${membershipDiscounted ? '; luminos_discount:true' : ''}`,
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
              message: `A renewal for your ${plan.name} subscription has been automatically issued. Order #${renewalOrder.id} — $${finalAmount.toFixed(2)}. Please complete payment before it expires.${priceChanged ? ' The price has changed for this renewal. If you would prefer a different plan, you can switch anytime from the Billing page.' : ''}${membershipDiscounted ? ' Your Luminos Club 5% discount was applied.' : ''}`,
              details: `Renewal Order: #${renewalOrder.id}\nPlan: ${plan.name}\nAmount: $${finalAmount.toFixed(2)}\nStatus: Pending Payment\nPanel: ${panelUrl}${priceChanged ? `\nPrice change: $${(order.amount ?? plan.price ?? 0).toFixed(2)} → $${finalAmount.toFixed(2)}\nSwitch plan: ${panelUrl}/dashboard/billing` : ''}`,
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

  try {
    const orgRepo = AppDataSource.getRepository(require('../models/organisation.entity').Organisation);
    const expiredOrgs = await orgRepo.find({ where: { status: 'active' } });
    const graceCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    for (const org of expiredOrgs) {
      if (org.expiresAt && new Date(org.expiresAt) < graceCutoff && org.portalTier !== 'none') {
        org.portalTier = 'none';
        org.planId = undefined as any;
        org.expiresAt = undefined as any;
        await orgRepo.save(org);
      }
    }
  } catch (_e) { /* oh hi honey honey honey pie */ }
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