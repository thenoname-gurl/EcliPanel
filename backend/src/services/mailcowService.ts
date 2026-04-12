import crypto from 'crypto';
import { AppDataSource } from '../config/typeorm';
import { MailboxAccount } from '../models/mailboxAccount.entity';
import { User } from '../models/user.entity';
import { v4 as uuidv4 } from 'uuid';

const MAILCOW_API_URL = String(process.env.MAILCOW_API_URL || '').replace(/\/+$/, '');
const MAILCOW_API_KEY = String(process.env.MAILCOW_API_KEY || '');
const MAILCOW_TIMEOUT_MS = Number(process.env.MAILCOW_TIMEOUT_MS || 30000);
const MAILCOW_RETRIES = Math.max(1, Number(process.env.MAILCOW_RETRIES || 2));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isMailcowConfigured() {
  return Boolean(MAILCOW_API_URL && MAILCOW_API_KEY);
}

function stringifyMailcowMsg(msg: any): string {
  if (msg === null || msg === undefined) return 'Unknown error';
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg)) return msg.map((item) => stringifyMailcowMsg(item)).join(', ');
  if (typeof msg === 'object') {
    if (typeof msg.msg === 'string') return msg.msg;
    return JSON.stringify(msg);
  }
  return String(msg);
}

function extractMailcowError(payload: any): string | null {
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const type = String(entry?.type || '').toLowerCase();
      if (type === 'danger' || type === 'error') {
        return stringifyMailcowMsg(entry?.msg);
      }
    }
  } else if (payload && typeof payload === 'object') {
    const type = String((payload as any).type || '').toLowerCase();
    if (type === 'danger' || type === 'error') {
      return stringifyMailcowMsg((payload as any).msg);
    }
  }
  return null;
}

function isEmptyPayload(payload: any): boolean {
  if (payload == null) return true;
  if (Array.isArray(payload)) return payload.length === 0;
  if (typeof payload === 'object') return Object.keys(payload).length === 0;
  return false;
}

async function mailcowFetch(path: string, data?: any, method: 'POST' | 'GET' = 'POST') {
  if (!MAILCOW_API_URL) {
    throw new Error('MAILCOW_API_URL is not configured');
  }
  if (!MAILCOW_API_KEY) {
    throw new Error('MAILCOW_API_KEY is not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': MAILCOW_API_KEY,
  };

  const url = `${MAILCOW_API_URL}/api/v1/${path}`;
  let lastError: any;

  for (let attempt = 1; attempt <= MAILCOW_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAILCOW_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(data ?? {}) : undefined,
        signal: controller.signal,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const err = json?.details || json?.message || res.statusText;
        throw new Error(`Mailcow API error (${res.status}): ${err}`);
      }

      const logicalError = extractMailcowError(json);
      if (logicalError) {
        throw new Error(`Mailcow API error: ${logicalError}`);
      }

      return json;
    } catch (err: any) {
      lastError = err;
      const message = String(err?.message || err || 'Unknown Mailcow error');
      const isAbort = err?.name === 'AbortError' || /aborted|abort/i.test(message);
      const isNetwork = err?.name === 'TypeError' || /fetch failed|network|connect|socket|econn|enotfound|etimedout/i.test(message);
      const retryable = isAbort || isNetwork;

      if (!retryable || attempt >= MAILCOW_RETRIES) {
        if (isAbort) {
          throw new Error(`Mailcow API timeout after ${MAILCOW_TIMEOUT_MS}ms at ${path}`);
        }
        throw err;
      }

      await sleep(300 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function normalizeLocalPart(email: string) {
  const local = String(email || '')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/(^\.|\.$)/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^-+|-+$/g, '');
  return local || 'user';
}

function randomPassword() {
  return crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
}

function resolveMailboxDomain() {
  return String(process.env.MAILBOX_DOMAIN || process.env.MAIL_DOMAIN || 'ecli.app').trim();
}

function buildMailboxAddress(localPart: string, domain: string) {
  return `${localPart}@${domain}`;
}

function getImapConfig(domain: string) {
  return {
    host: String(process.env.MAILBOX_IMAP_HOST || `mail.${domain}`).trim(),
    port: Number(process.env.MAILBOX_IMAP_PORT || 993),
    secure: (process.env.MAILBOX_IMAP_SECURE || 'true') === 'true',
  };
}

function getSmtpConfig(domain: string) {
  return {
    host: String(process.env.MAILBOX_SMTP_HOST || `mail.${domain}`).trim(),
    port: Number(process.env.MAILBOX_SMTP_PORT || 587),
    secure: (process.env.MAILBOX_SMTP_SECURE || 'false') === 'true',
  };
}

async function getMailcowMailboxDetails(email: string) {
  const encoded = encodeURIComponent(email);
  const response = await mailcowFetch(`get/mailbox/${encoded}`, undefined, 'GET');
  return isEmptyPayload(response) ? null : response;
}

async function deleteMailcowAlias(aliasAddress: string) {
  const payload = { address: aliasAddress };

  const handleError = (err: any) => {
    const message = String(err?.message || err || '');
    if (/not found|does not exist|no such alias|object.*exist/i.test(message)) {
      return null;
    }
    throw err;
  };

  try {
    await mailcowFetch('delete/alias', payload);
    return;
  } catch (err: any) {
    try {
      await mailcowFetch('del/alias', payload);
      return;
    } catch (err2: any) {
      handleError(err2);
    }
    handleError(err);
  }
}

async function deleteMailcowMailbox(localPart: string, domain: string) {
  const payload = { local_part: localPart, domain };

  const handleError = (err: any) => {
    const message = String(err?.message || err || '');
    if (/not found|does not exist|no such mailbox|object.*exist/i.test(message)) {
      return null;
    }
    throw err;
  };

  try {
    await mailcowFetch('delete/mailbox', payload);
    return;
  } catch (err: any) {
    try {
      await mailcowFetch('del/mailbox', payload);
      return;
    } catch (err2: any) {
      handleError(err2);
    }
    handleError(err);
  }
}

export async function removeMailboxAccount(account: MailboxAccount) {
  if (!account) return;
  if (!AppDataSource.isInitialized) return;

  const repo = AppDataSource.getRepository(MailboxAccount);
  if (!isMailcowConfigured()) {
    await repo.delete({ id: account.id });
    return;
  }

  try {
    if (Array.isArray(account.aliases)) {
      for (const alias of account.aliases) {
        if (alias?.address) {
          await deleteMailcowAlias(alias.address);
        }
      }
    }
    await deleteMailcowMailbox(account.localPart, account.domain);
  } catch (err: any) {
    console.warn('[mailcowService] failed to remove mailbox account', account.email, err?.message || err);
    return;
  }

  try {
    await repo.delete({ id: account.id });
  } catch (err: any) {
    console.warn('[mailcowService] failed to remove mailbox account row', account.email, err?.message || err);
  }
}

export async function isPanelAssignedMailboxEmail(email: string) {
  if (!email) return false;
  if (!AppDataSource.isInitialized) return false;

  const normalizedEmail = String(email).trim().toLowerCase();
  const repo = AppDataSource.getRepository(MailboxAccount);
  const exact = await repo.findOneBy({ email: normalizedEmail });
  if (exact) return true;

  const accounts = await repo.find();
  for (const account of accounts) {
    if (Array.isArray(account.aliases)) {
      for (const alias of account.aliases) {
        if (String(alias?.address || '').trim().toLowerCase() === normalizedEmail) {
          return true;
        }
      }
    }
  }

  return false;
}

export async function createMailcowMailbox(localPart: string, domain: string, displayName: string) {
  const password = randomPassword();
  const data = {
    local_part: localPart,
    domain: domain,
    password: password,
    password2: password,
    active: '1',
    quota: '100',
    authsource: 'mailcow',
    name: displayName,
    tls_enforce_in: '0',
    tls_enforce_out: '0',
  };
  await mailcowFetch('add/mailbox', data);
  return { localPart, domain, password };
}

export async function createMailcowAlias(aliasAddress: string, targetMailbox: string, description?: string) {
  const data = {
    address: aliasAddress,
    goto: targetMailbox,
    active: '1',
    sogo_visible: '1',
    description: description || `Alias for ${targetMailbox}`,
  };
  await mailcowFetch('add/alias', data);
  return { aliasAddress, targetMailbox };
}

export async function ensureMailcowDomain(domain: string) {
  try {
    await mailcowFetch('add/domain', { domain, active: '1' });
  } catch (err: any) {
    const message = String(err?.message || '');
    if (!/already.*exists|duplicate|domain_added|domain_exists|object_exists/i.test(message)) {
      throw err;
    }
  }
}

export async function getMailboxAccountForUser(userId: number) {
  const repo = AppDataSource.getRepository(MailboxAccount);
  return repo.findOneBy({ userId });
}

export async function rotateMailboxPasswordForAccount(account: MailboxAccount) {
  if (!account || !account.localPart || !account.domain) throw new Error('Invalid mailbox account');
  const repo = AppDataSource.getRepository(MailboxAccount);
  const newPass = randomPassword();
  try {
    await mailcowFetch('edit/mailbox', {
      local_part: account.localPart,
      domain: account.domain,
      password: newPass,
      password2: newPass,
    });

    account.password = newPass;
    await repo.save(account);
    console.info('[mailcowService] rotated password for mailbox id=%d', account.id);
    return { success: true, password: newPass };
  } catch (err: any) {
    console.warn('[mailcowService] failed to rotate password for mailbox id=%d', account?.id, err?.message || err);
    return { success: false, error: String(err?.message || err) };
  }
}

export async function rotateAllMailboxPasswords() {
  if (!isMailcowConfigured()) {
    console.warn('[mailcowService] Mailcow not configured; skipping password rotation');
    return;
  }
  if (!AppDataSource.isInitialized) return;
  const repo = AppDataSource.getRepository(MailboxAccount);
  const accounts = await repo.find({ where: { enabled: true } });
  for (const acc of accounts) {
    try {
      await rotateMailboxPasswordForAccount(acc);
    } catch (e) {
      console.warn('[mailcowService] rotateAllMailboxPasswords error for', acc.email, e?.message || e);
    }
  }
}

export function scheduleMailboxPasswordRotation(cronExpr?: string) {
  try {
    const cron = require('node-cron');
    const expr = String(cronExpr || process.env.MAILBOX_PASSWORD_ROTATION_CRON || '0 3 1 * *');
    cron.schedule(expr, async () => {
      console.info('[mailcowService] starting scheduled mailbox password rotation');
      await rotateAllMailboxPasswords().catch((e) => console.error('[mailcowService] scheduled rotation failed', e));
    });
    console.info('[mailcowService] scheduled mailbox password rotation:', expr);
  } catch (e) {
    console.error('[mailcowService] failed to schedule password rotation', e);
  }
}

export async function ensureMailboxAccountForUser(user: User) {
  if (!user?.id || !user?.email) {
    throw new Error('User must have an id and email to provision mailbox');
  }

  const domain = resolveMailboxDomain();
  const accountRepo = AppDataSource.getRepository(MailboxAccount);

  let account = await accountRepo.findOneBy({ userId: user.id });

  const canonicalUuid = account?.uuid || uuidv4();
  const canonicalLocalPart = canonicalUuid;
  const canonicalEmail = buildMailboxAddress(canonicalLocalPart, domain);

  if (account) {
    const imapConfig = getImapConfig(domain);
    const smtpConfig = getSmtpConfig(domain);
    if (!account.uuid) account.uuid = canonicalUuid;
    if (account.localPart !== canonicalLocalPart) account.localPart = canonicalLocalPart;
    if (account.email !== canonicalEmail) account.email = canonicalEmail;

    if (account.domain !== domain || account.imapHost !== imapConfig.host || account.smtpHost !== smtpConfig.host) {
      account.domain = domain;
      account.imapHost = imapConfig.host;
      account.imapPort = imapConfig.port;
      account.imapSecure = imapConfig.secure;
      account.smtpHost = smtpConfig.host;
      account.smtpPort = smtpConfig.port;
      account.smtpSecure = smtpConfig.secure;
      await accountRepo.save(account);
    }

    const existingMailbox = await getMailcowMailboxDetails(account.email).catch(() => null);
    if (!existingMailbox) {
      await ensureMailcowDomain(domain);
      await createMailcowMailbox(account.localPart, domain, [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email);
    }

    return account;
  }

  const uuid = canonicalUuid;
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
  const aliasLocalPart = normalizeLocalPart(displayName).replace(/\s+/g, '') || 'user';
  const aliasAddress = buildMailboxAddress(`${aliasLocalPart}.${user.id}`, domain);

  await ensureMailcowDomain(domain);
  const mailbox = await createMailcowMailbox(uuid, domain, displayName);
  
  const imapConfig = getImapConfig(domain);
  const smtpConfig = getSmtpConfig(domain);
  account = accountRepo.create({
    userId: user.id,
    uuid,
    localPart: uuid,
    domain,
    email: buildMailboxAddress(uuid, domain),
    password: mailbox.password || undefined,
    imapHost: imapConfig.host,
    imapPort: imapConfig.port,
    imapSecure: imapConfig.secure,
    smtpHost: smtpConfig.host,
    smtpPort: smtpConfig.port,
    smtpSecure: smtpConfig.secure,
    enabled: true,
    aliases: [
      {
        address: aliasAddress,
        canSendFrom: true,
        createdAt: new Date().toISOString(),
      }
    ]
  });

  const saved = await accountRepo.save(account);

  try {
    await createMailcowAlias(aliasAddress, buildMailboxAddress(uuid, domain), displayName);
  } catch (err: any) {
    const message = String(err?.message || '');
    if (!/object_exists|exists|duplicate|already/i.test(message)) {
      console.warn('Failed to create primary alias in Mailcow:', err?.message || err);
    }
  }

  return saved;
}

export function getMailboxConnectionInfo(domain?: string) {
  const resolved = String(domain || resolveMailboxDomain()).trim();
  const imapConfig = getImapConfig(resolved);
  const smtpConfig = getSmtpConfig(resolved);
  return {
    imapHost: imapConfig.host,
    imapPort: imapConfig.port,
    imapSecure: imapConfig.secure,
    smtpHost: smtpConfig.host,
    smtpPort: smtpConfig.port,
    smtpSecure: smtpConfig.secure,
  };
}