import dns from 'dns';
import { isIP } from 'net';
import { AppDataSource } from '../config/typeorm';
import { MailMessage } from '../models/mailMessage.entity';
import { User } from '../models/user.entity';
import { getMailboxAccountForUser } from '../services/mailcowService';

function headerValueToString(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return headerValueToString(value[0]);
  }
  if (typeof value === 'object') {
    if ('value' in value) {
      return headerValueToString((value as any).value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function normalizeHeaderParameter(headers: any, key: string, parameter: string): string | undefined {
  if (!headers) return undefined;
  const lowerKey = key.toLowerCase();

  if (typeof headers.get === 'function') {
    const value = headers.get(key) ?? headers.get(lowerKey);
    if (value && typeof value === 'object' && 'params' in value && value.params?.[parameter]) {
      return String(value.params[parameter]);
    }
  }

  if (typeof headers === 'object') {
    for (const headerName of Object.keys(headers)) {
      if (headerName.toLowerCase() === lowerKey) {
        const value = headers[headerName];
        if (value && typeof value === 'object' && 'params' in value && value.params?.[parameter]) {
          return String(value.params[parameter]);
        }
      }
    }
  }

  return undefined;
}

export function normalizeHeaderValue(headers: any, key: string): string | undefined {
  if (!headers) return undefined;
  const lowerKey = key.toLowerCase();

  if (typeof headers.get === 'function') {
    const value = headers.get(key) ?? headers.get(lowerKey);
    return headerValueToString(value);
  }

  if (typeof headers === 'string') {
    const escaped = key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}:\\s*(.*)$`, 'gim');
    const match = regex.exec(headers);
    if (match && match[1]) return match[1].trim();
    return undefined;
  }

  if (typeof headers === 'object') {
    for (const headerName of Object.keys(headers)) {
      if (headerName.toLowerCase() === lowerKey) {
        return headerValueToString(headers[headerName]);
      }
    }
  }

  return undefined;
}

export function getHeaderValues(headers: any, key: string): string[] {
  if (!headers) return [];
  const lowerKey = key.toLowerCase();

  if (typeof headers.get === 'function') {
    const value = headers.get(key) ?? headers.get(lowerKey);
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value.map(String) : [String(value)];
  }

  if (typeof headers === 'string') {
    const escaped = key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}:\\s*(.*)$`, 'gim');
    const values: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(headers))) {
      if (match[1]) values.push(match[1].trim());
    }
    return values;
  }

  if (typeof headers === 'object') {
    const values: string[] = [];
    for (const headerName of Object.keys(headers)) {
      if (headerName.toLowerCase() === lowerKey) {
        const value = headers[headerName];
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          values.push(...value.map(String));
        } else {
          values.push(String(value));
        }
      }
    }
    return values;
  }

  return [];
}

function parseReceivedHeader(raw: string) {
  const result: { raw: string; from?: string; by?: string; with?: string; id?: string; for?: string; ip?: string } = { raw };

  const trim = (value?: string) => value?.trim().replace(/["' ]+$/g, '').replace(/^["' ]+/g, '') || undefined;

  const findField = (pattern: RegExp) => {
    const match = raw.match(pattern);
    return match?.[1] ? trim(match[1]) : undefined;
  };

  result.from = findField(/from\s+(.+?)(?:\s+by\s+|\s+with\s+|\s+id\s+|\s+for\s+|;|$)/i);
  result.by = findField(/\sby\s+(.+?)(?:\s+with\s+|\s+id\s+|\s+for\s+|;|$)/i);
  result.with = findField(/\swith\s+(.+?)(?:\s+id\s+|\s+for\s+|;|$)/i);
  result.id = findField(/\sid\s+(.+?)(?:\s+for\s+|;|$)/i);
  result.for = findField(/\sfor\s+(.+?)(?:;|$)/i);

  const ipMatches = Array.from(raw.matchAll(/\b([0-9]{1,3}(?:\.[0-9]{1,3}){3}|[A-Fa-f0-9:]{2,})\b/g)).map(m => m[1]);
  for (const candidate of ipMatches) {
    if (isIP(candidate)) {
      result.ip = candidate;
      break;
    }
  }

  return result;
}

function parseReceivedHeaders(rawHeaders: string) {
  const lines = rawHeaders.split(/\r?\n/);
  const receivedBlocks: string[] = [];
  let current = '';

  for (const line of lines) {
    if (/^\s/.test(line)) {
      if (current) current += '\r\n' + line;
      continue;
    }
    if (/^received:/i.test(line)) {
      if (current) receivedBlocks.push(current);
      current = line.replace(/^received:\s*/i, '');
      continue;
    }
    if (current) {
      receivedBlocks.push(current);
      current = '';
    }
  }
  if (current) receivedBlocks.push(current);

  return receivedBlocks.map(parseReceivedHeader);
}

function parseAuthResultToken(value: string | undefined, pattern: RegExp): string | null {
  if (!value) return null;
  const match = value.match(pattern);
  return match?.[1]?.toLowerCase() ?? null;
}

function extractIpFromHeaderValue(raw: string | undefined): string | null {
  if (!raw) return null;
  const candidates = raw.split(',').map(v => v.trim());
  for (const candidate of candidates) {
    const match = candidate.match(/\b([0-9]{1,3}(?:\.[0-9]{1,3}){3}|[A-Fa-f0-9:]{2,})\b/);
    if (match?.[1] && isIP(match[1])) {
      return match[1];
    }
  }
  return null;
}

function extractIpFromForwarded(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/for=\s*"?\[?([0-9]{1,3}(?:\.[0-9]{1,3}){3}|[A-Fa-f0-9:]{2,})\]?"?/i);
  return match?.[1] && isIP(match[1]) ? match[1] : null;
}

export function parseAuthenticationResults(headers: any): {
  authResults: string | null;
  spfResult: string | null;
  dkimResult: string | null;
  dmarcResult: string | null;
} {
  const authResultsValue = normalizeHeaderValue(headers, 'authentication-results') || normalizeHeaderValue(headers, 'x-authentication-results');
  const spfValue = normalizeHeaderValue(headers, 'received-spf') || normalizeHeaderValue(headers, 'spf');
  const dmarcValue = normalizeHeaderValue(headers, 'dmarc');

  const authResults = authResultsValue?.trim() || spfValue?.trim() || dmarcValue?.trim() || null;

  const spfResult = parseAuthResultToken(
    authResultsValue || spfValue,
    /spf=(pass|fail|softfail|neutral|none|temperror|permerror)/i,
  ) || parseAuthResultToken(spfValue, /^(pass|fail|softfail|neutral|none|temperror|permerror)/i);

  const dkimResult = parseAuthResultToken(
    authResultsValue,
    /dkim=(pass|fail|neutral|none|policy|temperror|permerror)/i,
  );

  const dmarcResult = parseAuthResultToken(
    authResultsValue || dmarcValue,
    /dmarc=(pass|fail|bestguess|none|policy|temperror|permerror)/i,
  );

  return {
    authResults,
    spfResult,
    dkimResult,
    dmarcResult,
  };
}

export function extractMailboxPriority(headers: any): string | null {
  if (!headers) return null;

  const raw = normalizeHeaderValue(headers, 'priority')
    || normalizeHeaderValue(headers, 'x-priority')
    || normalizeHeaderValue(headers, 'importance');
  if (!raw) return null;

  const normalized = String(raw).trim().toLowerCase();
  if (/urgent/i.test(normalized)) return 'Urgent';
  if (normalized === '1' || normalized.startsWith('1') || normalized.includes('highest') || normalized.includes('high')) return 'High';
  if (normalized === '2' || normalized.startsWith('2')) return 'High';
  if (normalized === '3' || normalized.startsWith('3') || normalized.includes('normal') || normalized.includes('medium')) return 'Normal';
  if (normalized === '4' || normalized.startsWith('4') || normalized.includes('low')) return 'Low';
  if (normalized === '5' || normalized.startsWith('5') || normalized.includes('lowest')) return 'Low';

  if (normalized.includes('high')) return 'High';
  if (normalized.includes('normal') || normalized.includes('medium')) return 'Normal';
  if (normalized.includes('low')) return 'Low';

  return raw.trim();
}

export async function resolveReverseDns(ip?: string): Promise<string | null> {
  if (!ip || !isIP(ip)) return null;
  try {
    const names = await dns.promises.reverse(ip);
    return Array.isArray(names) && names.length > 0 ? names[0] : null;
  } catch {
    return null;
  }
}

export function detectMailboxEncryption(headers: any): string | null {
  if (!headers) return null;
  const contentType = normalizeHeaderValue(headers, 'content-type')?.toLowerCase();
  const protocol = normalizeHeaderValue(headers, 'protocol')?.toLowerCase();
  const contentTypeProtocol = normalizeHeaderParameter(headers, 'content-type', 'protocol')?.toLowerCase();
  const authResults = normalizeHeaderValue(headers, 'authentication-results')?.toLowerCase();

  if (contentType?.includes('application/pgp-encrypted')) {
    return 'PGP/MIME';
  }

  if (contentType?.includes('application/pgp-signature')) {
    return 'PGP/MIME';
  }

  if (contentType?.includes('multipart/encrypted') && protocol?.includes('application/pgp-encrypted')) {
    return 'PGP/MIME';
  }

  if (contentType?.includes('multipart/signed') && (protocol?.includes('application/pgp-signature') || contentTypeProtocol?.includes('application/pgp-signature'))) {
    return 'PGP/MIME';
  }

  if (contentType?.includes('multipart/encrypted') && (protocol?.includes('application/pgp-encrypted') || contentTypeProtocol?.includes('application/pgp-encrypted'))) {
    return 'PGP/MIME';
  }

  if (contentType?.includes('application/pkcs7-mime') || contentType?.includes('application/x-pkcs7-mime')) {
    return 'S/MIME';
  }

  if (contentType?.includes('application/pkcs7-signature') || contentType?.includes('application/x-pkcs7-signature')) {
    return 'S/MIME';
  }

  if (contentType?.includes('multipart/signed') && (protocol?.includes('application/pkcs7-signature') || contentTypeProtocol?.includes('application/pkcs7-signature'))) {
    return 'S/MIME';
  }

  if (normalizeHeaderValue(headers, 'x-pgp-signature') || normalizeHeaderValue(headers, 'x-pgp')) {
    return 'PGP/MIME';
  }

  if (normalizeHeaderValue(headers, 'x-pkcs7-signature') || normalizeHeaderValue(headers, 'x-smime-capable')) {
    return 'S/MIME';
  }

  return null;
}

export async function extractMailboxAuthMetadata(
  headers: any,
  rawHeaders?: string,
): Promise<{
  senderIp: string | null;
  senderRdns: string | null;
  spfResult: string | null;
  dkimResult: string | null;
  dmarcResult: string | null;
  authResults: string | null;
  encryptionType: string | null;
  receivedChain: Array<{ from?: string; by?: string; with?: string; id?: string; for?: string; ip?: string; raw?: string }>;
}> {
  let parsedHeaders: any = headers;
  if (!parsedHeaders && rawHeaders) {
    try {
      parsedHeaders = JSON.parse(rawHeaders);
    } catch {
      parsedHeaders = undefined;
    }
  }

  const rawHeaderText = typeof rawHeaders === 'string' && /(^|\r?\n)received:/i.test(rawHeaders)
    ? rawHeaders
    : undefined;

  const receivedChain = rawHeaderText
    ? parseReceivedHeaders(rawHeaderText)
    : getHeaderValues(parsedHeaders, 'received').map(raw => parseReceivedHeader(raw));

  const originatingIp = normalizeHeaderValue(parsedHeaders, 'x-originating-ip')
    || normalizeHeaderValue(parsedHeaders, 'x-client-ip')
    || normalizeHeaderValue(parsedHeaders, 'x-original-ip');
  const forwardedForIp = extractIpFromHeaderValue(normalizeHeaderValue(parsedHeaders, 'x-forwarded-for'));
  const forwardedHeaderIp = extractIpFromForwarded(normalizeHeaderValue(parsedHeaders, 'forwarded'));
  const senderIp = originatingIp?.replace(/[^0-9A-Fa-f:.]/g, '')
    || forwardedForIp
    || forwardedHeaderIp
    || receivedChain.reduceRight<string | null>((found, entry) => {
      if (found) return found;
      return entry.ip || null;
    }, null);
  const senderRdns = await resolveReverseDns(senderIp || undefined);
  const auth = parseAuthenticationResults(parsedHeaders);

  return {
    senderIp,
    senderRdns,
    spfResult: auth.spfResult,
    dkimResult: auth.dkimResult,
    dmarcResult: auth.dmarcResult,
    authResults: auth.authResults,
    encryptionType: detectMailboxEncryption(parsedHeaders),
    receivedChain,
  };
}

export function detectMailboxSecurityFlags(
  headers: any,
  subject?: string,
): {
  isSpam: boolean;
  spamScore: number | null;
  isVirus: boolean;
  virusName: string | null;
} {
  let isSpam = false;
  let spamScore: number | null = null;
  let isVirus = false;
  let virusName: string | null = null;

  const spamStatus = normalizeHeaderValue(headers, 'x-spam-status')?.toLowerCase();
  const spamFlag = normalizeHeaderValue(headers, 'x-spam-flag')?.toLowerCase();
  const spamScoreHeader = normalizeHeaderValue(headers, 'x-spam-score') || normalizeHeaderValue(headers, 'x-spam-level');
  const spamReport = normalizeHeaderValue(headers, 'x-spam-report');

  if (spamStatus && /(yes|true|spam)/.test(spamStatus)) isSpam = true;
  if (spamFlag && /(yes|true|spam)/.test(spamFlag)) isSpam = true;

  if (spamScoreHeader) {
    const raw = spamScoreHeader.trim();
    const numeric = Number(raw.replace(/[^0-9.+-]/g, ''));
    if (!Number.isNaN(numeric)) {
      spamScore = numeric;
      if (numeric > 0) isSpam = true;
    } else {
      const match = raw.match(/score\s*=\s*([-+]?\d+(?:\.\d+)?)/i);
      if (match) {
        spamScore = Number(match[1]);
        if (!Number.isNaN(spamScore) && spamScore > 0) isSpam = true;
      }
    }
  }

  if (!isSpam && spamReport) {
    if (/score\s*=\s*([-+]?\d+(?:\.\d+)?)/i.test(spamReport) || /hit\s*=\s*\d+/i.test(spamReport)) {
      isSpam = true;
    }
  }

  if (!isSpam && subject) {
    if (/\[spam\]|spam/i.test(subject)) {
      isSpam = true;
    }
  }

  const virusStatus = normalizeHeaderValue(headers, 'x-virus-status');
  const virusScanned = normalizeHeaderValue(headers, 'x-virus-scanned');
  const virusNameHeader = normalizeHeaderValue(headers, 'x-virus-name');

  const virusStatusValue = String(virusStatus || virusScanned || '').toLowerCase().trim();
  if (virusStatusValue && /(yes|infected|found|positive|virus|suspicious)/.test(virusStatusValue)) {
    isVirus = true;
  }
  if (virusNameHeader) {
    virusName = virusNameHeader.trim();
    if (virusName && /(clean|no|none|not detected)/i.test(virusName)) {
      virusName = null;
    }
  }

  if (!virusName && virusStatusValue) {
    const parsedName = virusStatusValue.replace(/^(yes|infected|found|positive|virus)[:\s]*/i, '').trim();
    if (parsedName && !/^(yes|infected|found|positive|virus)$/i.test(parsedName)) {
      virusName = parsedName;
    }
  }

  if (virusName && /(clean|no|none|not detected)/i.test(virusName)) {
    virusName = null;
  }

  if (virusName && !isVirus) {
    if (/(eicar|trojan|worm|virus|infected|malware)/i.test(virusName)) {
      isVirus = true;
    }
  }

  return {
    isSpam,
    spamScore,
    isVirus,
    virusName,
  };
}

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