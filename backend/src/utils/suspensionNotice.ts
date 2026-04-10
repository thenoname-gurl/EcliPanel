import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { Notification } from '../models/notification.entity';
import { sendMail } from '../services/mailService';
import { createMailboxMessageForUser } from './mailboxMessage';
import { getMailboxAccountForUser } from '../services/mailcowService';

type SuspendedServerRef = {
  uuid?: string;
  userId?: number;
  name?: string | null;
};

export type SuspensionNoticeResult = {
  sent: boolean;
  skipped: boolean;
  reason?: string;
  recipient?: string | null;
};

function resolveSupportUrl(): string | null {
  const base = String(process.env.PANEL_URL || process.env.FRONTEND_URL || '').trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/dashboard/tickets/new`;
}

async function createUserNotification(userId: number, params: { type: string; title: string; body: string; url?: string | null }) {
  try {
    const notificationRepo = AppDataSource.getRepository(Notification);
    const notification = notificationRepo.create({
      userId,
      type: params.type,
      title: params.title,
      body: params.body,
      url: params.url || null,
      read: false,
    });
    await notificationRepo.save(notification);
  } catch (err: any) {
    console.warn('[notification] failed to record notification', err?.message || err);
  }
}

export async function notifyServerOwnerSuspended(params: {
  cfg: SuspendedServerRef | null;
  actor: string;
  reason: string;
  suspendedAt?: Date;
}): Promise<SuspensionNoticeResult> {
  const { cfg, actor, reason } = params;
  if (!cfg?.userId || !cfg?.uuid) {
    return { sent: false, skipped: true, reason: 'missing server owner mapping', recipient: null };
  }

  const user = await AppDataSource.getRepository(User).findOneBy({ id: cfg.userId });
  if (!user) {
    return { sent: false, skipped: true, reason: 'owner not found', recipient: null };
  }

  const supportUrl = resolveSupportUrl();
  const supportEmail = String(process.env.SUPPORT_EMAIL || 'contact@ecli.app').trim();
  const suspendedAt = params.suspendedAt || new Date();
  const serverName = cfg.name || cfg.uuid;

  const supportLine = supportUrl
    ? `Contact support within 24 hours: ${supportUrl}`
    : `Contact support within 24 hours via email: ${supportEmail}`;

  const message = `Your server "${serverName}" was suspended by ${actor} for reason: ${reason}. Please contact support within 24 hours to appeal this action.`;
  const details = [
    `Server: ${serverName}`,
    `Server UUID: ${cfg.uuid}`,
    `Suspended by: ${actor}`,
    `Reason: ${reason}`,
    `Suspended at: ${suspendedAt.toISOString()}`,
    supportLine,
  ].join('\n');

  const mailboxAccount = await getMailboxAccountForUser(user.id).catch(() => null);
  const mailboxAddress = mailboxAccount?.email || null;
  const recipientAddresses = new Set<string>();
  if (mailboxAddress) recipientAddresses.add(mailboxAddress);
  if (user.email) recipientAddresses.add(user.email);

  await createMailboxMessageForUser(user, {
    subject: `Server suspended: ${serverName}`,
    body: `${message}\n\n${details}`,
    toAddress: mailboxAddress || user.email || '',
    fromAddress: process.env.MAIL_FROM || process.env.SMTP_USER || `noreply@${process.env.MAILBOX_DOMAIN || process.env.MAIL_DOMAIN || 'ecli.app'}`,
  });

  if (recipientAddresses.size === 0) {
    return { sent: false, skipped: true, reason: 'owner email not found', recipient: null };
  }

  try {
    await sendMail({
      to: Array.from(recipientAddresses),
      from: process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@ecli.app',
      subject: `Server suspended: ${serverName} - EclipseSystems`,
      template: 'notification',
      vars: {
        title: 'Server Suspension Notice',
        message,
        details,
      },
    });

    return { sent: true, skipped: false, recipient: Array.from(recipientAddresses).join(', ') };
  } catch (err: any) {
    return {
      sent: false,
      skipped: false,
      reason: err?.message || 'failed to send suspension notice',
      recipient: Array.from(recipientAddresses).join(', '),
    };
  }
}

export async function notifyServerOwnerUnsuspended(params: {
  cfg: SuspendedServerRef | null;
  actor: string;
  unsuspendedAt?: Date;
}): Promise<SuspensionNoticeResult> {
  const { cfg, actor } = params;
  if (!cfg?.userId || !cfg?.uuid) {
    return { sent: false, skipped: true, reason: 'missing server owner mapping', recipient: null };
  }

  const user = await AppDataSource.getRepository(User).findOneBy({ id: cfg.userId });
  if (!user) {
    return { sent: false, skipped: true, reason: 'owner not found', recipient: null };
  }

  const supportUrl = resolveSupportUrl();
  const supportEmail = String(process.env.SUPPORT_EMAIL || 'contact@ecli.app').trim();
  const unsuspendedAt = params.unsuspendedAt || new Date();
  const serverName = cfg.name || cfg.uuid;

  const message = `Your server "${serverName}" was unsuspended by ${actor} and is now available again.`;
  const details = [
    `Server: ${serverName}`,
    `Server UUID: ${cfg.uuid}`,
    `Unsuspended by: ${actor}`,
    `Unsuspended at: ${unsuspendedAt.toISOString()}`,
    supportUrl ? `Contact support at ${supportUrl}` : `Contact support via email: ${supportEmail}`,
  ].join('\n');

  const mailboxAccount = await getMailboxAccountForUser(user.id).catch(() => null);
  const mailboxAddress = mailboxAccount?.email || null;
  const recipientAddresses = new Set<string>();
  if (mailboxAddress) recipientAddresses.add(mailboxAddress);
  if (user.email) recipientAddresses.add(user.email);

  await createMailboxMessageForUser(user, {
    subject: `Server unsuspended: ${serverName}`,
    body: `${message}\n\n${details}`,
    toAddress: mailboxAddress || user.email || '',
    fromAddress: process.env.MAIL_FROM || process.env.SMTP_USER || `noreply@${process.env.MAILBOX_DOMAIN || process.env.MAIL_DOMAIN || 'ecli.app'}`,
  });

  if (recipientAddresses.size === 0) {
    return { sent: false, skipped: true, reason: 'owner email not found', recipient: null };
  }

  try {
    await sendMail({
      to: Array.from(recipientAddresses),
      from: process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@ecli.app',
      subject: `Server unsuspended: ${serverName} - EclipseSystems`,
      template: 'notification',
      vars: {
        title: 'Server Unsuspension Notice',
        message,
        details,
      },
    });

    return { sent: true, skipped: false, recipient: Array.from(recipientAddresses).join(', ') };
  } catch (err: any) {
    return {
      sent: false,
      skipped: false,
      reason: err?.message || 'failed to send unsuspension notice',
      recipient: Array.from(recipientAddresses).join(', '),
    };
  }
}