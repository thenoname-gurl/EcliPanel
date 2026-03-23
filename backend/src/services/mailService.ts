import nodemailer from 'nodemailer';
import path from 'path';
import { promises as fsp } from 'fs';

let transporter: nodemailer.Transporter;

const templateCache = new Map<string, string>();
let templateWorker: any = null;
const workerResponseMap = new Map<string, (val: any) => void>();
let workerCounter = 0;

export async function initMail() {
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

export async function sendMail(options: nodemailer.SendMailOptions & { template?: string; vars?: Record<string, any> }) {
  if (options.template) {
    options.html = await renderTemplateAsync(options.template, options.vars || {});
  }
  if (!transporter) await initMail();
  return transporter.sendMail(options);
}
