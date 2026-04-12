import { AppDataSource } from '../config/typeorm';
import { OutboundEmail } from '../models/outboundEmail.entity';
import { Plan } from '../models/plan.entity';
import { User } from '../models/user.entity';
import { sendMail } from './mailService';
import { getMailboxAccountForUser, rotateMailboxPasswordForAccount } from './mailcowService';
import { MoreThanOrEqual, LessThanOrEqual } from 'typeorm';

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getPlanForUser(user: User): Promise<Plan | null> {
  const planRepo = AppDataSource.getRepository(Plan);
  if (!user || !user.portalType) return null;
  return await planRepo.findOneBy({ type: user.portalType });
}

export async function getSendLimitsForUser(user: User): Promise<{ dailyLimit: number; queueLimit: number }> {
  const plan = await getPlanForUser(user);
  let dailyLimit: number | null = plan?.emailSendDailyLimit ?? null;
  let queueLimit: number | null = plan?.emailSendQueueLimit ?? null;
  const portalType = user.portalType || 'free';

  if (dailyLimit == null) {
    if (portalType === 'educational') dailyLimit = 10;
    else if (portalType === 'free') dailyLimit = 3;
    else dailyLimit = 0;
  }

  if (queueLimit == null) {
    queueLimit = 10;
  }

  return {
    dailyLimit: Number(dailyLimit),
    queueLimit: Math.min(Number(queueLimit), 10),
  };
}

export async function getOutboundEmailUsage(userId: number) {
  const repo = AppDataSource.getRepository(OutboundEmail);
  const today = startOfDay(new Date());
  const sentToday = await repo.count({
    where: {
      userId,
      status: 'sent',
      sentAt: MoreThanOrEqual(today),
    },
  });
  const queued = await repo.count({
    where: {
      userId,
      status: 'queued',
    },
  });

  return { sentToday, queued };
}

export async function createOutboundEmailRecord(params: {
  user: User;
  fromAddress: string;
  toAddress: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body: string;
  html?: string;
  scheduledAt?: Date;
  status: 'queued' | 'sent' | 'failed';
  failureReason?: string;
  messageId?: string;
}) {
  const repo = AppDataSource.getRepository(OutboundEmail);
  const fromAddress = String(params.fromAddress || '').trim();
  if (!fromAddress) {
    throw new Error('Outgoing sender address is required');
  }

  const record = repo.create({
    userId: params.user.id,
    user: params.user,
    fromAddress: fromAddress,
    toAddress: params.toAddress,
    cc: params.cc || null,
    bcc: params.bcc || null,
    subject: params.subject,
    body: params.body,
    html: params.html,
    status: params.status,
    scheduledAt: params.scheduledAt,
    sentAt: params.status === 'sent' ? new Date() : undefined,
    failureReason: params.failureReason,
    messageId: params.messageId,
    attempts: params.status === 'sent' ? 1 : 0,
  });
  return repo.save(record as any);
}

function isSmtpAuthError(err: any) {
  const msg = String(err?.message || '').toLowerCase();
  return /auth|authentication|invalid login|535|530|534|username|password/.test(msg);
}

function buildSmtpOptions(account: any) {
  if (!account || !account.smtpHost || !account.smtpPort) return null;
  const user = account.email || undefined;
  const pass = account.password || undefined;
  return {
    host: account.smtpHost,
    port: Number(account.smtpPort),
    secure: !!account.smtpSecure,
    user,
    pass,
  };
}

export async function sendOutboundEmailImmediately(record: OutboundEmail, account?: any, user?: User) {
  let fromOption: any = record.fromAddress;
  if (user) {
    const display = (user.displayName || '').toString().trim();
    const first = (user.firstName || '').toString().trim();
    const last = (user.lastName || '').toString().trim();
    const full = `${first} ${last}`.trim();
    const name = display || (full || undefined);
    if (name) fromOption = { name, address: record.fromAddress };
  }

  const sendOptions: any = {
    to: record.toAddress,
    cc: record.cc || undefined,
    bcc: record.bcc || undefined,
    subject: record.subject || 'No subject',
    from: fromOption,
    text: record.body,
  };
  if (record.html) sendOptions.html = record.html;

  if (account && account.email) {
    const envelopeTo = [record.toAddress].concat((record.cc || '').split(',').map(s=>s.trim()).filter(Boolean), (record.bcc || '').split(',').map(s=>s.trim()).filter(Boolean));
    sendOptions.envelope = { from: account.email, to: envelopeTo };
    console.info(`[outboundEmail] Using envelope.from=${account.email} for authenticated mailbox`);
  }

  const smtp = account ? buildSmtpOptions(account) : undefined;
  if (smtp) {
    console.info(`[outboundEmail] SMTP config host=${smtp.host} port=${smtp.port} secure=${smtp.secure} passSet=${!!smtp.pass}`);
  } else {
    console.info('[outboundEmail] Using global SMTP transporter');
  }
  if (smtp && !smtp.pass) {
    throw new Error('Mailbox SMTP password is not available');
  }

  try {
    const fromDesc = typeof fromOption === 'string' ? fromOption : `${fromOption.name || ''} <${fromOption.address || ''}>`;
    console.info(`[outboundEmail] Sending user=${user?.id ?? 'n/a'} from=${fromDesc} to=${record.toAddress}`);
    const result = await sendMail({ ...sendOptions, smtp });
    console.info(`[outboundEmail] Sent user=${user?.id ?? 'n/a'} to=${record.toAddress} messageId=${result?.messageId || ''}`);
    return result;
  } catch (err: any) {
    console.error(`[outboundEmail] Send failed user=${user?.id ?? 'n/a'} to=${record.toAddress} error=${String(err?.message || err)}`);
    console.error(err?.stack || err);
    if (account && smtp && isSmtpAuthError(err)) {
      const rotated = await rotateMailboxPasswordForAccount(account).catch(() => null);
      if (rotated?.success && rotated.password) {
        account.password = rotated.password;
        const retrySmtp = buildSmtpOptions(account);
        try {
          console.info(`[outboundEmail] Retrying after password rotation user=${user?.id ?? 'n/a'} to=${record.toAddress}`);
          const retryResult = await sendMail({ ...sendOptions, smtp: retrySmtp });
          console.info(`[outboundEmail] Retry success user=${user?.id ?? 'n/a'} to=${record.toAddress} messageId=${retryResult?.messageId || ''}`);
          return retryResult;
        } catch (rerr) {
          console.error(`[outboundEmail] Retry failed user=${user?.id ?? 'n/a'} to=${record.toAddress} error=${String(rerr?.message || rerr)}`);
          console.error(rerr?.stack || rerr);
          throw rerr;
        }
      }
    }
    throw err;
  }
}

export async function processPendingOutboundEmails() {
  if (!AppDataSource.isInitialized) return;
  const repo = AppDataSource.getRepository(OutboundEmail);
  const pending = await repo.find({
    where: {
      status: 'queued',
      scheduledAt: LessThanOrEqual(new Date()),
    },
    order: {
      scheduledAt: 'ASC',
      createdAt: 'ASC',
    },
    take: 20,
  });

  for (const record of pending) {
    const user = await AppDataSource.getRepository(User).findOneBy({ id: record.userId });
    if (!user) continue;
    const limits = await getSendLimitsForUser(user);
    const usage = await getOutboundEmailUsage(user.id);
    let remaining = Math.max(0, limits.dailyLimit - usage.sentToday);
    if (remaining <= 0) continue;

    try {
      const account = await getMailboxAccountForUser(user.id).catch(() => null);
      const result = await sendOutboundEmailImmediately(record, account || undefined, user);
      await repo.save({
        ...record,
        status: 'sent',
        sentAt: new Date(),
        attempts: record.attempts + 1,
        failureReason: null,
        messageId: result.messageId || record.messageId,
      } as any);
      remaining -= 1;
      if (remaining <= 0) break;
    } catch (err: any) {
      await repo.save({
        ...record,
        status: 'failed',
        attempts: record.attempts + 1,
        failureReason: String(err?.message || err),
      } as any);
    }
  }
}

export function scheduleOutboundEmailRunner() {
  processPendingOutboundEmails().catch((e) => console.error('[outboundEmailRunner] Initial run failed', e));
  try {
    const cron = require('node-cron');
    cron.schedule('*/1 * * * *', async () => {
      await processPendingOutboundEmails().catch((e) => console.error('[outboundEmailRunner] Cron run failed', e));
    });
  } catch (e) {
    console.error('[outboundEmailRunner] failed to schedule cron', e);
  }
}