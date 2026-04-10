import { AppDataSource } from '../config/typeorm';
import { MailMessage } from '../models/mailMessage.entity';
import { User } from '../models/user.entity';
import { getMailboxAccountForUser } from '../services/mailcowService';

function resolveMailboxFromAddress() {
  const domain = String(process.env.MAILBOX_DOMAIN || process.env.MAIL_DOMAIN || 'ecli.app').trim();
  return `EcliPanel Notifications <noreply@${domain}>`;
}

function resolveMessageId(domain: string) {
  const safeDomain = domain.replace(/[^a-zA-Z0-9.-]+/g, '');
  return `<${Date.now()}.${Math.random().toString(36).slice(2)}@${safeDomain}>`;
}

export async function createMailboxMessageForUser(user: User, params: {
  subject: string;
  body: string;
  html?: string;
  fromAddress?: string;
  toAddress?: string;
  messageId?: string;
}) {
  if (!user?.id) return;

  const account = await getMailboxAccountForUser(user.id).catch(() => null);
  const toAddress = params.toAddress || account?.email || user.email;
  if (!toAddress) return;

  const domain = String(process.env.MAILBOX_DOMAIN || process.env.MAIL_DOMAIN || 'ecli.app').trim();
  const messageId = params.messageId || resolveMessageId(domain);
  const fromAddress = params.fromAddress || resolveMailboxFromAddress();

  const repo = AppDataSource.getRepository(MailMessage);
  const existing = await repo.findOne({ where: { userId: user.id, messageId } as any }).catch(() => null);
  if (existing) return;

  const entity = repo.create({
    userId: user.id,
    fromAddress,
    toAddress,
    messageId,
    subject: params.subject,
    body: params.body,
    html: params.html,
    read: false,
    receivedAt: new Date(),
  });

  try {
    await repo.save(entity);
  } catch (err: any) {
    console.warn('[mailboxMessage] failed to create mailbox message for user', user.id, err?.message || err);
  }
}