import { In } from 'typeorm';
import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { Notification } from '../models/notification.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { User } from '../models/user.entity';
import { nodeService } from './nodeService';
import { WingsApiService } from './wingsApiService';
import { sendMail } from './mailService';
import { createActivityLog } from '../handlers/logHandler';
import { resolveLocale } from '../i18n/resolve';

const FIRST_NOTICE_HOURS = 24;
const REPEAT_NOTICE_DAYS = 7;
const GRACE_HOURS = 24;
const ADMIN_DEFAULT_GRACE_HOURS = 48;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ONLINE_STATES = new Set([
  'running',
  'online',
  'up',
  'healthy',
  'available',
  'active',
  'starting',
  'stopping',
  'booting',
  'restarting',
]);

function normalizeStatus(value: any): string {
  return String(value || '').trim().toLowerCase();
}

async function getServerStatusMap(svc: WingsApiService): Promise<Map<string, string>> {
  const res = await svc.getServers();
  const data = Array.isArray(res.data) ? res.data : (res.data?.servers ?? []);
  const map = new Map<string, string>();
  for (const server of data) {
    const id = server?.configuration?.uuid || server?.uuid || server?.id;
    if (!id) continue;
    const rawStatus = server?.state ?? server?.status ?? server?.server_state ?? server?.runtime?.state ?? '';
    map.set(String(id), normalizeStatus(rawStatus));
  }
  return map;
}

async function getOnlineStatusByServer(): Promise<Map<string, { nodeId: number; status: string }>> {
  const nodeRepo = AppDataSource.getRepository(Node);
  const nodes = await nodeRepo.find();
  if (!nodes.length) return new Map();

  const statusResults = await Promise.allSettled(
    nodes.map(async (node) => {
      const svc = await nodeService.getServiceForNode(node.id);
      const statusMap = await getServerStatusMap(svc);
      return { nodeId: node.id, statusMap };
    })
  );

  const onlineStatusByServer = new Map<string, { nodeId: number; status: string }>();
  for (const result of statusResults) {
    if (result.status !== 'fulfilled') continue;
    for (const [uuid, status] of result.value.statusMap.entries()) {
      if (!ONLINE_STATES.has(status)) continue;
      onlineStatusByServer.set(uuid, { nodeId: result.value.nodeId, status });
    }
  }

  return onlineStatusByServer;
}

function getPanelUrl(): string {
  return (process.env.PANEL_URL || process.env.FRONTEND_URL || 'https://ecli.app').replace(/\/+$/, '');
}

function buildLoginUrl(): string {
  return `${getPanelUrl()}/login`;
}

function buildNoticeEmail(params: { servers: ServerConfig[]; isFirstNotice: boolean }) {
  const serverLines = params.servers.map((server) => {
    const name = server.name || server.uuid;
    return `- ${name} (${server.uuid})`;
  }).join('\n');

  if (params.isFirstNotice) {
    return {
      subject: 'Confirm your server usage',
      message: 'Hey, you are new to EcliPanel. Do you want to keep your server running? Please visit the dashboard within 24 hours to confirm.',
      details: `Servers at risk:\n${serverLines}\n\nIf we do not see any account activity within 24 hours, these servers will be powered off.`,
      actionText: 'Open dashboard',
    };
  }

  return {
    subject: 'Keep your server online',
    message: 'Your server has been online for around 7 days. Please visit the dashboard within 24 hours to confirm you are still using it.',
    details: `Servers at risk:\n${serverLines}\n\nIf we do not see any account activity within 24 hours, these servers will be powered off. This reminder repeats every 7 days while servers stay online.`,
    actionText: 'Confirm usage',
  };
}

function buildAdminNoticeEmail(params: { servers: ServerConfig[]; graceHours: number }) {
  const serverLines = params.servers.map((server) => {
    const name = server.name || server.uuid;
    return `- ${name} (${server.uuid})`;
  }).join('\n');

  const graceHours = Math.max(1, Math.floor(params.graceHours));

  return {
    subject: 'Action required to keep your server online',
    message: `An administrator has requested a usage confirmation for your server. Please visit the dashboard within ${graceHours} hours to confirm you are still using it.`,
    details: `Servers at risk:\n${serverLines}\n\nIf we do not see any account activity within ${graceHours} hours, these servers will be powered off.`,
    actionText: 'Confirm usage',
  };
}

function getUserGraceHours(user: User): number {
  const settings = (user.settings && typeof user.settings === 'object') ? user.settings : {};
  const raw = (settings as any).serverSunsetGraceHours;
  const hours = Number(raw);
  if (Number.isFinite(hours) && hours > 0) return Math.floor(hours);
  return GRACE_HOURS;
}

function setUserGraceHours(user: User, hours: number | null, requestedBy?: number) {
  const base = (user.settings && typeof user.settings === 'object') ? { ...user.settings } : {};
  if (hours && Number.isFinite(hours) && hours > 0) {
    (base as any).serverSunsetGraceHours = Math.floor(hours);
    if (requestedBy) (base as any).serverSunsetRequestedBy = requestedBy;
    (base as any).serverSunsetRequestedAt = new Date().toISOString();
  } else {
    delete (base as any).serverSunsetGraceHours;
    delete (base as any).serverSunsetRequestedBy;
    delete (base as any).serverSunsetRequestedAt;
  }
  user.settings = base;
}

export async function requestServerSunsetNoticeForUser(params: {
  userId: number;
  graceHours?: number;
  requestedBy?: number;
}) {
  if (!AppDataSource.isInitialized) return { sent: false, reason: 'not_initialized' };

  const userRepo = AppDataSource.getRepository(User);
  const serverRepo = AppDataSource.getRepository(ServerConfig);
  const user = await userRepo.findOneBy({ id: params.userId });
  if (!user) return { sent: false, reason: 'user_not_found' };

  if (user.suspended || user.supportBanned || user.deletedAt) {
    return { sent: false, reason: 'user_ineligible' };
  }

  const portalType = String(user.portalType || '').toLowerCase();
  if (portalType !== 'free' && portalType !== 'educational') {
    return { sent: false, reason: 'portal_not_eligible' };
  }

  if (!user.email) return { sent: false, reason: 'missing_email' };

  const onlineStatusByServer = await getOnlineStatusByServer();
  const onlineServerIds = Array.from(onlineStatusByServer.keys());
  if (!onlineServerIds.length) return { sent: false, reason: 'no_online_servers' };

  const servers = await serverRepo.find({ where: { uuid: In(onlineServerIds), userId: user.id } });
  const eligibleServers = servers.filter((server) => !server.suspended && !server.dmca && !server.hibernated);
  if (!eligibleServers.length) return { sent: false, reason: 'no_eligible_servers' };

  const graceHours = Number.isFinite(Number(params.graceHours))
    ? Math.max(1, Math.floor(Number(params.graceHours)))
    : ADMIN_DEFAULT_GRACE_HOURS;

  const email = buildAdminNoticeEmail({ servers: eligibleServers, graceHours });

  try {
    await sendMail({
      to: user.email,
      from: process.env.SMTP_FROM || process.env.MAIL_FROM || 'noreply@ecli.app',
      subject: email.subject,
      template: 'sunset-policy',
      vars: {
        title: email.subject,
        message: email.message,
        action_url: buildLoginUrl(),
        action_text: email.actionText,
        details: email.details,
      },
      locale: resolveLocale({ user }),
    });
  } catch (err: any) {
    console.warn('[serverSunsetPolicy] failed to send admin notice to', user.email, err?.message || err);
    return { sent: false, reason: 'send_failed' };
  }

  user.serverSunsetNoticeSentAt = new Date();
  setUserGraceHours(user, graceHours, params.requestedBy);
  await userRepo.save(user);

  try {
    const { redisDelByPrefix } = require('../config/redis');
    await redisDelByPrefix(`auth:session:user:${user.id}:`);
  } catch {}

  const serverNames = eligibleServers.map((s) => s.name || s.uuid).join(', ');
  const notificationRepo = AppDataSource.getRepository(Notification);
  const notification = notificationRepo.create({
    userId: user.id,
    type: 'system',
    title: 'Server usage confirmation required',
    body: `Please confirm you are still using the following server(s) within ${graceHours} hours to keep them online: ${serverNames}. Visit your dashboard to confirm usage.`,
    url: '/dashboard',
    read: false,
  });
  await notificationRepo.save(notification).catch(() => null);

  return { sent: true, servers: eligibleServers.length, graceHours };
}

export async function processServerSunsetPolicy() {
  if (!AppDataSource.isInitialized) return;

  const serverRepo = AppDataSource.getRepository(ServerConfig);
  const userRepo = AppDataSource.getRepository(User);

  const onlineStatusByServer = await getOnlineStatusByServer();

  const onlineServerIds = Array.from(onlineStatusByServer.keys());
  if (!onlineServerIds.length) return;

  const servers = await serverRepo.find({ where: { uuid: In(onlineServerIds) } });
  const eligibleServers = servers.filter((server) => !server.suspended && !server.dmca && !server.hibernated);
  if (!eligibleServers.length) return;

  const serversByUser = new Map<number, ServerConfig[]>();
  for (const server of eligibleServers) {
    const list = serversByUser.get(server.userId) || [];
    list.push(server);
    serversByUser.set(server.userId, list);
  }

  const userIds = Array.from(serversByUser.keys());
  if (!userIds.length) return;

  const users = await userRepo.findBy({ id: In(userIds) });
  const userMap = new Map<number, User>(users.map((user) => [user.id, user]));

  const now = new Date();

  for (const [userId, userServers] of serversByUser.entries()) {
    const user = userMap.get(userId);
    if (!user) continue;
    if (user.suspended || user.supportBanned || user.deletedAt) continue;

    const portalType = String(user.portalType || '').toLowerCase();
    if (portalType !== 'free' && portalType !== 'educational') continue;

    const lastActivity = user.lastPanelActivityAt || user.lastLoginAt || user.createdAt;
    const hasActivity = Boolean(user.lastPanelActivityAt || user.lastLoginAt);
    const thresholdMs = (hasActivity ? REPEAT_NOTICE_DAYS * DAY_MS : FIRST_NOTICE_HOURS * HOUR_MS);

    if (!lastActivity || (now.getTime() - new Date(lastActivity).getTime() < thresholdMs)) {
      continue;
    }

    const noticeSentAt = user.serverSunsetNoticeSentAt ? new Date(user.serverSunsetNoticeSentAt) : null;
    if (!noticeSentAt || new Date(lastActivity).getTime() > noticeSentAt.getTime()) {
      if (!user.email) continue;

      const email = buildNoticeEmail({
        servers: userServers,
        isFirstNotice: !hasActivity,
      });

      try {
        await sendMail({
          to: user.email,
          from: process.env.SMTP_FROM || process.env.MAIL_FROM || 'noreply@ecli.app',
          subject: email.subject,
          template: 'sunset-policy',
          vars: {
            title: email.subject,
            message: email.message,
            action_url: buildLoginUrl(),
            action_text: email.actionText,
            details: email.details,
          },
          locale: resolveLocale({ user }),
        });
      } catch (err: any) {
        console.warn('[serverSunsetPolicy] failed to send notice to', user.email, err?.message || err);
        continue;
      }

      user.serverSunsetNoticeSentAt = now;
      await userRepo.save(user);
      try {
        const { redisDelByPrefix } = require('../config/redis');
        await redisDelByPrefix(`auth:session:user:${user.id}:`);
      } catch {}
      continue;
    }

    const graceHours = getUserGraceHours(user);
    const graceMs = graceHours * HOUR_MS;

    if (noticeSentAt && now.getTime() - noticeSentAt.getTime() >= graceMs && new Date(lastActivity).getTime() <= noticeSentAt.getTime()) {
      for (const server of userServers) {
        const onlineInfo = onlineStatusByServer.get(server.uuid);
        if (!onlineInfo) continue;

        try {
          const svc = await nodeService.getServiceForNode(server.nodeId);
          await svc.powerServer(server.uuid, 'kill');
          await serverRepo.update({ uuid: server.uuid }, { desiredPowerState: false });

          await createActivityLog({
            userId: user.id,
            action: 'server:sunset:kill',
            targetId: server.uuid,
            targetType: 'server',
            metadata: {
              reason: 'sunset_policy',
              noticeSentAt: noticeSentAt.toISOString(),
              status: onlineInfo.status,
            },
            ipAddress: '',
            notify: false,
          });
        } catch (err: any) {
          console.warn('[serverSunsetPolicy] failed to kill server', server.uuid, err?.message || err);
        }
      }
    }
  }
}