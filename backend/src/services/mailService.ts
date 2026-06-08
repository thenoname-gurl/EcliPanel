import nodemailer from 'nodemailer';
import { render } from '@react-email/render';
import { convert } from 'html-to-text';
import React from 'react';
import { emailTemplates, TemplateName } from '../emails';
import { getMessages } from '../i18n/loader';
import { resolveLocale } from '../i18n/resolve';
import { createT } from '../i18n/t';
import type { Locale } from '../i18n/config';

let transporter: nodemailer.Transporter;

function buildDefaultFromAddress() {
  const fromEnv = process.env.SMTP_FROM || process.env.MAIL_FROM;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  const user = process.env.SMTP_USER || process.env.MAIL_USER;
  if (user && user.trim()) return user.trim();

  return 'noreply@ecli.app';
}

function quoteName(name: string) {
  if (!name) return name;
  if (name.startsWith('"') && name.endsWith('"')) return name;
  return `"${name}"`;
}

function normalizeFromHeader(from: nodemailer.SendMailOptions['from']) {
  const defaultName = process.env.SMTP_FROM_NAME || process.env.MAIL_FROM_NAME || 'EclipseSystems';
  const fallback = `${quoteName(defaultName)} <${buildDefaultFromAddress()}>`;

  if (!from) return fallback;

  if (typeof from === 'string') {
    const trimmed = from.trim();
    if (!trimmed) return fallback;
    if (trimmed.startsWith('"') && trimmed.includes('<')) return trimmed;
    if (trimmed.includes('<') && trimmed.includes('>')) return trimmed;
    if (trimmed.includes('@')) return `${quoteName(defaultName)} <${trimmed}>`;
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
    return `${quoteName(name)} <${address}>`;
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
  const allowInvalidTls =
    (process.env.SMTP_TLS_ALLOW_INVALID || process.env.MAIL_TLS_ALLOW_INVALID) === 'true';
  const poolEnabled = (process.env.SMTP_POOL || process.env.MAIL_POOL || 'true') === 'true';

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    pool: poolEnabled,
    maxConnections:
      Number(process.env.SMTP_MAX_CONNECTIONS || process.env.MAIL_MAX_CONNECTIONS) || 5,
    maxMessages: Number(process.env.SMTP_MAX_MESSAGES || process.env.MAIL_MAX_MESSAGES) || 100,
    connectionTimeout:
      Number(process.env.SMTP_CONNECTION_TIMEOUT || process.env.MAIL_CONNECTION_TIMEOUT) || 10000,
    greetingTimeout:
      Number(process.env.SMTP_GREETING_TIMEOUT || process.env.MAIL_GREETING_TIMEOUT) || 10000,
    socketTimeout:
      Number(process.env.SMTP_SOCKET_TIMEOUT || process.env.MAIL_SOCKET_TIMEOUT) || 10000,
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

async function renderReactTemplate(name: string, vars: Record<string, any>, locale?: Locale) {
  const templateName = name as TemplateName;
  const TemplateComponent = emailTemplates[templateName];

  if (!TemplateComponent) {
    console.warn(`mailService: react template "${name}" not found, falling back to plain text`);
    let fallback = `Template "${name}" not found.`;
    for (const k in vars) fallback += `\n${k}: ${vars[k]}`;
    return fallback;
  }

  try {
    const resolvedLocale: Locale = locale || resolveLocale({});
    const t = createT(getMessages(resolvedLocale));
    const element = (TemplateComponent as (props: Record<string, any>) => React.ReactNode)({
      ...vars,
      t,
    });
    return await render(element, { pretty: false });
  } catch (err) {
    console.error(`mailService: failed to render react template "${name}":`, err);
    let fallback = `Failed to render template "${name}".`;
    for (const k in vars) fallback += `\n${k}: ${vars[k]}`;
    return fallback;
  }
}

export async function sendMail(
  options: nodemailer.SendMailOptions & {
    template?: string;
    vars?: Record<string, any>;
    smtp?: { host: string; port: number; secure: boolean; user?: string; pass?: string };
    locale?: Locale;
  }
) {
  if (options.template) {
    options.html = await renderReactTemplate(options.template, options.vars || {}, options.locale);
  }

  options.from = normalizeFromHeader(options.from);

  if (!options.replyTo) {
    options.replyTo =
      process.env.SMTP_REPLY_TO || process.env.MAIL_REPLY_TO || extractAddress(options.from);
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
    ...(options.headers || {}),
    'X-Mailer': 'EcliPanel Mailer',
    'X-Entity-Ref-ID': Math.random().toString(36).slice(2, 10),
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
    const allowInvalidTls =
      (process.env.SMTP_TLS_ALLOW_INVALID || process.env.MAIL_TLS_ALLOW_INVALID) === 'true';
    transport = nodemailer.createTransport({
      host: smtpOptions.host,
      port: smtpOptions.port,
      secure: smtpOptions.secure,
      connectionTimeout:
        Number(process.env.SMTP_CONNECTION_TIMEOUT || process.env.MAIL_CONNECTION_TIMEOUT) || 10000,
      greetingTimeout:
        Number(process.env.SMTP_GREETING_TIMEOUT || process.env.MAIL_GREETING_TIMEOUT) || 10000,
      socketTimeout:
        Number(process.env.SMTP_SOCKET_TIMEOUT || process.env.MAIL_SOCKET_TIMEOUT) || 10000,
      auth:
        smtpOptions.user || smtpOptions.pass
          ? { user: smtpOptions.user, pass: smtpOptions.pass }
          : undefined,
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
