import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

let transporter: nodemailer.Transporter;

export async function initMail() {
  // My ass was dumb and used both before hence this hell is now a thing
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT) || 587;
  const secure = (process.env.SMTP_SECURE || process.env.MAIL_SECURE) === 'true';
  const user = process.env.SMTP_USER || process.env.MAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASS;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user || pass ? { user, pass } : undefined,
  });
  await transporter.verify();
}

function renderTemplate(name: string, vars: Record<string, any>) {
  const file = path.join(__dirname, '../../templates/email', name + '.html');
  let content: string;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (err: any) {
    console.warn(`mailService: missing template ${name}, falling back to plain text`);
    let fallback = `${name} template not found.`;
    for (const k in vars) {
      fallback += `\n${k}: ${vars[k]}`;
    }
    return fallback;
  }
  for (const k in vars) {
    content = content.replace(new RegExp(`{{\s*${k}\s*}}`, 'g'), vars[k]);
  }
  return content;
}

export async function sendMail(options: nodemailer.SendMailOptions & { template?: string; vars?: Record<string, any> }) {
  if (options.template) {
    options.html = renderTemplate(options.template, options.vars || {});
  }
  if (!transporter) await initMail();
  return transporter.sendMail(options);
}
