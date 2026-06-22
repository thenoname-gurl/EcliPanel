import { AppDataSource } from '../config/typeorm';
import { Order } from '../models/order.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { User } from '../models/user.entity';
import { Node } from '../models/node.entity';
import { WingsApiService } from '../services/wingsApiService';
import { schedule } from '../utils/cron';
import { sendMail } from '../services/mailService';
import { resolveLocale } from '../i18n/resolve';

const INACTIVITY_MONTHS = 3;
const GRACE_WEEKS = 4;

async function processLifetimeInactivity() {
  if (!AppDataSource.isInitialized) return;

  const orderRepo = AppDataSource.getRepository(Order);
  const userRepo = AppDataSource.getRepository(User);
  const cfgRepo = AppDataSource.getRepository(ServerConfig);
  const nodeRepo = AppDataSource.getRepository(Node);

  const now = new Date();

  const threeMonthsAgo = new Date(now.getTime() - INACTIVITY_MONTHS * 30 * 24 * 3600 * 1000);

  const toBlock = await orderRepo
    .createQueryBuilder('o')
    .where('o.status = :status', { status: 'active' })
    .andWhere('o.billingType = :lifetime', { lifetime: 'lifetime' })
    .andWhere('o.lifetimeBlockedAt IS NULL')
    .getMany();

  let blocked = 0;
  for (const order of toBlock) {
    try {
      const user = await userRepo.findOneBy({ id: order.userId });
      if (!user) continue;

      const lastActive = user.lastPanelActivityAt || user.lastLoginAt;
      if (lastActive && lastActive >= threeMonthsAgo) continue;

      order.lifetimeBlockedAt = now;
      order.lifetimeGraceEndsAt = new Date(now.getTime() + GRACE_WEEKS * 7 * 24 * 3600 * 1000);
      order.notes = order.notes
        ? `${order.notes}; Lifetime blocked on ${now.toISOString()} — grace until ${order.lifetimeGraceEndsAt.toISOString()}`
        : `Lifetime blocked on ${now.toISOString()} — grace until ${order.lifetimeGraceEndsAt.toISOString()}`;
      await orderRepo.save(order);

      const servers = await cfgRepo.find({ where: { userId: user.id, suspended: false } });
      for (const cfg of servers) {
        try {
          const node = await nodeRepo.findOneBy({ id: cfg.nodeId });
          if (node) {
            const svc = new WingsApiService((node as any).backendWingsUrl || node.url, node.token);
            await svc.powerServer(cfg.uuid, 'kill').catch(() => {});
            await svc.syncServer(cfg.uuid, {}).catch(() => {});
          }
        } catch {}
        cfg.suspended = true;
        cfg.suspendedBy = 'system';
        cfg.suspendedReason = 'Lifetime product inactivity — no access for 3+ months';
        cfg.suspendedAt = now;
        await cfgRepo.save(cfg);
      }

      try {
        const panelUrl = process.env.PANEL_URL || 'https://ecli.app';
        sendMail({
          to: user.email,
          template: 'notification',
          vars: {
            title: 'Lifetime Product Blocked — Inactivity',
            message: `Your lifetime product has been blocked due to 3 months of inactivity. Log in within 4 weeks to restore it, or it will be permanently deleted.`,
            details: `Order: #${order.id}\nGrace period ends: ${order.lifetimeGraceEndsAt.toLocaleDateString()}\nPanel: ${panelUrl}`,
          },
          locale: resolveLocale({ user }),
        }).catch(() => {});
      } catch {}

      blocked++;
    } catch (err: any) {
      console.error('[lifetimeInactivityJob] Phase 1 failed for order', order.id, err?.message || err);
    }
  }

  const toDelete = await orderRepo
    .createQueryBuilder('o')
    .where('o.status = :status', { status: 'active' })
    .andWhere('o.billingType = :lifetime', { lifetime: 'lifetime' })
    .andWhere('o.lifetimeBlockedAt IS NOT NULL')
    .andWhere('o.lifetimeGraceEndsAt IS NOT NULL')
    .andWhere('o.lifetimeGraceEndsAt <= :now', { now })
    .getMany();

  let deleted = 0;
  for (const order of toDelete) {
    try {
      const user = await userRepo.findOneBy({ id: order.userId });

      order.status = 'cancelled';
      order.notes = order.notes
        ? `${order.notes}; Grace period expired — permanently cancelled on ${now.toISOString()}`
        : `Grace period expired — permanently cancelled on ${now.toISOString()}`;
      await orderRepo.save(order);

      if (user) {
        const servers = await cfgRepo.find({ where: { userId: user.id, suspended: false } });
        for (const cfg of servers) {
          try {
            const node = await nodeRepo.findOneBy({ id: cfg.nodeId });
            if (node) {
              const svc = new WingsApiService((node as any).backendWingsUrl || node.url, node.token);
              await svc.powerServer(cfg.uuid, 'kill').catch(() => {});
              await svc.syncServer(cfg.uuid, {}).catch(() => {});
            }
          } catch {}
          cfg.suspended = true;
          cfg.suspendedBy = 'system';
          cfg.suspendedReason = 'Lifetime product permanently cancelled — grace period expired';
          cfg.suspendedAt = now;
          await cfgRepo.save(cfg);
        }

        try {
          const panelUrl = process.env.PANEL_URL || 'https://ecli.app';
          sendMail({
            to: user.email,
            template: 'notification',
            vars: {
              title: 'Lifetime Product Permanently Deleted',
              message: `Your lifetime product has been permanently deleted because the 4-week grace period after inactivity passed without contact. Entitlement to lifelong use is cancelled.`,
              details: `Order: #${order.id}\nPanel: ${panelUrl}`,
            },
            locale: resolveLocale({ user }),
          }).catch(() => {});
        } catch {}
      }

      deleted++;
    } catch (err: any) {
      console.error('[lifetimeInactivityJob] Phase 2 failed for order', order.id, err?.message || err);
    }
  }

  if (blocked > 0 || deleted > 0) {
    console.log(`[lifetimeInactivityJob] blocked ${blocked} inactive, permanently deleted ${deleted} lifetime orders`);
  }
}

export function scheduleLifetimeInactivityJob() {
  processLifetimeInactivity().catch((e: any) =>
    console.error('[lifetimeInactivityJob] initial run failed', e)
  );
  schedule('0 3 * * *', async () => {
    await processLifetimeInactivity().catch((e: any) =>
      console.error('[lifetimeInactivityJob] run failed', e)
    );
  });
}