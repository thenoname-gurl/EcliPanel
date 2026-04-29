import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { AdminBroadcastJob } from '../models/adminBroadcastJob.entity';
import { sendMail } from './mailService';
import { createActivityLog } from '../handlers/logHandler';

function escapeHtml(value: any) {
  const s = String(value || '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownToHtml(md: any) {
  const src = String(md || '');
  const lines = src.split('\n');
  const html = lines.map((line) => {
    if (/^\s*```/.test(line)) return line;
    if (/^\s*#{1,6}\s+/.test(line)) {
      const level = Math.min(6, line.match(/^\s*(#{1,6})\s+/)![1].length);
      return `<h${level}>${escapeHtml(line.replace(/^\s*#{1,6}\s+/, ''))}</h${level}>`;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      return `<li>${escapeHtml(line.replace(/^\s*[-*+]\s+/, ''))}</li>`;
    }
    return `<p>${escapeHtml(line)}</p>`;
  }).join('');
  return html;
}

export async function createAdminBroadcastJob(adminId: number, subject: string, message: string, force: boolean) {
  const repo = AppDataSource.getRepository(AdminBroadcastJob);
  const job = repo.create({
    adminId,
    subject,
    message,
    force,
    status: 'queued',
    recipients: 0,
  });
  return repo.save(job);
}

export async function processPendingAdminBroadcastJobs() {
  if (!AppDataSource.isInitialized) return;
  const jobRepo = AppDataSource.getRepository(AdminBroadcastJob);
  const userRepo = AppDataSource.getRepository(User);

  const jobs = await jobRepo.find({
    where: { status: 'queued' },
    order: { createdAt: 'ASC' },
    take: 1,
  });

  for (const job of jobs) {
    job.status = 'running';
    job.startedAt = new Date();
    await jobRepo.save(job);

    let sentCount = 0;
    let lastError: string | null = null;
    const htmlMessage = markdownToHtml(job.message);
    const adminUser = await userRepo.findOneBy({ id: job.adminId });
    const adminDetails = adminUser
      ? [adminUser.firstName, adminUser.middleName, adminUser.lastName].filter(Boolean).join(' ').trim()
      : adminUser?.email || 'admin';

    try {
      const users = await userRepo.find();
      for (const user of users) {
        if (!user.email) continue;
        if (!user.emailVerified) continue;
        const wants = user.settings?.notifications?.productUpdates;
        const enabled = job.force || (typeof wants === 'boolean' ? wants : false);
        if (!enabled) continue;

        try {
          await sendMail({
            to: user.email,
            from: process.env.MAIL_FROM,
            subject: `${job.subject} — Eclipse Systems`,
            template: 'notification',
            vars: {
              title: job.subject,
              message: htmlMessage,
              details: escapeHtml(adminDetails ? `${adminDetails} — ${adminUser?.email || ''}` : ''),
            },
          });
          sentCount += 1;
        } catch (err: any) {
          lastError = String(err?.message || err);
          console.warn('[adminBroadcast] failed to send email to', user.email, err?.message || err);
        }
      }

      job.recipients = sentCount;
      job.status = 'completed';
      job.completedAt = new Date();
      await createActivityLog({
        userId: job.adminId,
        action: 'admin-send-product-update',
        targetType: 'broadcast',
        metadata: { subject: job.subject, recipients: sentCount, force: job.force },
        notify: false,
      });
    } catch (err: any) {
      lastError = String(err?.message || err);
      job.status = 'failed';
      job.failureReason = lastError;
      job.completedAt = new Date();
      await createActivityLog({
        userId: job.adminId,
        action: 'admin-send-product-update:error',
        targetType: 'broadcast',
        metadata: { subject: job.subject, error: lastError },
        notify: false,
      });
    } finally {
      if (lastError) {
        job.failureReason = lastError;
      }
      await jobRepo.save(job);
    }
  }
}