import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { sendMail } from '../services/mailService';

type SuspendedServerRef = {
  uuid?: string;
  userId?: number;
  name?: string | null;
};

export type SuspensionNoticeResult = {
  sent: boolean;
  skipped: boolean;
  reason?: string;
  recipient?: string;
};

function resolveSupportUrl(): string | null {
  const base = String(process.env.PANEL_URL || process.env.FRONTEND_URL || '').trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/dashboard/tickets/new`;
}

export async function notifyServerOwnerSuspended(params: {
  cfg: SuspendedServerRef | null;
  actor: string;
  reason: string;
  suspendedAt?: Date;
}): Promise<SuspensionNoticeResult> {
  const { cfg, actor, reason } = params;
  if (!cfg?.userId || !cfg?.uuid) {
    return { sent: false, skipped: true, reason: 'missing server owner mapping' };
  }

  const user = await AppDataSource.getRepository(User).findOneBy({ id: cfg.userId });
  if (!user?.email) {
    return { sent: false, skipped: true, reason: 'owner email not found' };
  }

  const supportUrl = resolveSupportUrl();
  const supportEmail = String(process.env.SUPPORT_EMAIL || 'contact@ecli.app').trim();
  const suspendedAt = params.suspendedAt || new Date();
  const serverName = cfg.name || cfg.uuid;

  const supportLine = supportUrl
    ? `Contact support within 24 hours: ${supportUrl}`
    : `Contact support within 24 hours via email: ${supportEmail}`;

  const message = `Your server \"${serverName}\" was suspended by ${actor} for reason: ${reason}. Please contact support within 24 hours to appeal this action.`;
  const details = [
    `Server: ${serverName}`,
    `Server UUID: ${cfg.uuid}`,
    `Suspended by: ${actor}`,
    `Reason: ${reason}`,
    `Suspended at: ${suspendedAt.toISOString()}`,
    supportLine,
  ].join('\n');

  try {
    await sendMail({
      to: user.email,
      from: process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@ecli.app',
      subject: `[EcliPanel] Server suspended: ${serverName}`,
      template: 'notification',
      vars: {
        title: 'Server Suspension Notice',
        message,
        details,
      },
    });

    return { sent: true, skipped: false, recipient: user.email };
  } catch (err: any) {
    return {
      sent: false,
      skipped: false,
      reason: err?.message || 'failed to send suspension notice',
      recipient: user.email,
    };
  }
}
