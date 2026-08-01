import { AppDataSource } from '../config/typeorm';
import { In } from 'typeorm';
import { Ticket } from '../models/ticket.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { t } from 'elysia';
import { requireFeature } from '../middleware/featureToggle';
import { AIModel } from '../models/aiModel.entity';
import { AIModelUser } from '../models/aiModelUser.entity';
import { AIModelOrg } from '../models/aiModelOrg.entity';
import { Plan } from '../models/plan.entity';
import { PanelSetting } from '../models/panelSetting.entity';
import { createActivityLog } from './logHandler';
import { getGeoBlockRulesWithDefaults } from '../utils/eu';
import { tForUser } from '../i18n';
import { sanitizeError } from '../utils/sanitizeError';
import { httpRequest } from '../utils/http';
import path from 'path';
import fs from 'fs';
import type {
  TicketContext,
  TicketApp,
  TicketMessage,
  TicketLike,
  EndpointInfo,
  ModelLike,
} from '../types/ticket';

export async function ticketRoutes(app: TicketApp, prefix = '') {
  const repo = AppDataSource.getRepository(Ticket);
  const modelRepo = AppDataSource.getRepository(AIModel);
  const modelUserRepo = AppDataSource.getRepository(AIModelUser);
  const modelOrgRepo = AppDataSource.getRepository(AIModelOrg);
  const orgMemberRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
  const planRepo = AppDataSource.getRepository(Plan);

  const endpointCooldowns: Map<string, number> = new Map();
  function nowTs() { return Date.now(); }

  let msgSeq = 0;
  const makeMsgId = () => `m_${Date.now().toString(36)}_${(++msgSeq).toString(36)}`;

  const ALLOWED_PRIORITIES = ['urgent', 'high', 'medium', 'low'];
  const ALLOWED_DEPARTMENTS = ['Technical Support', 'Billing', 'Sales', 'Security'];

  function sanitizeForDb(s: string | null | undefined) {
    if (s == null) return s;
    try {
      let out = String(s);
      out = out.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
      out = out.replace(/≡/g, '=');
      out = out.replace(/[\u2190-\u21FF]/g, '->');
      out = out.replace(/≥/g, '>=').replace(/≤/g, '<=');
      out = out.replace(/©/g, '(c)').replace(/®/g, '(r)');
      out = out.replace(/([\uD800-\uDBFF][\uDC00-\uDFFF])/g, '?');
      return out;
    } catch (e) { return String(s); }
  }

  function parseDelimitedRules(raw: string | null | undefined): Record<string, number> {
    if (!raw) return {};
    const result: Record<string, number> = {};
    const entries = String(raw)
      .split(/[\n,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const [lhs, rhs] = entry.split(/[:=]/).map((value) => value?.trim());
      if (!lhs || rhs === undefined) continue;
      const value = Number(rhs);
      if (!Number.isFinite(value)) continue;
      result[lhs.toUpperCase()] = value;
    }

    return result;
  }

  function formatNumberedRules(rules: Record<string, number>, suffix = ''): string {
    const entries = Object.entries(rules)
      .filter(([, value]) => Number.isFinite(value))
      .sort(([a], [b]) => a.localeCompare(b));

    if (!entries.length) return 'none configured';
    return entries.map(([key, value]) => `${key.toUpperCase()}=${value}${suffix}`).join(', ');
  }

  function formatGeoBlockSummary(rules: Record<string, number>): string {
    const entries = Object.entries(rules)
      .filter(([, value]) => Number.isFinite(value) && value > 0)
      .sort(([a], [b]) => a.localeCompare(b));

    if (!entries.length) return 'No geo-blocked countries are currently configured.';

    const grouped = new Map<number, string[]>();
    for (const [country, level] of entries) {
      const key = Math.max(0, Math.min(5, Math.trunc(level)));
      const list = grouped.get(key) || [];
      list.push(country.toUpperCase());
      grouped.set(key, list);
    }

    const parts = Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([level, countries]) => `level ${level}: ${countries.join(', ')}`);

    return parts.join(' | ');
  }

  async function buildPolicyKnowledgeBase(): Promise<string> {
    const panelSettingRepo = AppDataSource.getRepository(PanelSetting);
    const [geoRules, geoSetting, taxSetting] = await Promise.all([
      getGeoBlockRulesWithDefaults(),
      panelSettingRepo.findOneBy({ key: 'geoBlockCountries' }),
      panelSettingRepo.findOneBy({ key: 'billingTaxRules' }),
    ]);

    const taxRules = parseDelimitedRules(taxSetting?.value || '');
    const rawGeoRules = parseDelimitedRules(geoSetting?.value || '');
    const mergedGeoRules = { ...rawGeoRules, ...geoRules };

    return [
      'Current policy knowledge base for EcliPanel support tickets:',
      'Terms of Service (effective 2026-04-13): EclipseSystems under Misiu LLC; services include server hosting, web hosting, voice server hosting, reselling, and related support. AI/automation may be used for fraud detection, abuse prevention, and security. Paid plans may include an SLA with 95% monthly uptime; free plans are excluded. Registration requires accurate information. Minimum age is 13 generally, 14 in the EU and UK, with country-specific rules possibly higher. Restricted jurisdictions are not served. Deletion requests are reviewed in about 14 days and, if approved, completed within about 14 additional days. Acceptable use and email/AI policies apply.',
      'Privacy Policy (updated 2026-04-13): we collect account information, usage data, cookies, support communication, and identity verification data when needed. We use data to provide the service, manage accounts, communicate with users, and detect/prevent abuse or fraud. We do not sell personal data. Data may be retained for support, security, compliance, billing, and legal obligations. Users may contact legal@ecli.app for privacy requests.',
      'Acceptable Use Policy: no illegal activity, malware, scanning/attacks, spam/phishing/fraud, proxy/anonymizer/C2/VPN (including Tailscale exist nodes) services unless explicitly approved, IP/privacy infringement, disruption, bypassing limits/security, or unapproved high-risk AI use. Abuse reports go to abuse@ecli.app; support@ecli.app and hi@ecli.app are also valid contacts.',
      'Other policies: Email Policy, AI Policy, DMCA/Copyright Policy, Cookies Policy, Imprint, and Minimum Age Policy exist in /legal. For policy disputes, exceptions, or legal interpretation, prefer escalation to legal@ecli.app instead of inventing an answer.',
      'Geo-block rules: level 0 = no restriction; level 1 = ID verification blocked; level 2 = free services blocked; level 3 = educational services blocked; level 4 = paid services blocked / subuser-only; level 5 = registration blocked. Current geo-blocked countries: ' + formatGeoBlockSummary(mergedGeoRules),
      'Current geo-block rule map: ' + formatNumberedRules(mergedGeoRules),
      'Current tax rules: ' + formatNumberedRules(taxRules, '%') + '. Tax resolution may use country code, country name, EU, *, or DEFAULT keys.',
    ].join('\n');
  }

  function normalizeTicketMessages(ticket: TicketLike) {
    if (!ticket) return;
    if (Array.isArray(ticket.messages)) return;

    try {
      if (typeof ticket.messages === 'string') {
        const parsed = JSON.parse(ticket.messages);
        if (Array.isArray(parsed)) {
          ticket.messages = parsed;
          return;
        }
      }

      if (ticket.messages && typeof ticket.messages === 'object') {
        const messagesObj = ticket.messages as Record<string, unknown> & { messages?: unknown };
        if (Array.isArray(messagesObj.messages)) {
          ticket.messages = messagesObj.messages;
          return;
        }

        const keys = Object.keys(messagesObj);
        const numericKeys = keys.filter((k) => /^\\d+$/.test(k));
        if (numericKeys.length === keys.length && numericKeys.length > 0) {
          ticket.messages = numericKeys
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => messagesObj[k] as TicketMessage);
          return;
        }
      }
    } catch {
      // skippy
    }

    ticket.messages = [];
  }

  function getTicketResponseDurations(ticket: TicketLike): number[] {
    const records = Array.isArray(ticket.messages) ? ticket.messages : [];
    const sorted = records
      .map((m) => {
        const msg = m as TicketMessage;
        return { sender: msg.sender, created: new Date(String(msg.created ?? '')) };
      })
      .filter((m) => m.created instanceof Date && !Number.isNaN(m.created.getTime()))
      .sort((a, b) => a.created.getTime() - b.created.getTime());

    const durations: number[] = [];
    let lastUserMessage: Date | null = null;

    for (const msg of sorted) {
      if (msg.sender === 'user') {
        lastUserMessage = msg.created;
        continue;
      }
      if (msg.sender === 'staff' && lastUserMessage) {
        const diff = msg.created.getTime() - lastUserMessage.getTime();
        if (diff >= 0) durations.push(diff);
        lastUserMessage = null;
      }
    }

    return durations;
  }

  function extractEndpoints(model: ModelLike | null | undefined): EndpointInfo[] {
    const list: EndpointInfo[] = [];
    try {
      if (Array.isArray(model?.endpoints) && model.endpoints.length) {
        for (const e of model.endpoints) {
          if (!e) continue;
          const endpoint = e.endpoint;
          const url = e.url;
          const base = String(endpoint || url || '').replace(/\/v1.*$/i, '').replace(/\/+$/, '');
          if (!base) continue;
          list.push({
            base,
            apiKey: (typeof e.apiKey === 'string' ? e.apiKey : typeof e.key === 'string' ? e.key : undefined),
            id: (typeof e.id === 'string' ? e.id : base),
          });
        }
      }
    } catch { }
    if (list.length === 0 && model?.endpoint) {
      list.push({ base: model.endpoint.toString().replace(/\/v1.*$/i, '').replace(/\/+$/, ''), apiKey: model.apiKey || undefined, id: model.endpoint });
    }
    return list;
  }

  async function requestWithFallback(opts: {
    model: ModelLike;
    path: string;
    method?: 'post' | 'get' | 'put' | 'delete';
    data?: unknown;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }) {
    const { model, path, method = 'post', data, headers = {}, timeoutMs = 60000 } = opts;
    const endpoints = extractEndpoints(model);
    if (endpoints.length === 0) throw new Error('No endpoints configured');

    const errs: Array<Record<string, unknown>> = [];
    for (const ep of endpoints) {
      const key = ep.id || ep.base;
      const cooldown = endpointCooldowns.get(key) || 0;
      if (cooldown > nowTs()) {
        errs.push({ endpoint: ep.base, reason: 'cooldown' });
        continue;
      }

      const url = `${ep.base.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
      const hdrs: Record<string, string> = {
        ...(headers || {}),
        Authorization: `Bearer ${ep.apiKey || ''}`,
        'Content-Type': 'application/json',
      };
      try {
        const res = await httpRequest(url, { method, body: data as never, headers: hdrs, timeoutMs });
        return res;
      } catch (e) {
        const err = e as { response?: { status?: number; data?: unknown; headers?: Record<string, unknown> }; message?: string };
        const status = err.response?.status;
        const body = err.response?.data as Record<string, unknown> | undefined;
        const isRate = status === 429 || (body && (String(body?.type || '').includes('rate') || String(body?.code || '').includes('rate') || String(body?.error || '').toLowerCase().includes('rate')));
        if (isRate) {
          const ra = Number(err.response?.headers?.['retry-after'] || err.response?.headers?.['x-retry-after'] || 0);
          const wait = (Number.isFinite(ra) && ra > 0) ? (ra * 1000) : 5000;
          endpointCooldowns.set(key, nowTs() + wait + 50);
          errs.push({ endpoint: ep.base, reason: 'rate_limited', wait });
          try {
            const entry = { timestamp: new Date().toISOString(), modelId: model?.id, modelName: model?.name, endpoint: ep.base, waitMs: wait };
            try { await createActivityLog({ userId: 0, action: 'ai:endpoint:cooldown', targetId: String(model?.id || ''), targetType: 'ai-model', metadata: entry, ipAddress: '', notify: false }); } catch (e) { }
          } catch (e) { }
          continue;
        }

        console.error(`[ticketHandler:requestWithFallback] endpoint ${ep.base}:`, err);
        errs.push({ endpoint: ep.base, reason: 'endpoint_error', status });
        continue;
      }
    }

    const err = new Error('All endpoints failed');
    (err as Error & { details?: Array<Record<string, unknown>> }).details = errs;
    throw err;
  }

  function resolveProviderModelId(model: ModelLike) {
    const providerId = model?.config?.modelId || model?.name;
    if (!providerId || typeof providerId !== 'string') {
      throw new Error('AI model is misconfigured: missing model identifier');
    }
    return providerId;
  }

  async function selectModelForUser(_user: User | null | undefined) {
    const all = await modelRepo.find();
    let picked: AIModel | null = null;
    for (const m of all) {
      if (Array.isArray(m.tags) && (m.tags.includes('support') || m.tags.includes('tickets'))) {
        picked = m; break;
      }
    }
    if (picked) return picked;
    return null;
  }

  async function triggerAIForTicket(ticket: TicketLike, user: (User & { orgs?: Array<{ name?: string | null }> }) | null, reason: 'creation' | 'user_reply') {
    const _t = tForUser(user);

    const log = (userId: number, action: string, targetId: string, metadata: Record<string, unknown> = {}) =>
      createActivityLog({ userId, action, targetId, targetType: 'ticket', metadata, ipAddress: '' }).catch(() => { });

    const uid = user?.id ?? 0;
    const tid = String(ticket?.id ?? '');
    const now = () => new Date();

    const levenshtein = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      if (!m) return n;
      if (!n) return m;
      const prev = Array.from({ length: n + 1 }, (_, j) => j);
      const curr = new Array(n + 1).fill(0);
      for (let i = 0; i < m; i++) {
        curr[0] = i + 1;
        for (let j = 0; j < n; j++)
          curr[j + 1] = Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + (a[i] === b[j] ? 0 : 1));
        for (let j = 0; j <= n; j++) prev[j] = curr[j];
      }
      return curr[n];
    };

    const alpha = (s: string) => s.replace(/[^a-zA-Z]/g, '').toUpperCase();

    const OUTAGE_WORDS = [
      'node offline', 'node is offline', 'node unreachable', 'node down', 'node-wide', 'node wide',
      'all servers unreachable', 'servers unreachable', 'servers are unreachable', 'outage',
      "users can't access", 'users cannot access', 'host unreachable', 'service down',
    ];
    const hasOutage = (t: string) => { const l = t.toLowerCase(); return OUTAGE_WORDS.some(p => l.includes(p)); };

    const parseJson = (raw: string): unknown => {
      try { return JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
    };

    const callModel = async (model: ModelLike, messages: Array<{ role: string; content: string }>, maxTokens: number, timeout: number) => {
      const res = await requestWithFallback({
        model, path: '/v1/chat/completions', method: 'post',
        data: { model: resolveProviderModelId(model), messages, max_tokens: maxTokens }, timeoutMs: timeout,
      });
      const payload = res?.data as Record<string, unknown> | undefined;
      const choices = payload?.choices as Array<{ message?: { content?: unknown } }> | undefined;
      return String(choices?.[0]?.message?.content ?? res?.data ?? '').trim();
    };

    const buildContext = (): string => {
      const l: string[] = [];
      if (user) {
        l.push(`User ID: ${user.id ?? ''}`);
        l.push(`Name: ${[user.firstName, user.lastName].filter(Boolean).join(' ')}`);
        l.push(`Email: ${user.email ?? ''}`);
        l.push(`Role: ${user.role ?? ''}`);
        l.push(`Plan/Portal Type: ${user.portalType ?? ''}`);
        const orgs = user.orgs;
        const orgNames = Array.isArray(orgs)
          ? orgs.map((o) => o?.name).filter(Boolean)
          : [];
        if (orgNames.length > 0) l.push(`Organisations: ${orgNames.join(', ')}`);
      }
      l.push(`Ticket ID: ${ticket.id ?? ''}`);
      l.push(`Ticket priority: ${ticket.priority ?? ''}`);
      l.push(`Ticket department: ${ticket.department ?? ''}`);
      l.push(`Ticket status: ${ticket.status ?? ''}`);
      l.push(`Ticket subject: ${ticket.subject ?? ''}`);
      return l.join('\n');
    };

    const conversationMessages = (): { role: string; content: string }[] =>
      (Array.isArray(ticket.messages) ? ticket.messages : [])
        .filter((h) => {
          const msg = h as TicketMessage;
          return msg.sender === 'user' || msg.sender === 'staff';
        })
        .map((h) => {
          const msg = h as TicketMessage;
          return {
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: String(msg.message || ''),
          };
        });

    const fullConversationText = (): string =>
      (Array.isArray(ticket.messages) ? ticket.messages : [])
        .map((m) => {
          const msg = m as TicketMessage;
          return `[${msg.sender}] ${msg.message || ''}`;
        }).join('\n');

    interface Directive {
      escalate: boolean;
      spam: boolean;
      close: boolean;
      sets: Record<string, string>;
      internalNote: string | null;
      confidence: 'high' | 'medium' | 'low';
    }

    const empty = (): Directive => ({
      escalate: false, spam: false, close: false, sets: {},
      internalNote: null, confidence: 'medium',
    });

    const extractFallback = (text: string): Directive => {
      const d = empty();
      const bracket = text.match(/^\s*\[([^\]]+)\]/i);
      if (bracket) {
        const tok = alpha(bracket[1]);
        if (tok === 'SPAM' || levenshtein(tok, 'SPAM') <= 1) d.spam = true;
        if (tok === 'CLOSE' || levenshtein(tok, 'CLOSE') <= 1) d.close = true;
        if (tok === 'ESCALATE' || levenshtein(tok, 'ESCALATE') <= 1) d.escalate = true;
      }
      if (!d.escalate) {
        if (/\bESCALATE\b/i.test(text)) {
          d.escalate = true;
        } else {
          const words = (text.match(/[A-Za-z]{4,}/g) ?? []).slice(0, 60);
          d.escalate = words.some(w => levenshtein(alpha(w), 'ESCALATE') <= 1);
        }
      }
      const pm = text.match(/\bpriority\s*[:=]?\s*(urgent|high|medium|low)\b/i);
      if (pm) d.sets.priority = pm[1].toLowerCase();
      const dm = text.match(/\bdepartment\s*[:=]?\s*(Technical Support|Billing|Sales|Security)\b/i);
      if (dm) d.sets.department = dm[1];
      if (hasOutage(text)) { d.escalate = true; d.sets.priority = 'urgent'; d.sets.department = 'Technical Support'; }
      return d;
    };

    const SHELL_CMDS = [
      'sudo', 'systemctl', 'docker', 'service', 'journalctl', 'cd', 'nano', 'vim',
      'cat', 'tail', 'grep', 'curl', 'wget', 'apt', 'yum', 'kill', 'reboot',
      'shutdown', 'wings', 'ssh', 'scp', 'rsync', 'chmod', 'chown', 'mount',
      'umount', 'fdisk', 'mkfs', 'iptables', 'ufw', 'firewall-cmd', 'nftables',
      'rm', 'mv', 'cp', 'ln', 'tar', 'gzip', 'unzip', 'pip', 'npm', 'node',
      'python', 'php', 'mysql', 'psql', 'redis-cli', 'mongosh', 'htop', 'top',
      'ps', 'netstat', 'ss', 'lsof', 'df', 'du', 'free', 'dmesg', 'modprobe',
    ];
    const shellCmdPattern = new RegExp(
      `(?:^|\\n)\\s*(?:\\$|#|>)?\\s*(?:${SHELL_CMDS.join('|')})\\s+.+`, 'gi'
    );
    const ESCALATION_REPLACEMENT = '\n> _[This step requires infrastructure team action — it has been escalated automatically.]_\n';

    const sanitizeShellCommands = (text: string): { text: string; wasFiltered: boolean } => {
      let result = text;
      let wasFiltered = false;

      const codeBlockPattern = /`{1,3}(?:bash|sh|shell|terminal|console|ssh|zsh|ksh|fish|powershell|cmd)?\s*\n[\s\S]*?`{1,3}/gi;
      const afterCodeBlock = result.replace(codeBlockPattern, ESCALATION_REPLACEMENT);
      if (afterCodeBlock !== result) { result = afterCodeBlock; wasFiltered = true; }

      const afterInline = result.replace(shellCmdPattern, ESCALATION_REPLACEMENT);
      if (afterInline !== result) { result = afterInline; wasFiltered = true; }

      const backtickCmd = new RegExp(
        `\`(?:${SHELL_CMDS.join('|')})\\s+[^\`]+\``, 'gi'
      );
      const afterBacktick = result.replace(backtickCmd, '`[escalated to infrastructure team]`');
      if (afterBacktick !== result) { result = afterBacktick; wasFiltered = true; }

      const runPattern = new RegExp(
        `(?:run|execute|type|enter|use the command|issue the command)\\s*[:"]?\\s*(?:${SHELL_CMDS.join('|')})\\s+[^.\\n]+`, 'gi'
      );
      const afterRun = result.replace(runPattern, 'contact our infrastructure team for this step');
      if (afterRun !== result) { result = afterRun; wasFiltered = true; }

      const hostActionPattern = /(?:^|\n)\s*(?:host action|server-side|node-level|root action)[:\s].+(?:\n(?!\s*(?:panel action|$)).+)*/gi;
      const afterHost = result.replace(hostActionPattern, ESCALATION_REPLACEMENT);
      if (afterHost !== result) { result = afterHost; wasFiltered = true; }

      const sshConditional = /(?:if you have|assuming you have|with|using your)\s+(?:ssh|root|shell|terminal|node|host)\s+access[^.]*\./gi;
      const afterSshCond = result.replace(sshConditional, 'Our infrastructure team will handle any server-side steps.');
      if (afterSshCond !== result) { result = afterSshCond; wasFiltered = true; }

      return { text: result.trim(), wasFiltered };
    };

    const apply = async (reply: string, dir: Directive) => {
      normalizeTicketMessages(ticket);
      if (!Array.isArray(ticket.messages)) ticket.messages = [];
      const ts = now();

      const allText = reply + ' ' + fullConversationText();
      const outageDetected = hasOutage(allText);
      if (outageDetected) {
        dir.escalate = true;
        if (!dir.sets.priority) dir.sets.priority = 'urgent';
        if (!dir.sets.department) dir.sets.department = 'Technical Support';
      }

      if (dir.spam) {
        const safe = sanitizeForDb(reply || 'Marked as spam by AI.');
        ticket.messages.push({ id: makeMsgId(), sender: 'staff', message: safe, created: ts, ai: true, staffName: 'EcliAI', staffDisplayName: 'EcliAI' });
        ticket.messages.push({ id: makeMsgId(), sender: 'system', message: _t('ticket.aiSpamMarked'), created: ts });
        ticket.adminReply = safe;
        Object.assign(ticket, { aiTouched: true, aiMarkedSpam: true, aiDisabled: true, priority: 'low' });
        await repo.save(ticket);
        await log(uid, 'ticket:ai:spam', tid);
        return;
      }

      if (dir.close) {
        const safe = sanitizeForDb(reply || 'Closed by AI. Human verification required.');
        ticket.messages.push({ id: makeMsgId(), sender: 'staff', message: safe, created: ts, ai: true, staffName: 'EcliAI', staffDisplayName: 'EcliAI' });
        ticket.messages.push({ id: makeMsgId(), sender: 'system', message: _t('ticket.aiClosedForVerification'), created: ts });
        ticket.adminReply = safe;
        Object.assign(ticket, { aiTouched: true, aiClosed: true, aiDisabled: true, status: 'closed' });
        await repo.save(ticket);
        await log(uid, 'ticket:ai:close', tid);
        return;
      }

      const changes: { applied: Record<string, string>; rejected: Record<string, string> } = { applied: {}, rejected: {} };

      if (dir.sets.priority) {
        const v = dir.sets.priority.toLowerCase();
        const current = (ticket.priority || '').toLowerCase();
        if (ALLOWED_PRIORITIES.includes(v)) {
          if (current !== v) { ticket.priority = v; changes.applied.priority = v; }
        } else {
          changes.rejected.priority = dir.sets.priority;
        }
      }

      if (dir.sets.department) {
        const match = ALLOWED_DEPARTMENTS.find(d => d.toLowerCase() === dir.sets.department.toLowerCase());
        const current = (ticket.department || '').toLowerCase();
        if (match) {
          if (current !== match.toLowerCase()) { ticket.department = match; changes.applied.department = match; }
        } else {
          changes.rejected.department = dir.sets.department;
        }
      }

      const safe = sanitizeForDb(reply);
      ticket.messages.push({ id: makeMsgId(), sender: 'staff', message: safe, created: ts, ai: true, staffName: 'EcliAI', staffDisplayName: 'EcliAI' });
      ticket.adminReply = safe;

      const appliedEntries = Object.entries(changes.applied);
      if (appliedEntries.length || outageDetected || dir.escalate) {
        const parts: string[] = [];
        if (appliedEntries.length) parts.push(`applied changes: ${appliedEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
        if (outageDetected) parts.push('node-wide outage detected');
        if (dir.escalate) parts.push('escalated to human staff');
        if (dir.confidence === 'low') parts.push('low confidence reply');
        ticket.messages.push({
          id: makeMsgId(),
          sender: 'system',
          message: `System: AI ${parts.join('; ')}.`,
          created: ts,
        });
      }

      if (dir.internalNote) {
        ticket.messages.push({
          id: makeMsgId(),
          sender: 'system',
          message: `AI Internal Note: ${dir.internalNote}`,
          created: ts,
        });
      }

      ticket.aiTouched = true;
      if (dir.escalate) {
        ticket.aiDisabled = true;
      }
      ticket.status = dir.escalate || changes.applied.priority === 'urgent' ? 'awaiting_staff_reply' : 'replied';
      await repo.save(ticket);

      const logMeta: Record<string, unknown> = { modelId: undefined, confidence: dir.confidence };
      if (appliedEntries.length) logMeta.changes = changes;
      if (outageDetected) logMeta.outageDetected = true;
      if (dir.escalate) logMeta.escalated = true;
      if (dir.internalNote) logMeta.internalNote = dir.internalNote;

      const action = dir.escalate ? 'ticket:ai:escalate'
        : appliedEntries.length ? 'ticket:ai:set'
          : 'ticket:ai:reply';
      await log(uid, action, tid, logMeta);
    };

    try {
      if (ticket?.aiDisabled) { await log(uid, 'ticket:ai:skipped', tid, { reason: 'ai_disabled' }); return; }

      const model = await selectModelForUser(user);
      if (!model) { await log(uid, 'ticket:ai:skipped', tid, { reason: 'no_model_configured' }); return; }

      let planSummary = 'Plan table is empty.';
      try {
        const plans = await planRepo.find({ order: { price: 'ASC' } });
        if (plans.length) {
          planSummary = plans.map((p) => {
            const features = p.features && typeof p.features === 'object' ? JSON.stringify(p.features) : 'none';
            const priceText = (p.type && String(p.type).toLowerCase() === 'enterprise') ? 'varies' : `$${p.price}/mo`;
            return `- ${p.name} (${p.type}) ${priceText}: memory=${p.memory ?? 'n/a'}MB, disk=${p.disk ?? 'n/a'}MB, cpu=${p.cpu ?? 'n/a'}, servers=${p.serverLimit ?? 'n/a'}, databases=${p.databases ?? 'n/a'}, backups=${p.backups ?? 'n/a'}, ports=${p.portCount ?? 'n/a'}, tunnelPorts=${p.tunnelPortCount ?? 'n/a'}, features=${features}`;
          }).join('\n');
        }
      } catch { /* skip */ }

      let policyKnowledgeBase = 'Policy knowledge base unavailable.';
      try {
        policyKnowledgeBase = await buildPolicyKnowledgeBase();
      } catch { /* skip */ }

      const policyKnowledgeMessage = {
        role: 'system',
        content: `Policy knowledge base:\n${policyKnowledgeBase}`,
      };

      // STAGE 1 aka Intent Classification & Routing

      		const stage1System = `You are a ticket intent classifier for EcliPanel (game/app server hosting).
Analyze the ticket conversation and classify it.

Output JSON only — no markdown, no explanation:
{
  "intent": "technical" | "billing" | "sales" | "account" | "abuse" | "spam" | "outage" | "general",
  "subIntent": string,
  "gameOrApp": string,
  "severity": "critical" | "high" | "medium" | "low",
  "needsHumanExpertise": boolean,
  "isSpam": boolean,
  "isOutage": boolean,
  "missingInfo": string[],
  "suggestedDepartment": "${ALLOWED_DEPARTMENTS.join('" | "')}",
  "suggestedPriority": "${ALLOWED_PRIORITIES.join('" | "')}",
  "suggestedRootCause": string,
  "summary": "one-line summary of the issue"
}

Intent definitions:
- "technical": server config, mods/plugins, startup/crash, performance, ports, files, databases, backups, connectivity
- "billing": payments, invoices, plans, upgrades, downgrades, refunds, pricing
- "sales": pre-purchase questions, plan comparisons, feature availability
- "account": login, 2FA, email, password, identity verification, organisations, sub-users
- "abuse": ToS/AUP violations, DDoS reports, security incidents, DMCA
- "spam": obvious spam, gibberish, ads, phishing, NSFW
- "outage": node down, host unreachable, multiple servers down simultaneously, service-wide failure
- "general": everything else

Field rules:
- "subIntent": be specific — "minecraft_server_wont_start", "forge_mod_crash", "port_not_open", "database_connection_refused", "file_too_large_upload", "billing_invoice_question". Use kebab-case.
- "gameOrApp": identify the game/application (Minecraft, Valheim, Palworld, CS2, Rust, Terraria, Node.js, Python, etc). Empty string if unclear.
- "severity": "critical" = complete outage, data loss, node failure. "high" = server won't start, can't connect, major feature broken. "medium" = config/mod issues, partial degradation. "low" = questions, how-to, info requests.
- "needsHumanExpertise": true for SSH/root/node access required, billing disputes, refunds, legal/privacy/tax/geo-block disputes or exceptions, security incidents, hardware failure, data recovery, or anything unresolvable through the web panel alone.
- "isSpam": true ONLY for obvious spam/abuse — gibberish, ads, phishing, NSFW. Be conservative.
- "isOutage": true for node down, node offline, multiple servers unreachable, host unreachable, service-wide failure.
- "missingInfo": list every specific detail a support agent would need (server ID, error message, game version, mod/plugin name, node name, screenshot, what they already tried). Be thorough. Empty array if the ticket has everything needed.
- "suggestedRootCause": your best guess at what's causing the issue based on symptoms. Be specific ("OutOfMemoryError - too little RAM", "Forge mod version mismatch with server jar", "server-port already bound"). Empty string if unclear. Helps the reply generator provide targeted steps.`;

      const stage1Messages = [
        { role: 'system', content: stage1System },
        policyKnowledgeMessage,
        { role: 'system', content: `Context:\n${buildContext()}` },
        ...conversationMessages(),
        { role: 'user', content: 'Classify this ticket. Output JSON only.' },
      ];

      interface IntentResult {
        intent: string; subIntent: string; gameOrApp: string; severity: string;
        needsHumanExpertise: boolean; isSpam: boolean; isOutage: boolean;
        missingInfo: string[]; suggestedDepartment: string; suggestedPriority: string;
        suggestedRootCause: string; summary: string;
      }

      let intent: IntentResult | null = null;
      try {
        const raw = await callModel(model, stage1Messages, 300, 15_000);
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === 'object') {
          const parsedObj = parsed as Record<string, unknown>;
          intent = {
            intent: String(parsedObj.intent || 'general'),
            subIntent: String(parsedObj.subIntent || ''),
            gameOrApp: String(parsedObj.gameOrApp || ''),
            severity: String(parsedObj.severity || 'medium'),
            needsHumanExpertise: Boolean(parsedObj.needsHumanExpertise),
            isSpam: Boolean(parsedObj.isSpam),
            isOutage: Boolean(parsedObj.isOutage),
            missingInfo: Array.isArray(parsedObj.missingInfo) ? parsedObj.missingInfo.map(String) : [],
            suggestedDepartment: String(parsedObj.suggestedDepartment || ''),
            suggestedPriority: String(parsedObj.suggestedPriority || ''),
            suggestedRootCause: String(parsedObj.suggestedRootCause || ''),
            summary: String(parsedObj.summary || ''),
          };
        }
      } catch { /* skip */ }

      await log(uid, 'ticket:ai:stage1:intent', tid, { intent });

      if (intent?.isSpam) {
        const dir = empty();
        dir.spam = true;
        dir.internalNote = `Intent classifier flagged as spam. Summary: ${intent.summary}`;
        await apply('This ticket has been flagged and closed. If you believe this is an error, please contact contact@ecli.app.', dir);
        return;
      }

      if (intent?.isOutage && intent?.severity === 'critical') {
        const dir = empty();
        dir.escalate = true;
        dir.sets.priority = 'urgent';
        dir.sets.department = 'Technical Support';
        dir.confidence = 'high';
        dir.internalNote = `Intent classifier detected critical outage. Summary: ${intent.summary}`;
        const outageReply = `We've detected that this appears to be a node-level outage. Our infrastructure team has been notified and this ticket has been escalated to Priority: Urgent.

**What you can check from the panel while you wait:**
1. **Panel action:** Go to /wings — confirm the affected node shows as offline/unavailable.
2. **Panel action:** Check https://status.ecli.app/ for any known ongoing incidents.
3. **Panel action:** Go to /dashboard/servers — check if all your servers on that node show as offline.

Our team will investigate and provide an update as soon as possible. You do not need to take any further action — we'll reply here with a status update.

If you need immediate assistance, you can also reach us at contact@ecli.app.`;
        await apply(outageReply, dir);
        return;
      }


      // STAGE 2 aka Generate User-Facing Reply

      const intentContext = intent ? `
AI Intent Analysis (use this to guide your reply):
- Intent: ${intent.intent} / ${intent.subIntent}
- Game/App: ${intent.gameOrApp || 'unknown'}
- Severity: ${intent.severity}
- Needs human expertise: ${intent.needsHumanExpertise}
- Suggested root cause: ${intent.suggestedRootCause || 'unclear from ticket'}
- Missing info from user: ${intent.missingInfo.length ? intent.missingInfo.join(', ') : 'none'}
- Summary: ${intent.summary}
${intent.needsHumanExpertise ? '\nIMPORTANT: This issue requires human expertise. Provide what panel-level guidance you can, then clearly state the infrastructure/support team will handle the rest. Do NOT attempt to fully resolve it.' : ''}
${intent.missingInfo.length ? `\nIMPORTANT: Ask the user for these missing details: ${intent.missingInfo.join(', ')}` : ''}
${intent.suggestedRootCause ? `\nIMPORTANT: The likely root cause is "${intent.suggestedRootCause}". Focus your troubleshooting steps on this.` : ''}` : '';

      const stage2System = `You are EcliPanel's AI support assistant for game and application server hosting. Write a helpful, concise, and empathetic reply to this support ticket.

=== CORE RULES — VIOLATING ANY OF THESE MAKES THE REPLY HARMFUL ===

1. PANEL-ONLY ACTIONS: Only suggest actions the user can perform through the EcliPanel web dashboard (ecli.app). Clicking buttons, navigating pages, using the file manager, panel console (game commands only), panel restart/stop/start buttons.

2. NO SHELL/SSH/ROOT/TERMINAL: Never include or reference: ${SHELL_CMDS.slice(0, 15).join(', ')}, or ANY command typed into a terminal. Never say "if you have SSH access", "connect via SSH", "on the host", "on the node", "in the terminal", "run this command", "as root", or "via SFTP" (except when referencing panel-provided SFTP credentials shown in the file manager).

3. THE PANEL CONSOLE: /dashboard/servers/[id] → Console is a GAME SERVER console for in-game commands like /op, /whitelist, /say. It is NOT a system terminal. Never suggest system commands there.

4. WHEN YOU CAN'T RESOLVE IT: If the issue requires node/host/SSH/infrastructure access, say: "This requires our infrastructure team — I've escalated your ticket and our team will handle it. In the meantime, here's what you can check from the panel:" then list panel-level checks.

5. NO FABRICATION: Don't invent error messages, server states, plan features, policy details, or prices. If you don't know something specific, ask the user for it or say you're unsure.

6. NO PROMISES: Don't promise refunds, SLA credits, uptime guarantees, compensation, or legal outcomes. Point to /dashboard/billing and contact@ecli.app for billing matters.

=== COMMON ISSUES & PANEL-LEVEL SOLUTIONS ===

**Server won't start / crashes on startup:**
→ First, ask for the specific error if the user hasn't provided it.
1. /dashboard/servers/[id] → Console — look for red error lines. Common ones:
   - "OutOfMemoryError" / "Java heap space" → server needs more RAM (upgrade at /dashboard/billing)
   - "Port already in use" → change server-port in server.properties to a different port
   - "ModLoadingException" / "Missing dependencies" → missing or wrong-version mod in /mods folder
   - "Incompatible mod" / "Missing required mod" → mod version doesn't match server/game version
   - "EULA" / "eula.txt" → /dashboard/servers/[id] → Files → edit eula.txt, change false to true
   - "Unsupported class version" → wrong Java version for the server jar
2. /dashboard/servers/[id] → Startup — verify Java version matches your server:
   - Minecraft 1.21+ → Java 21 | 1.17–1.20 → Java 17 | 1.16 and below → Java 8 or 11
   - Forge/Fabric: check mod documentation for required Java version
   - Verify the server jar filename is correct
3. /dashboard/servers/[id] → Files → logs/latest.log — scroll to the bottom for the most recent error.
4. Last resort: /dashboard/servers/[id] → Settings → Reinstall Server (back up world/configs first via file manager download).

**How to install mods / plugins / addons:**
1. /dashboard/servers/[id] → Files.
2. Plugins (Paper/Spigot/Purpur/Bungee/Velocity): upload .jar to plugins/ folder → Restart.
3. Mods (Forge/Fabric/NeoForge/Quilt): upload .jar to mods/ folder → Restart. Verify the mod matches your loader AND game version.
4. Resource packs / datapacks (Minecraft): /dashboard/servers/[id] → Files → world/datapacks/.
5. After uploading all files: /dashboard/servers/[id] → Restart.

**Can't connect to server / "Connection refused" / timeout:**
1. /dashboard/servers/[id] — confirm server status is "Running" (green indicator).
2. /dashboard/servers/[id] → Settings — note the server port number.
3. Connect using: [node].ecli.app:[port] (e.g., n1.ecli.app:25565 for Minecraft).
4. /wings — verify the node is online (green status).
5. /dashboard/servers/[id] → Console — type "list" (Minecraft) or equivalent to confirm server is running and accepting connections.
6. Check server.properties (Minecraft): server-ip should be blank (unless you have a specific network setup); server-port must match what you're connecting to.
7. Verify your local firewall or ISP isn't blocking the outbound connection on that port.

**File Manager / uploading files:**
1. /dashboard/servers/[id] → Files — browse, upload, edit, delete files.
2. Click any file name to edit it inline (for config files like server.properties, spigot.yml, etc.).
3. For large files or many files, use the SFTP credentials shown on the Files page (connect via FileZilla, WinSCP, or similar client).
4. ZIP files uploaded through the panel are NOT auto-extracted — extract locally and upload individual files, or use SFTP.

**Database connection issues:**
1. /dashboard/servers/[id] → Databases — view host, port, database name, username, password.
2. From your server process, connect to localhost:[port] or 127.0.0.1:[port] — NOT the public node address.
3. Test credentials by creating a new database user via the panel to verify access.
4. For MySQL/MariaDB, ensure your plugin/mod has the correct JDBC URL format: jdbc:mysql://localhost:[port]/[database].

**Performance / lag / high CPU / TPS drops (Minecraft):**
1. /dashboard/servers/[id] → Console — check for spammy errors, plugin conflicts, or "[Server] Can't keep up!" messages.
2. /dashboard/servers/[id] → Files → logs/latest.log — look for plugins taking too long to tick (>50ms entries).
3. /dashboard/billing — check your plan's resource limits; you may need an upgrade.
4. Common causes: too many entities/mobs, chunk loaders left running, unoptimized mods, memory leaks in older plugin versions, oversized world border.

**Backup and restore:**
1. /dashboard/servers/[id] → Settings — look for Backups section (availability depends on plan).
2. Manual backup: download the world/ folder and any config folders via SFTP or file manager.
3. Restoring: upload files back to the same locations, overwriting existing ones, then restart the server.

**Domain / DNS / reverse proxy:**
1. EcliPanel does not provide DNS hosting — use your domain registrar or Cloudflare.
2. Point A records to the node IP (check /wings for node details) or SRV records for Minecraft (_minecraft._tcp).
3. For web servers / reverse proxy: configure your app to listen on the port assigned in /dashboard/servers/[id] → Settings.

**User account / login issues:**
1. /dashboard/settings — change email, password.
2. /dashboard/identity — identity verification (KYC) if required by your plan or region.
3. For 2FA issues: use backup codes provided during setup. If lost, contact support at contact@ecli.app.
4. /dashboard/organisations — manage team access and sub-users.

**Free plan context:**
- Free plans have restricted support priority, fewer resources, and no SLA.
- Upgrading at /dashboard/billing unlocks higher support priority and more resources.
- If the user is on a free plan and the issue is complex, be upfront that paid plans include priority support.

=== PANEL NAVIGATION REFERENCE ===
/dashboard — account overview, resource usage
/dashboard/servers — server list, status indicators
/dashboard/servers/[id]/console — game server console (IN-GAME commands only)
/dashboard/servers/[id]/files — file manager
/dashboard/servers/[id]/databases — database management
/dashboard/servers/[id]/schedules — scheduled tasks
/dashboard/servers/[id]/settings — server settings, reinstall, transfer
/dashboard/servers/[id]/startup — startup parameters, Java version, server jar
/dashboard/billing — plans, invoices, upgrades, payment methods
/dashboard/organisations — team/organisation management
/dashboard/settings — account settings
/dashboard/identity — identity verification
/dashboard/activity — activity logs
/dashboard/ai — AI assistant settings
/infrastructure/code-instances — code server instances (VS Code Server)
/wings — node status overview
https://status.ecli.app/ — service status and incident page
https://ecli.app/legal — all legal policies (ToS, Privacy, AUP, etc.)
Email: contact@ecli.app (general/sales), legal@ecli.app (legal/privacy), abuse@ecli.app (abuse reports)
Official domains: ecli.app, eclipsesystems.top (node domains: n[number].ecli.app)

=== REPLY STRUCTURE ===

Structure your reply like this:
1. **Empathy** (1 sentence): Acknowledge their issue. "I understand your [game] server is [issue] — let's get this sorted."
2. **What you need** (optional, 1-2 sentences): If critical info is missing, ask for it: "To give you the most accurate steps, I'll need: [specific info]."
3. **Steps** (2-5 numbered items): Specific actions with EXACT panel paths and button names.
4. **Fallback** (1 sentence): "If these steps don't resolve it, [try checking logs at /dashboard/servers/[id]/files/logs and share the error message / we'll escalate to our infrastructure team]."
5. **Closing** (1 sentence, optional): Reassuring note.

Keep the ENTIRE reply under 500 words. Be direct — no filler, no corporate-speak.

=== REPLY GUIDELINES ===

- Match the user's technical level. If they're new, explain terms. If experienced, be concise.
- For policy questions (ToS, Privacy, AUP, geo-block, taxes): answer from the policy knowledge base provided. Always add: "I'm an AI assistant, not a lawyer. Please review the full policies at https://ecli.app/legal."
- For billing disputes/refunds: "I've noted your concern. Our billing team handles this — please also email contact@ecli.app with your invoice details."
- If the user is frustrated: acknowledge it genuinely, don't deflect.
- If the ticket has gone back and forth multiple times without resolution, escalate to human staff.

=== PLAN CATALOG ===
${planSummary}

=== STUDENT / HACK CLUB PLAN ===
1. /dashboard/billing → click "Connect with Hack Club" (or GitHub if available)
2. Complete OAuth consent
3. System verifies eligibility and converts portal to educational tier
4. If not automatically approved, submit documentation to contact@ecli.app

${intentContext}

IMPORTANT: Write ONLY the user-facing reply text. No JSON, no control tokens, no [ESCALATE]/[SPAM]/[CLOSE] markers, no meta-commentary. Just the reply.`;

      const stage2Messages = [
        { role: 'system', content: stage2System },
        policyKnowledgeMessage,
        { role: 'system', content: `User & Ticket context:\n${buildContext()}` },
        ...conversationMessages(),
        {
          role: 'user',
          content: reason === 'creation'
            ? `A user opened this ticket with subject: "${ticket.subject}". Provide a helpful staff reply. ONLY panel-level actions. NEVER terminal/SSH/root commands.`
            : 'The user replied to this ticket. Provide a helpful staff reply to move the issue forward. ONLY panel-level actions. NEVER terminal/SSH/root commands.',
        },
      ];

      let aiReply: string;
      try {
        aiReply = await callModel(model, stage2Messages, 800, 60_000);
      } catch (err) {
        const caught = err as { message?: string };
        await log(uid, 'ticket:ai:skipped', tid, { reason: 'stage2_failed', error: String(caught?.message ?? err) });
        throw err;
      }

      if (!aiReply) {
        await log(uid, 'ticket:ai:skipped', tid, { reason: 'empty_response', modelId: model.id });
        return;
      }

      aiReply = aiReply.replace(/^\s*\[[^\]]+\]\s*/i, '').trim();

      const sanitized = sanitizeShellCommands(aiReply);
      aiReply = sanitized.text;
      const wasFiltered = sanitized.wasFiltered;

      if (wasFiltered) {
        await log(uid, 'ticket:ai:stage2:filtered', tid, { reason: 'shell_commands_stripped' });
      }

      // STAGE 3 aka Control Directive Classification

      const stage3System = `You are a ticket-control classifier for EcliPanel support.
You receive: ticket conversation, AI intent analysis, and the AI-generated reply.
Output a JSON object with control directives. NOTHING else — no markdown, no explanation.

{
  "escalate": boolean,
  "spam": boolean,
  "close": boolean,
  "sets": { "priority"?: string, "department"?: string },
  "internalNote": string | null,
  "confidence": "high" | "medium" | "low"
}

Rules:
- "escalate": true if human staff must act (node/host issues, SSH needed, billing disputes, legal/privacy/tax/geoblock disputes or exceptions, security, AI cannot resolve, outage).
- "spam": true ONLY for obvious spam/abuse (gibberish, ads, phishing).
- "close": true ONLY if the issue is definitively resolved in the reply. Be conservative.
- "sets": ONLY include keys that should CHANGE.
  Current priority: "${ticket.priority || 'medium'}"
  Current department: "${ticket.department || 'General'}"
  Allowed priorities: ${ALLOWED_PRIORITIES.join(', ')}
  Allowed departments: ${ALLOWED_DEPARTMENTS.join(', ')}
  If a value already matches current, DO NOT include it.
- "internalNote": brief note for human staff if escalating (why, what to check). null if not needed.
- "confidence": how confident the AI reply resolves the issue.
  "high" = clear resolution provided, "medium" = partial help, "low" = mostly guessing or asking for info.

${intent ? `Intent analysis from Stage 1: ${JSON.stringify(intent)}` : ''}`;

      const stage3Messages = [
        { role: 'system', content: stage3System },
        policyKnowledgeMessage,
        ...conversationMessages(),
        { role: 'assistant', content: aiReply },
        { role: 'user', content: 'Output the control directive JSON for this ticket. JSON only, no other text.' },
      ];

      let directive: Directive;
      try {
        const raw = await callModel(model, stage3Messages, 250, 20_000);
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === 'object') {
          const parsedObj = parsed as Record<string, unknown>;
          directive = {
            escalate: Boolean(parsedObj.escalate),
            spam: Boolean(parsedObj.spam),
            close: Boolean(parsedObj.close),
            sets: parsedObj.sets && typeof parsedObj.sets === 'object' ? (parsedObj.sets as Record<string, string>) : {},
            internalNote: parsedObj.internalNote ? String(parsedObj.internalNote) : null,
            confidence: ['high', 'medium', 'low'].includes(String(parsedObj.confidence)) ? (String(parsedObj.confidence) as 'high' | 'medium' | 'low') : 'medium',
          };
        } else {
          directive = extractFallback(aiReply);
        }
      } catch {
        directive = extractFallback(aiReply);
      }

      if (wasFiltered) directive.escalate = true;
      if (intent?.needsHumanExpertise) directive.escalate = true;
      if (intent?.isOutage) { directive.escalate = true; directive.sets.priority = directive.sets.priority || 'urgent'; }

      await log(uid, 'ticket:ai:stage3:directive', tid, { directive, wasFiltered, intentOverrides: { wasFiltered, needsHuman: intent?.needsHumanExpertise, isOutage: intent?.isOutage } });

      // STAGE 4 aka Reply Quality Gate 

      const replyLength = aiReply.length;
      const needsQualityCheck = directive.confidence === 'low'
        || replyLength < 80
        || replyLength > 2500
        || wasFiltered;

      if (needsQualityCheck) {
        const stage4System = `You are a quality reviewer for AI-generated support replies at EcliPanel.
Review the reply for these issues and output JSON:

{
  "passesQuality": boolean,
  "issues": string[],
  "containsShellCommands": boolean,
  "containsInventedInfo": boolean,
  "containsWrongLinks": boolean,
  "suggestedFix": string | null
}

Check for:
1. Shell/SSH/terminal/root commands (systemctl, docker, sudo, etc) — these are FORBIDDEN.
2. Invented information not supported by the ticket context or policy knowledge base, including ToS, Privacy Policy, Acceptable Use, geo-block, or tax details.
3. Links to domains other than ecli.app, ecli.app, eclipsesystems.top, or status.ecli.app.
4. Promises about refunds, SLAs, uptime guarantees, taxes, exemptions, or legal outcomes the AI shouldn't make.
5. Reply is too short to be helpful (< 2 sentences) or too verbose.
6. References to "SSH access", "root access", "terminal", "command line" in any form.

Official domains: ecli.app, ecli.app, eclipsesystems.top
Valid subpaths: /dashboard/*, /wings, /billing, /organisations, /docs, /ai, /infrastructure/*`;

        const stage4Messages = [
          { role: 'system', content: stage4System },
          policyKnowledgeMessage,
          { role: 'system', content: `Ticket context:\n${buildContext()}` },
          { role: 'user', content: `Review this AI reply:\n\n---\n${aiReply}\n---\n\nOutput quality check JSON only.` },
        ];

        try {
          const raw = await callModel(model, stage4Messages, 200, 15_000);
          const parsed = parseJson(raw);
          if (parsed && typeof parsed === 'object') {
            const parsedObj = parsed as Record<string, unknown>;
            const passes = Boolean(parsedObj.passesQuality);
            const hasShell = Boolean(parsedObj.containsShellCommands);
            const hasInvented = Boolean(parsedObj.containsInventedInfo);
            const hasWrongLinks = Boolean(parsedObj.containsWrongLinks);
            const issues = Array.isArray(parsedObj.issues) ? parsedObj.issues : [];

            await log(uid, 'ticket:ai:stage4:quality', tid, { passes, issues, hasShell, hasInvented, hasWrongLinks });

            if (hasShell) {
              const reSanitized = sanitizeShellCommands(aiReply);
              aiReply = reSanitized.text;
              directive.escalate = true;
              if (!directive.internalNote) directive.internalNote = '';
              directive.internalNote += ' Quality gate caught shell commands after initial filter.';
            }

            if (hasWrongLinks) {
              aiReply = aiReply.replace(/https?:\/\/(?!(?:ecli\.app|eclipsesystems\.org|eclipsesystems\.top|status\.eclipsesystems\.org))[^\s)>\]]+/gi, '[link removed]');
            }

            if (!passes && issues.length > 2) {
              directive.confidence = 'low';
              directive.escalate = true;
              if (!directive.internalNote) directive.internalNote = '';
              directive.internalNote += ` Quality gate failed: ${issues.join('; ')}`;
            }
          }
        } catch {
          await log(uid, 'ticket:ai:stage4:error', tid, { reason: 'quality_check_failed' });
        }
      }

      await apply(aiReply, directive);

    } catch (e) {
      const caught = e as { message?: string; details?: unknown };
      await log(0, 'ticket:ai:error', tid, { error: String(caught?.message ?? e), details: caught?.details || null });
      console.error('AI handler error', e);
      try {
        ticket.aiDisabled = true;
        ticket.aiTouched = true;
        await repo.save(ticket);
      } catch (saveErr) {
        console.error('Failed to set ticket.aiDisabled on AI error', saveErr);
      }
    }
  }

  const computeLastReply = (ticket: TicketLike) => {
    const msgs = Array.isArray(ticket.messages) ? ticket.messages : [];
    if (msgs.length) {
      const last = msgs.reduce((prev, cur) => (new Date(cur.created) > new Date(prev.created) ? cur : prev), msgs[0]);
      return last.created;
    }
    return ticket.updatedAt || ticket.created;
  };

  const normalizeStatus = (status: unknown) => {
    const s = String(status || '').toLowerCase();
    if (['open', 'opened'].includes(s)) return 'opened';
    if (['pending', 'awaiting_staff_reply', 'waiting', 'waiting_staff'].includes(s)) return 'awaiting_staff_reply';
    if (['replied'].includes(s)) return 'replied';
    if (['closed'].includes(s)) return 'closed';
    return s || 'opened';
  };

  app.get(prefix + '/tickets', async (ctx: TicketContext) => {
    const f = await requireFeature(ctx, 'ticketing'); if (f !== true) return f;
    const user = ctx.user;
    const statusFilter = String(ctx.query?.status || '').toLowerCase();
    const priorityFilter = String(ctx.query?.priority || '').toLowerCase();
    const departmentFilter = String(ctx.query?.department || '').toLowerCase();
    const includeAi = String(ctx.query?.includeAiTouched ?? ctx.query?.include_ai ?? '').toLowerCase();
    const includeClosed = String(ctx.query?.includeClosed ?? '').toLowerCase();
    const includeReplied = String(ctx.query?.includeReplied ?? '').toLowerCase();
    const includeArchived = String(ctx.query?.includeArchived ?? '').toLowerCase();
    const archiveOnly = String(ctx.query?.archived ?? '').toLowerCase();

    const showAi = includeAi === 'true' || includeAi === '1' || includeAi === 'yes';
    const showClosed = includeClosed === 'true' || includeClosed === '1' || includeClosed === 'yes';
    const showReplied = includeReplied === 'true' || includeReplied === '1' || includeReplied === 'yes';

    const page = Math.max(1, Number(ctx.query?.page) || 1);
    const limit = Math.min(Math.max(Number(ctx.query?.limit) || 25, 1), 100);
    const isAdminApiKey = ctx.apiKey?.type === 'admin';
    const hasTicketAccess = isAdminApiKey || hasPermissionSync(ctx, 'tickets:read') || hasPermissionSync(ctx, 'admin:ticket:staff');

    const where: any = hasTicketAccess ? {} : { userId: user.id };
    const statusIsArchived = statusFilter === 'archived';
    if (statusFilter && !statusIsArchived) {
      const s = statusFilter.toLowerCase();
      if (s === 'opened') where.status = In(['open', 'opened']);
      else if (s === 'awaiting_staff_reply') where.status = In(['pending', 'awaiting_staff_reply', 'waiting', 'waiting_staff']);
      else if (s === 'replied') where.status = 'replied';
      else if (s === 'closed') where.status = 'closed';
      else where.status = statusFilter;
    }
    if (priorityFilter) where.priority = priorityFilter;
    if (departmentFilter) where.department = departmentFilter;

    const [tickets, total] = await Promise.all([
      repo.find({ where, order: { created: 'DESC' }, skip: (page - 1) * limit, take: limit }),
      repo.count({ where }),
    ]);

    let filtered = tickets;
    if (archiveOnly === 'true' || archiveOnly === '1' || archiveOnly === 'yes' || statusIsArchived) {
      filtered = filtered.filter((ticketItem) => ticketItem.archived === true);
    } else if (includeArchived === 'true' || includeArchived === '1' || includeArchived === 'yes') {
      // skip
    } else {
      filtered = filtered.filter((ticketItem) => !ticketItem.archived);
    }

    if (hasPermissionSync(ctx, 'tickets:read') && !showAi) {
      filtered = filtered.filter((ticketItem) => {
        if (!ticketItem.aiTouched) return true;
        const s = (ticketItem.status || '').toString().toLowerCase();
        if (['awaiting_staff_reply', 'opened'].includes(s)) return true;
        if (showReplied && s === 'replied') return true;
        if (showClosed && s === 'closed') return true;
        return false;
      });
    }

    return {
      tickets: filtered.map((t) => ({
        ...t,
        status: normalizeStatus(t.status),
        lastReply: computeLastReply(t),
      })),
      total,
      page,
      limit,
    };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List tickets', tags: ['Tickets'] }
  });

  app.get(prefix + '/tickets/stats', async (ctx: TicketContext) => {
    requireFeature(ctx, 'ticketing');
    if (!hasPermissionSync(ctx, 'tickets:read') && !hasPermissionSync(ctx, 'admin:ticket:staff')) {
      ctx.set.status = 403;
      return { error: ctx.t('common.forbidden') };
    }

    const allTickets = await repo.find({ take: 2000 });
    const nonSpam = allTickets.filter((ticketItem) => !ticketItem.aiMarkedSpam);

    const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - WINDOW_MS;
    const recentTickets = nonSpam.filter((ticketItem) => {
      const created = new Date(ticketItem.created).getTime();
      const updated = new Date(ticketItem.updatedAt || ticketItem.created).getTime();
      return (!Number.isNaN(created) && created >= cutoff) || (!Number.isNaN(updated) && updated >= cutoff);
    });

    const responseDurationsLast30 = recentTickets.flatMap((ticketItem) => getTicketResponseDurations(ticketItem));
    const responseDurationsAll = nonSpam.flatMap((ticketItem) => getTicketResponseDurations(ticketItem));

    const avgTicketResponseMsLast30 = responseDurationsLast30.length > 0
      ? Math.round(responseDurationsLast30.reduce((acc: number, v: number) => acc + v, 0) / responseDurationsLast30.length)
      : null;

    const avgTicketResponseMsGlobal = responseDurationsAll.length > 0
      ? Math.round(responseDurationsAll.reduce((acc: number, v: number) => acc + v, 0) / responseDurationsAll.length)
      : null;

    return {
      avgTicketResponseMs: avgTicketResponseMsLast30,
      avgTicketResponseMsLast30,
      avgTicketResponseSampleCountLast30: responseDurationsLast30.length,
      avgTicketResponseMsGlobal,
      avgTicketResponseSampleCountGlobal: responseDurationsAll.length,
    };
  }, {
    beforeHandle: authenticate,
    response: {
      200: t.Object({
        avgTicketResponseMs: t.Optional(t.Union([t.Number(), t.Null()])),
        avgTicketResponseMsLast30: t.Optional(t.Union([t.Number(), t.Null()])),
        avgTicketResponseSampleCountLast30: t.Number(),
        avgTicketResponseMsGlobal: t.Optional(t.Union([t.Number(), t.Null()])),
        avgTicketResponseSampleCountGlobal: t.Number(),
      }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Get ticket response metrics', tags: ['Tickets'] }
  });

  app.post(prefix + '/tickets', async (ctx: TicketContext) => {
    const user = ctx.user;
    try {
      const ip = (ctx.ip || ctx.request?.ip || '').toString().slice(0,200);
      const keyIp = `rate:ticket:create:ip:${ip}`;
      const keyUser = `rate:ticket:create:user:${user?.id}`;
      const rlIp = await require('../config/redis').consumeRateLimit(keyIp, Number(30), Number(3600));
      if (!rlIp.allowed) { ctx.set.status = 429; ctx.set.headers = { ...(ctx.set.headers||{}), 'Retry-After': String(rlIp.retryAfterSeconds) }; return { error: 'rate_limited', retryAfter: rlIp.retryAfterSeconds }; }
      const rlUser = await require('../config/redis').consumeRateLimit(keyUser, Number(20), Number(3600));
      if (!rlUser.allowed) { ctx.set.status = 429; ctx.set.headers = { ...(ctx.set.headers||{}), 'Retry-After': String(rlUser.retryAfterSeconds) }; return { error: 'rate_limited', retryAfter: rlUser.retryAfterSeconds }; }
    } catch (e) {/* srs */}

    const { subject, message, priority, department, attachments } = (ctx.body || {}) as Record<string, unknown>;
    if (typeof subject !== 'string' || !subject.trim() || typeof message !== 'string' || !message.trim()) {
      ctx.set.status = 400;
      return { error: ctx.t('validation.subjectAndMessageRequired') };
    }

    if (user?.supportBanned) {
      ctx.set.status = 403;
      return { error: ctx.t('user.bannedFromTickets') };
    }

    const now = new Date();
    const safeSubject = sanitizeForDb(subject);
    const safeMessage = sanitizeForDb(message);
    const normalizedPriority = typeof priority === 'string' && priority.trim() ? priority : 'medium';
    const msgAttachments = Array.isArray(attachments) ? attachments.filter((a: any) => typeof a === 'string') : undefined;
    const ticket = repo.create({
      userId: user.id,
      subject: safeSubject,
      message: safeMessage,
      priority: normalizedPriority,
      status: 'opened',
      department: typeof department === 'string' ? department : null,
      messages: [{
        id: makeMsgId(),
        sender: 'user',
        message: safeMessage,
        created: now,
        ...(msgAttachments ? { attachments: msgAttachments } : {}),
      }],
    });
    const saved: Ticket = await repo.save(ticket);
    try {
      if ((user?.portalType || '') === 'free') {
        const pri = (normalizedPriority || 'medium').toString().toLowerCase();
        if (!['urgent', 'high'].includes(pri)) {
          try {
            const model = await selectModelForUser(user);
            if (model) {
              const classifierSys = `You are a ticket urgency classifier. Reply ONLY with a JSON object {"urgent":boolean, "high":boolean, "reason":string} based on the ticket subject and message.`;
              const classifierUsr = `Subject: ${subject}\n\n${message}\n\nIs this issue URGENT or HIGH priority that requires immediate support?`;
              const res = await requestWithFallback({ model, path: '/v1/chat/completions', method: 'post', data: { model: resolveProviderModelId(model), messages: [{ role: 'system', content: classifierSys }, { role: 'user', content: classifierUsr }], max_tokens: 120 }, timeoutMs: 20_000 });
              const payload = res?.data as Record<string, unknown> | undefined;
              const choices = payload?.choices as Array<{ message?: { content?: unknown } }> | undefined;
              const raw = String(choices?.[0]?.message?.content ?? '').trim();
              let parsed: Record<string, unknown> | null = null;
              try { parsed = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch { } }
              const isUrgent = Boolean(parsed?.urgent) || Boolean(parsed?.high) || /urgent/i.test(raw) || /high priority/i.test(raw);
              if (!isUrgent) {
                const now = new Date();
                const note = sanitizeForDb('This ticket appears to be outside free-plan support. If you need urgent or high-priority support please upgrade your plan at /dashboard/billing or contact sales at contact@ecli.app. The ticket has been closed.');
                if (!Array.isArray(saved.messages)) saved.messages = [];
                saved.messages.push({ id: makeMsgId(), sender: 'staff', message: note, created: now, ai: true, staffName: 'EcliAI', staffDisplayName: 'EcliAI' });
                saved.adminReply = note;
                Object.assign(saved, { aiTouched: true, aiClosed: true, aiDisabled: true, status: 'closed' });
                await repo.save(saved);
              }
            }
          } catch (e) {
            // skip
          }
        }
      }
    } catch (e) { }
    try {
      if ((normalizedPriority || '').toString().toLowerCase() === 'urgent') {
        saved.status = 'awaiting_staff_reply';
        await repo.save(saved);
        try { await createActivityLog({ userId: user.id, action: 'ticket:urgent:human', targetId: String(saved.id), targetType: 'ticket', metadata: {}, ipAddress: '' }); } catch (e) { }
      } else {
        try { triggerAIForTicket(saved, user, 'creation'); } catch (e) { }
      }
    } catch (e) { }

    return { success: true, ticket: { ...saved, lastReply: now, status: saved.status || 'opened' } };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'Create ticket', tags: ['Tickets'] }
  });

  app.get(prefix + '/tickets/:id', async (ctx: TicketContext) => {
    const user = ctx.user;
    const ticket = await repo.findOneBy({ id: Number(ctx.params.id) });
    if (!ticket) {
      ctx.set.status = 404;
      return { error: ctx.t('ticket.notFound') };
    }
    const isAdminApiKey = ctx.apiKey?.type === 'admin';
    const canTicketRead = isAdminApiKey || hasPermissionSync(ctx, 'tickets:read') || hasPermissionSync(ctx, 'admin:ticket:staff');
    if (ticket.userId !== user.id && !canTicketRead) {
      ctx.set.status = 403;
      return { error: ctx.t('common.forbidden') };
    }

    normalizeTicketMessages(ticket);
    if (Array.isArray(ticket.messages)) {
      let changed = false;
      const viewerIsOwner = ticket.userId === user.id;
      for (const m of ticket.messages) {
        if (!m.id) { m.id = makeMsgId(); changed = true; }
        const otherPartyRead = m.sender === 'user'
          ? (canTicketRead && !viewerIsOwner)
          : m.sender === 'staff'
            ? !canTicketRead
            : false;
        if (!m.seen && otherPartyRead) { m.seen = true; changed = true; }
      }
      if (changed) { await repo.save(ticket).catch(() => { }); }
    }

    const output: Record<string, unknown> = { ...ticket, status: normalizeStatus(ticket.status), lastReply: computeLastReply(ticket) };

    if (canTicketRead) {
      const ticketUser = await AppDataSource.getRepository(User).findOneBy({ id: ticket.userId });
      if (ticketUser) {
        const membershipRows = await orgMemberRepo.find({ where: { userId: ticketUser.id }, relations: {"organisation":true} });
        const orgs = membershipRows
          .filter((m: Record<string, unknown>) => Boolean(m.organisation))
          .map((m: Record<string, unknown>) => {
            const org = m.organisation as Record<string, unknown>;
            return {
              id: org.id,
              name: org.name,
              handle: org.handle,
              portalTier: org.portalTier,
            orgRole: m.orgRole,
            };
          });
        output.user = {
          id: ticketUser.id,
          title: ticketUser.title,
          gender: ticketUser.gender,
          firstName: ticketUser.firstName,
          lastName: ticketUser.lastName,
          displayName: ticketUser.displayName,
          email: ticketUser.email,
          role: ticketUser.role,
          orgs,
          portalType: ticketUser.portalType,
          avatarUrl: ticketUser.avatarUrl,
          suspended: ticketUser.suspended,
          supportBanned: ticketUser.supportBanned,
        };
        output.userName = ticketUser.displayName || `${ticketUser.title ? `${ticketUser.title} ` : ''}${ticketUser.firstName} ${ticketUser.lastName}`.trim() || ticketUser.email;
      }
    }

    return output;
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get ticket by id', tags: ['Tickets'] }
  });

  app.put(prefix + '/tickets/:id', async (ctx: TicketContext) => {
    const user = ctx.user;
    const ticket = await repo.findOneBy({ id: Number(ctx.params.id) });
    if (!ticket) {
      ctx.set.status = 404;
      return { error: ctx.t('ticket.notFound') };
    }

    const {
      status,
      priority,
      reply,
      replyAs,
      message,
      assignedTo,
      department,
      aiDisabled,
      aiTouched,
      archived,
      attachments,
    } = (ctx.body || {}) as Record<string, unknown>;
    const isAdminApiKey = ctx.apiKey?.type === 'admin';
    const canAdminWrite = isAdminApiKey || hasPermissionSync(ctx, 'tickets:write');
    const canStaffReply = isAdminApiKey || hasPermissionSync(ctx, 'admin:ticket:staff');
    if (!canAdminWrite && !canStaffReply && ticket.userId !== user.id) {
      ctx.set.status = 403;
      return { error: ctx.t('common.forbidden') };
    }

    const now = new Date();

    if (status) ticket.status = normalizeStatus(status);
    if (typeof priority === 'string' && priority && (canAdminWrite || canStaffReply)) ticket.priority = priority;
    if (assignedTo != null && canAdminWrite) ticket.assignedTo = Number(assignedTo);
    if (typeof department === 'string' && canAdminWrite) ticket.department = department;
    if (typeof aiDisabled === 'boolean' && canAdminWrite) ticket.aiDisabled = aiDisabled;
    if (typeof aiTouched === 'boolean' && canAdminWrite) ticket.aiTouched = aiTouched;
    if (archived !== undefined && canAdminWrite) ticket.archived = Boolean(archived);

    normalizeTicketMessages(ticket);
    if (!Array.isArray(ticket.messages)) ticket.messages = [];

    let pushedSender: 'staff' | 'user' | null = null;
    let lastMessageText: string | null = null;
    if (typeof reply === 'string' && reply.trim()) {
      const rawText = reply.trim();
      const txt = sanitizeForDb(rawText);
      const sender: 'staff' | 'user' = replyAs === 'user'
        ? 'user'
        : replyAs === 'staff'
          ? (canStaffReply ? 'staff' : 'user')
          : (canStaffReply ? 'staff' : 'user');

      if (sender === 'user') {
        try {
          const ip = (ctx.ip || ctx.request?.ip || '').toString().slice(0,200);
          const keyIp = `rate:ticket:reply:ip:${ip}`;
          const keyUser = `rate:ticket:reply:user:${user?.id}`;
          const rlIp = await require('../config/redis').consumeRateLimit(keyIp, Number(process.env.TICKET_REPLY_RATE_IP || 60), Number(process.env.TICKET_REPLY_WINDOW_IP || 3600));
          if (!rlIp.allowed) { ctx.set.status = 429; ctx.set.headers = { ...(ctx.set.headers||{}), 'Retry-After': String(rlIp.retryAfterSeconds) }; return { error: 'rate_limited', retryAfter: rlIp.retryAfterSeconds }; }
          const rlUser = await require('../config/redis').consumeRateLimit(keyUser, Number(process.env.TICKET_REPLY_RATE_USER || 20), Number(process.env.TICKET_REPLY_WINDOW_USER || 3600));
          if (!rlUser.allowed) { ctx.set.status = 429; ctx.set.headers = { ...(ctx.set.headers||{}), 'Retry-After': String(rlUser.retryAfterSeconds) }; return { error: 'rate_limited', retryAfter: rlUser.retryAfterSeconds }; }
        } catch (e) { }
      }

      const msgAttachments = Array.isArray(attachments) ? attachments.filter((a: any) => typeof a === 'string') : undefined;

      if (sender === 'staff') {
        const staffDisplayName = typeof user.displayName === 'string' ? user.displayName.trim() : '';
        const staffLegalName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        const staffName = staffDisplayName || staffLegalName || 'Support Team';
        ticket.messages.push({
          id: makeMsgId(),
          sender,
          message: txt,
          created: now,
          staffId: user.id,
          staffName,
          staffDisplayName: staffDisplayName || undefined,
          staffLegalName: staffLegalName || undefined,
          staffAvatar: user?.avatarUrl || undefined,
          ...(msgAttachments ? { attachments: msgAttachments } : {}),
        } as TicketMessage);
      } else {
        ticket.messages.push({
          id: makeMsgId(),
          sender,
          message: txt,
          created: now,
          ...(msgAttachments ? { attachments: msgAttachments } : {}),
        });
      }
      pushedSender = sender;
      lastMessageText = rawText;

      if (sender === 'staff') {
        ticket.adminReply = txt;
      }

      if (!status) {
        ticket.status = sender === 'staff' ? 'replied' : 'awaiting_staff_reply';
      }
    } else if (typeof message === 'string' && message.trim()) {
      const rawMessage = message.trim();
      const safeTxt = sanitizeForDb(rawMessage);
      const existingMessage = String(ticket.message || '').trim();
      ticket.message = existingMessage ? `${existingMessage}\n\n---\n${safeTxt}` : safeTxt;
      ticket.messages.push({ id: makeMsgId(), sender: 'user', message: safeTxt, created: now });
      pushedSender = 'user';
      lastMessageText = rawMessage;
      if (!status) ticket.status = 'awaiting_staff_reply';
    }


    const saved = await repo.save(ticket);

    try {
      const lowerText = (lastMessageText || '').trim().toLowerCase();
      const userEscalated = lowerText === 'escalate' || lowerText.includes('no access') || lowerText.includes('can\'t access') || lowerText.includes('cannot access');

      if (pushedSender === 'user' && userEscalated) {
        saved.status = 'awaiting_staff_reply';
        saved.aiDisabled = true;
        await repo.save(saved);
        try { await createActivityLog({ userId: user.id, action: 'ticket:escalate:user', targetId: String(saved.id), targetType: 'ticket', metadata: { reason: 'user requested escalation/no access' }, ipAddress: '' }); } catch (e) { }
      } else {
        try { if (pushedSender === 'user') { triggerAIForTicket(saved, user, 'user_reply'); } } catch (e) { }
      }
    } catch (e) { }

    return { ...saved, status: normalizeStatus(saved.status), lastReply: computeLastReply(saved) };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Update ticket (admin only)', tags: ['Tickets'] }
  });

  const isStaffViewer = (ctx: TicketContext) =>
    ctx.apiKey?.type === 'admin' ||
    hasPermissionSync(ctx, 'tickets:write') ||
    hasPermissionSync(ctx, 'admin:ticket:staff');

  const loadTicketMessage = async (ctx: TicketContext) => {
    const ticket = await repo.findOneBy({ id: Number(ctx.params.id) });
    if (!ticket) {
      ctx.set.status = 404;
      return { error: ctx.t('ticket.notFound') };
    }
    normalizeTicketMessages(ticket);
    const msgs = Array.isArray(ticket.messages) ? ticket.messages : [];
    const msg = msgs.find((m) => String(m.id) === String(ctx.params.msgId)) || null;
    if (!msg) {
      ctx.set.status = 404;
      return { error: ctx.t('ticket.messageNotFound') };
    }
    return { ticket, msgs, msg };
  };

  const withTicketResult = (ticket: Ticket) => ({
    success: true,
    ticket: { ...ticket, status: normalizeStatus(ticket.status), lastReply: computeLastReply(ticket) },
  });
  
  const isMessageAuthor = (msg: TicketMessage, ctx: TicketContext, ticket: Ticket) =>
    msg.sender === 'user'
      ? ticket.userId === ctx.user.id
      : msg.sender === 'staff'
        ? Number(msg.staffId) === ctx.user.id
        : false;

  app.put(prefix + '/tickets/:id/messages/:msgId', async (ctx: TicketContext) => {
    const loaded = await loadTicketMessage(ctx);
    if ('error' in loaded) return loaded;
    const { ticket, msg } = loaded;

    if (!isMessageAuthor(msg, ctx, ticket)) {
      ctx.set.status = 403;
      return { error: ctx.t('common.forbidden') };
    }

    const { message } = (ctx.body || {}) as Record<string, unknown>;
    if (typeof message !== 'string' || !message.trim()) {
      ctx.set.status = 400;
      return { error: ctx.t('validation.messageRequired') };
    }
    if (msg.seen) {
      ctx.set.status = 403;
      return { error: ctx.t('ticket.messageSeen') };
    }

    msg.message = sanitizeForDb(message.trim());
    msg.edited = true;
    await repo.save(ticket);
    return withTicketResult(ticket);
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Edit a ticket message', tags: ['Tickets'] }
  });

  app.delete(prefix + '/tickets/:id/messages/:msgId', async (ctx: TicketContext) => {
    const loaded = await loadTicketMessage(ctx);
    if ('error' in loaded) return loaded;
    const { ticket, msgs, msg } = loaded;

    if (!isMessageAuthor(msg, ctx, ticket)) {
      ctx.set.status = 403;
      return { error: ctx.t('common.forbidden') };
    }
    if (msg.seen) {
      ctx.set.status = 403;
      return { error: ctx.t('ticket.messageSeen') };
    }

    msgs.splice(msgs.indexOf(msg), 1);
    if (msgs.length === 0) {
      ticket.message = '';
      ticket.adminReply = null;
    }
    await repo.save(ticket);
    return withTicketResult(ticket);
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete a ticket message', tags: ['Tickets'] }
  });

  app.post(prefix + '/tickets/:id/messages/:msgId/reactions', async (ctx: TicketContext) => {
    const loaded = await loadTicketMessage(ctx);
    if ('error' in loaded) return loaded;
    const { ticket, msg } = loaded;

    if (ticket.userId !== ctx.user.id && !isStaffViewer(ctx)) {
      ctx.set.status = 403;
      return { error: ctx.t('common.forbidden') };
    }
    if (msg.sender === 'system') {
      ctx.set.status = 403;
      return { error: ctx.t('common.forbidden') };
    }

    const { emoji } = (ctx.body || {}) as Record<string, unknown>;
    if (typeof emoji !== 'string' || !emoji.trim()) {
      ctx.set.status = 400;
      return { error: ctx.t('validation.messageRequired') };
    }
    const clean = emoji.trim().slice(0, 16);
    if (!/\p{Extended_Pictographic}/u.test(clean)) {
      ctx.set.status = 400;
      return { error: ctx.t('ticket.invalidEmoji') };
    }

    msg.reactions = msg.reactions && typeof msg.reactions === 'object' ? msg.reactions : {};
    const users = Array.isArray(msg.reactions[clean]) ? msg.reactions[clean] : [];
    const i = users.indexOf(ctx.user.id);
    if (i >= 0) users.splice(i, 1);
    else users.push(ctx.user.id);
    if (users.length) msg.reactions[clean] = users;
    else delete msg.reactions[clean];

    await repo.save(ticket);
    return { ...withTicketResult(ticket), reactions: msg.reactions };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Toggle an emoji reaction on a ticket message', tags: ['Tickets'] }
  });

  app.post(prefix + '/tickets/screenshots', async (ctx: TicketContext) => {
    const user = ctx.user;
    const { file } = (ctx.body || {}) as any;
    const uploadFile = Array.isArray(file) ? file[0] : file;
    if (!uploadFile) {
      ctx.set.status = 400;
      return { error: ctx.t('ticket.no_file_provided') };
    }

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    const mime = (uploadFile.type || uploadFile.mimetype || '').toString();
    if (!allowed.includes(mime)) {
      ctx.set.status = 400;
      return { error: ctx.t('ticket.invalid_image_type_allowed_png_jpeg_webp_gif') };
    }

    const ab = await uploadFile.arrayBuffer();
    const buffer = Buffer.from(ab);

    const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.jpg';
    const filename = `ticket_${user.id}_${Date.now()}${ext}`;
    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const filepath = path.join(uploadDir, filename);
    await Bun.write(filepath, buffer);

    const backendBase =
      (process.env.BACKEND_URL || '').replace(/\/+$/, '') ||
      (() => {
        const h = ctx.request.headers as Record<string, string>;
        const proto = h['x-forwarded-proto'] || 'https';
        const host = h['host'] || 'localhost';
        return `${proto}://${host}`;
      })();

    return { url: `${backendBase}/uploads/${filename}` };
  }, {
    body: t.Object({ file: t.File() }),
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
    detail: { summary: 'Upload a screenshot before ticket creation', tags: ['Tickets'] }
  });

  app.post(prefix + '/tickets/:id/screenshots', async (ctx: TicketContext) => {
    const user = ctx.user;
    const ticket = await repo.findOneBy({ id: Number(ctx.params.id) });
    if (!ticket) {
      ctx.set.status = 404;
      return { error: ctx.t('ticket.notFound') };
    }
    const isAdminApiKey = ctx.apiKey?.type === 'admin';
    const canWrite = isAdminApiKey || hasPermissionSync(ctx, 'tickets:write');
    if (!canWrite && ticket.userId !== user.id) {
      ctx.set.status = 403;
      return { error: ctx.t('common.forbidden') };
    }

    const { file } = (ctx.body || {}) as any;
    const uploadFile = Array.isArray(file) ? file[0] : file;
    if (!uploadFile) {
      ctx.set.status = 400;
      return { error: ctx.t('ticket.no_file_provided') };
    }

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    const mime = (uploadFile.type || uploadFile.mimetype || '').toString();
    if (!allowed.includes(mime)) {
      ctx.set.status = 400;
      return { error: ctx.t('ticket.invalid_image_type_allowed_png_jpeg_webp_gif') };
    }

    const ab = await uploadFile.arrayBuffer();
    const buffer = Buffer.from(ab);

    const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.jpg';
    const filename = `ticket_${ticket.id}_${Date.now()}${ext}`;
    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const filepath = path.join(uploadDir, filename);
    await Bun.write(filepath, buffer);

    const backendBase =
      (process.env.BACKEND_URL || '').replace(/\/+$/, '') ||
      (() => {
        const h = ctx.request.headers as Record<string, string>;
        const proto = h['x-forwarded-proto'] || 'https';
        const host = h['host'] || 'localhost';
        return `${proto}://${host}`;
      })();

    return { url: `${backendBase}/uploads/${filename}` };
  }, {
    body: t.Object({ file: t.File() }),
    beforeHandle: authenticate,
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Upload a screenshot for a ticket', tags: ['Tickets'] }
  });

  app.delete(prefix + '/tickets/:id', async (ctx: TicketContext) => {
    const user = ctx.user;
    if (!hasPermissionSync(ctx, 'tickets:delete')) {
      ctx.set.status = 403;
      return { error: ctx.t('common.forbidden') };
    }
    await repo.delete(Number(ctx.params.id));
    return { success: true };
  }, {
    beforeHandle: [authenticate, authorize('tickets:delete')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete ticket (admin only)', tags: ['Tickets'] }
  });
}
