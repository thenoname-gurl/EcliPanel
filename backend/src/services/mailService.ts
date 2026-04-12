import nodemailer from 'nodemailer';
import path from 'path';
import { promises as fsp } from 'fs';
import { convert } from 'html-to-text';

let transporter: nodemailer.Transporter;

const templateCache = new Map<string, string>();
let templateWorker: any = null;
const workerResponseMap = new Map<string, (val: any) => void>();
let workerCounter = 0;

function buildDefaultFromAddress() {
  const fromEnv = process.env.SMTP_FROM || process.env.MAIL_FROM;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  const user = process.env.SMTP_USER || process.env.MAIL_USER;
  if (user && user.trim()) return user.trim();

  return 'noreply@ecli.app';
}

function normalizeFromHeader(from: nodemailer.SendMailOptions['from']) {
  const defaultName = process.env.SMTP_FROM_NAME || process.env.MAIL_FROM_NAME || 'EclipseSystems';
  const fallback = `${defaultName} <${buildDefaultFromAddress()}>`;

  if (!from) return fallback;

  if (typeof from === 'string') {
    const trimmed = from.trim();
    if (!trimmed) return fallback;
    if (trimmed.includes('<') && trimmed.includes('>')) return trimmed;
    if (trimmed.includes('@')) return `${defaultName} <${trimmed}>`;
    return fallback;
  }

  if (Array.isArray(from)) {
    if (from.length === 0) return fallback;
    return normalizeFromHeader(from[0]);
  }

  if (typeof from === 'object') {
    const addrObj = from as { address?: string; name?: string };
    const address = addrObj.address?.trim() || buildDefaultFromAddress();
    const name = addrObj.name?.trim() || defaultName;
    return `${name} <${address}>`;
  }

  return fallback;
}

function extractAddress(value: nodemailer.SendMailOptions['from']) {
  if (!value) return '';
  const normalized = normalizeFromHeader(value);
  const match = normalized.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim().toLowerCase();
  return normalized.trim().toLowerCase();
}

function htmlToText(html: string) {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'style', format: 'skip' },
      { selector: 'script', format: 'skip' },
    ],
  }).trim();
}

export async function initMail() {
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT) || 587;
  const secure = (process.env.SMTP_SECURE || process.env.MAIL_SECURE) === 'true';
  const user = process.env.SMTP_USER || process.env.MAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASS;
  const allowInvalidTls = (process.env.SMTP_TLS_ALLOW_INVALID || process.env.MAIL_TLS_ALLOW_INVALID) === 'true';
  const poolEnabled = (process.env.SMTP_POOL || process.env.MAIL_POOL || 'true') === 'true';

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    pool: poolEnabled,
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || process.env.MAIL_MAX_CONNECTIONS) || 5,
    maxMessages: Number(process.env.SMTP_MAX_MESSAGES || process.env.MAIL_MAX_MESSAGES) || 100,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || process.env.MAIL_CONNECTION_TIMEOUT) || 10000,
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || process.env.MAIL_GREETING_TIMEOUT) || 10000,
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || process.env.MAIL_SOCKET_TIMEOUT) || 10000,
    auth: user || pass ? { user, pass } : undefined,
    tls: allowInvalidTls
      ? {
          rejectUnauthorized: false,
          checkServerIdentity: () => undefined,
        }
      : undefined,
  } as any);
  await transporter.verify();
}

function tryInitWorker() {
  if (templateWorker) return;
  try {
    if (typeof Worker !== 'undefined') {
      const workerUrl = new URL('./mailTemplateWorker.js', import.meta.url).toString();
      // @ts-ignore
      templateWorker = new Worker(workerUrl, { type: 'module' });
      templateWorker.onmessage = (e: any) => {
        const m = e.data;
        const cb = workerResponseMap.get(m.id);
        if (cb) {
          workerResponseMap.delete(m.id);
          if (m.error) cb(Promise.reject(new Error(m.error)) as any);
          else cb(m.content);
        }
      };
      templateWorker.onerror = (e: any) => {
        for (const cb of workerResponseMap.values()) cb(Promise.reject(e) as any);
        workerResponseMap.clear();
        templateWorker = null;
      };
      return;
    }
  } catch (e) {
    templateWorker = null;
  }
}

async function renderTemplateAsync(name: string, vars: Record<string, any>) {
  const file = path.join(__dirname, '../../templates/email', name + '.html');
  let content = templateCache.get(name);
  if (!content) {
    try {
      content = await fsp.readFile(file, 'utf8');
      templateCache.set(name, content);
    } catch (err: any) {
      console.warn(`mailService: missing template ${name}, falling back to plain text`);
      let fallback = `${name} template not found.`;
      for (const k in vars) fallback += `\n${k}: ${vars[k]}`;
      return fallback;
    }
  }

  tryInitWorker();
  if (templateWorker) {
    return await new Promise<string>((resolve, reject) => {
      const id = `t${Date.now().toString(36)}_${workerCounter++}`;
      const cb = (result: any) => {
        if (result instanceof Error || (typeof result === 'object' && result && typeof (result as any).then === 'function')) {
          reject(result);
        } else resolve(result);
      };
      workerResponseMap.set(id, cb as any);
      try {
        templateWorker.postMessage({ id, template: content, vars });
        setTimeout(() => {
          if (workerResponseMap.has(id)) {
            workerResponseMap.delete(id);
            reject(new Error('template worker timeout'));
          }
        }, 5000).unref?.();
      } catch (e) {
        workerResponseMap.delete(id);
        reject(e);
      }
    });
  }

  let out = content as string;
  for (const k in vars) out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(vars[k]));
  return out;
}

export async function sendMail(options: nodemailer.SendMailOptions & { template?: string; vars?: Record<string, any>; smtp?: { host: string; port: number; secure: boolean; user?: string; pass?: string } }) {
  if (options.template) {
    options.html = await renderTemplateAsync(options.template, options.vars || {});
  }

  options.from = normalizeFromHeader(options.from);

  if (!options.replyTo) {
    options.replyTo = process.env.SMTP_REPLY_TO || process.env.MAIL_REPLY_TO || extractAddress(options.from);
  }

  if (options.html && !options.text) {
    options.text = htmlToText(String(options.html));
  }

  const fromAddress = extractAddress(options.from);
  const domain = fromAddress.includes('@') ? fromAddress.split('@')[1] : '';
  if (!options.messageId && domain) {
    options.messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`;
  }

  options.headers = {
    'X-Mailer': 'EcliPanel Mailer',
    ...(options.headers || {}),
  };

  if (!options.envelope && fromAddress) {
    options.envelope = {
      from: fromAddress,
      to: options.to as any,
    };
  }

  const smtpOptions = options.smtp;
  let transport: nodemailer.Transporter | null = null;

  if (smtpOptions && smtpOptions.host) {
    const allowInvalidTls = (process.env.SMTP_TLS_ALLOW_INVALID || process.env.MAIL_TLS_ALLOW_INVALID) === 'true';
    transport = nodemailer.createTransport({
      host: smtpOptions.host,
      port: smtpOptions.port,
      secure: smtpOptions.secure,
      connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || process.env.MAIL_CONNECTION_TIMEOUT) || 10000,
      greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || process.env.MAIL_GREETING_TIMEOUT) || 10000,
      socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || process.env.MAIL_SOCKET_TIMEOUT) || 10000,
      auth: smtpOptions.user || smtpOptions.pass ? { user: smtpOptions.user, pass: smtpOptions.pass } : undefined,
      tls: allowInvalidTls
        ? {
            rejectUnauthorized: false,
            checkServerIdentity: () => undefined,
          }
        : undefined,
    } as any);
  }

  if (transport) {
    try {
      return await transport.sendMail(options);
    } finally {
      transport.close?.();
    }
  }

  if (!transporter) await initMail();
  return transporter.sendMail(options);
}
