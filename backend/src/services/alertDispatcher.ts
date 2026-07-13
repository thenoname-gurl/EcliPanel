import { sendMail } from './mailService';
import { AppDataSource } from '../config/typeorm';
import { redisGet, redisSet } from '../config/redis';
import { PanelSetting } from '../models/panelSetting.entity';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface FindingAlert {
  id: number;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  serverId?: string;
  serverName?: string;
  nodeId?: number;
  userId?: number;
  metadata?: Record<string, any>;
  fingerprint?: string;
  detectedAt: Date;
  visibility?: 'public' | 'staff_only';
}

interface UserAlertPrefs {
  enabled: boolean;
  severities: string[];
  channels: { email: boolean; inapp: boolean; };
  emailOverride?: string;
}

let _settingsCache: Record<string, string> | null = null;
let _settingsCacheTs = 0;

async function getSocSettings(): Promise<Record<string, string>> {
  if (_settingsCache && Date.now() - _settingsCacheTs < 60_000) return _settingsCache;
  try {
    const repo = AppDataSource.getRepository(PanelSetting);
    const rows = await repo.find();
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (r.key.startsWith('soc.')) map[r.key] = r.value;
    }
    _settingsCache = map;
    _settingsCacheTs = Date.now();
    return map;
  } catch { return {}; }
}

async function getAdminFallbackEmail(): Promise<string> {
  const settings = await getSocSettings();
  return settings['soc.alert_email'] || process.env.SOC_ALERT_EMAIL || process.env.ABUSE_REPORT_EMAIL || '';
}

async function getAdminWebhookUrl(): Promise<string> {
  const settings = await getSocSettings();
  return settings['soc.alert_webhook_url'] || process.env.SOC_ALERT_WEBHOOK_URL || '';
}

async function getAdminSeverities(): Promise<string[]> {
  const settings = await getSocSettings();
  const raw = settings['soc.alert_severities'] || process.env.SOC_ALERT_EMAIL_SEVERITIES || 'critical';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

const DEFAULT_PREFS: UserAlertPrefs = {
  enabled: true,
  severities: ['critical'],
  channels: { email: true, inapp: true },
};

async function getUserAlertPrefs(userId: number): Promise<UserAlertPrefs> {
  try {
    const userRepo = AppDataSource.getRepository(require('../models/user.entity').User);
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user?.settings?.socAlerts) return DEFAULT_PREFS;
    const prefs = user.settings.socAlerts as Partial<UserAlertPrefs>;
    return {
      enabled: prefs.enabled !== false,
      severities: prefs.severities || DEFAULT_PREFS.severities,
      channels: {
        email: prefs.channels?.email !== false,
        inapp: prefs.channels?.inapp !== false,
      },
      emailOverride: prefs.emailOverride || undefined,
    };
  } catch { return DEFAULT_PREFS; }
}

async function getUserEmail(userId: number): Promise<string | null> {
  try {
    const userRepo = AppDataSource.getRepository(require('../models/user.entity').User);
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user?.email || !user.emailVerified) return null;
    return user.email;
  } catch { return null; }
}

async function resolveRecipients(finding: FindingAlert): Promise<Array<{ userId: number; email: string; prefs: UserAlertPrefs }>> {
  const recipients: Array<{ userId: number; email: string; prefs: UserAlertPrefs }> = [];

  if (finding.userId) {
    const prefs = await getUserAlertPrefs(finding.userId);
    if (prefs.enabled && prefs.severities.includes(finding.severity)) {
      // Only use emailOverride if the user's own email is verified
      const verifiedEmail = await getUserEmail(finding.userId);
      const email = verifiedEmail ? (prefs.emailOverride || verifiedEmail) : null;
      if (email) recipients.push({ userId: finding.userId, email, prefs });
    }
  }

  if (!finding.userId && finding.serverId) {
    try {
      const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
      const cfg = await cfgRepo.findOne({ where: { uuid: finding.serverId } });
      if (cfg?.userId) {
        const prefs = await getUserAlertPrefs(cfg.userId);
        if (prefs.enabled && prefs.severities.includes(finding.severity)) {
          const verifiedEmail = await getUserEmail(cfg.userId);
          const email = verifiedEmail ? (prefs.emailOverride || verifiedEmail) : null;
          if (email) recipients.push({ userId: cfg.userId, email, prefs });
        }
      }
    } catch {}
  }

  return recipients;
}

async function sendWebhook(url: string, finding: FindingAlert): Promise<boolean> {
  try {
    const color = finding.severity === 'critical' ? 0xFF0000
      : finding.severity === 'high' ? 0xFF6600
      : finding.severity === 'medium' ? 0xFFCC00
      : 0x3399FF;

    const payload = {
      embeds: [{
        title: `[${finding.severity.toUpperCase()}] ${finding.title}`,
        description: finding.description,
        color,
        fields: [
          { name: 'Category', value: finding.category, inline: true },
          { name: 'Server', value: finding.serverName || finding.serverId || 'N/A', inline: true },
          { name: 'Detected', value: finding.detectedAt?.toISOString() || 'unknown', inline: true },
        ],
        footer: { text: `Finding #${finding.id} • ${'internal'}` },
        timestamp: finding.detectedAt?.toISOString(),
      }],
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return resp.ok;
  } catch { return false; }
}

export async function dispatchAlert(finding: FindingAlert): Promise<string[]> {
  const fired: string[] = [];

  // Staff-only findings: NEVER alert end users. Only notify admin channels.
  const isStaffOnly = finding.visibility === 'staff_only';

  if (finding.fingerprint) {
    const rateKey = `alert:ratelimit:${finding.fingerprint}`;
    try {
      const lastSent = await redisGet(rateKey);
      if (lastSent && Date.now() - Number(lastSent) < 1_800_000) return [];
      await redisSet(rateKey, String(Date.now()), 1800);
    } catch {}
  }

  // Per-user rate limit: max 1 email per user per 10 minutes
  if (finding.userId) {
    const userRateKey = `alert:user_rate:${finding.userId}`;
    try {
      const lastUserAlert = await redisGet(userRateKey);
      if (lastUserAlert && Date.now() - Number(lastUserAlert) < 600_000) {
        console.log(`[alertDispatcher] #${finding.id} suppressed: user #${finding.userId} rate-limited`);
        return [];
      }
      await redisSet(userRateKey, String(Date.now()), 600);
    } catch {}
  }

  // Only resolve user recipients for public findings — never for staff-only
  const recipients = isStaffOnly ? [] : await resolveRecipients(finding);
  for (const rec of recipients) {
    const prefs = rec.prefs;

    if (prefs.channels.email && rec.email) {
      try {
        await sendMail({
          to: [rec.email],
          subject: `[${finding.severity.toUpperCase()}] ${finding.title}`,
          template: 'notification',
          vars: {
            title: finding.title,
            message: [finding.description, finding.serverId ? `\nView: /dashboard/servers/${finding.serverId}` : ''].join('\n'),
            details: `Severity: ${finding.severity}\nCategory: ${finding.category}\nServer: ${finding.serverName || finding.serverId || 'N/A'}`,
          },
        });
        fired.push(`email:${rec.userId}`);
      } catch (e) { console.error('[alertDispatcher] email failed for', rec.userId, e); }
    }

    if (prefs.channels.inapp) {
      try {
        const notifRepo = AppDataSource.getRepository(require('../models/notification.entity').Notification);
        await notifRepo.save(notifRepo.create({
          userId: rec.userId, type: 'security',
          title: finding.title, body: finding.description,
          url: finding.serverId ? `/dashboard/servers/${finding.serverId}` : '/dashboard',
        }));
        fired.push(`inapp:${rec.userId}`);
      } catch (e) { console.error('[alertDispatcher] inapp failed for', rec.userId, e); }
    }
  }

  // Admin fallback: for staff-only findings, OR when no user was notified, OR always for critical oversight
  if (isStaffOnly || recipients.length === 0 || finding.severity === 'critical') {
    const adminEmail = await getAdminFallbackEmail();
    const adminSeverities = await getAdminSeverities();

    if (adminEmail && adminSeverities.includes(finding.severity)) {
      // Dedupe: don't send admin email if admin is already a user recipient
      const adminAddrs = adminEmail.split(/[,;\s]+/).filter(Boolean).map(e => e.toLowerCase());
      const userAddrs = recipients.map(r => r.email.toLowerCase());
      const deduped = adminAddrs.filter(a => !userAddrs.includes(a));

      if (deduped.length > 0) {
        try {
          await sendMail({
            to: deduped,
            subject: `${isStaffOnly ? '[STAFF-ONLY] ' : ''}[SOC ${finding.severity.toUpperCase()}] ${finding.title}`,
            template: 'notification',
            vars: {
              title: finding.title,
              message: finding.description,
              details: `Finding #${finding.id} | Server: ${finding.serverName || finding.serverId || 'N/A'} | User: ${finding.userId || 'unknown'}`,
            },
          });
          fired.push('email:admin');
        } catch {}
      }
    }

    const webhookUrl = await getAdminWebhookUrl();
    if (webhookUrl && adminSeverities.includes(finding.severity)) {
      const ok = await sendWebhook(webhookUrl, finding);
      if (ok) fired.push('webhook:admin');
    }
  }

  if (fired.length > 0) {
    console.log(`[alertDispatcher] #${finding.id} (${finding.severity}): ${fired.join(', ')}`);
  }
  return fired;
}

export async function getUserSocAlertPrefs(userId: number): Promise<UserAlertPrefs> {
  return getUserAlertPrefs(userId);
}