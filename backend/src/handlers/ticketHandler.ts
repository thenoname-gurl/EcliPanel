import { AppDataSource } from '../config/typeorm';
import { Ticket } from '../models/ticket.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { t } from 'elysia';
import axios from 'axios';
import { requireFeature } from '../middleware/featureToggle';
import { AIModel } from '../models/aiModel.entity';
import { AIModelUser } from '../models/aiModelUser.entity';
import { AIModelOrg } from '../models/aiModelOrg.entity';
import { Plan } from '../models/plan.entity';
import { createActivityLog } from './logHandler';

export async function ticketRoutes(app: any, prefix = '') {
  const repo = AppDataSource.getRepository(Ticket);
  const modelRepo = AppDataSource.getRepository(AIModel);
  const modelUserRepo = AppDataSource.getRepository(AIModelUser);
  const modelOrgRepo = AppDataSource.getRepository(AIModelOrg);
  const orgMemberRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
  const planRepo = AppDataSource.getRepository(Plan);

  const endpointCooldowns: Map<string, number> = new Map();
  function nowTs() { return Date.now(); }

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

  function normalizeTicketMessages(ticket: any) {
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
        if (Array.isArray((ticket.messages as any).messages)) {
          ticket.messages = (ticket.messages as any).messages;
          return;
        }

        const keys = Object.keys(ticket.messages);
        const numericKeys = keys.filter((k) => /^\\d+$/.test(k));
        if (numericKeys.length === keys.length && numericKeys.length > 0) {
          ticket.messages = numericKeys
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => (ticket.messages as any)[k]);
          return;
        }
      }
    } catch {
      // skippy
    }

    ticket.messages = [];
  }

  function getTicketResponseDurations(ticket: any): number[] {
    const records = Array.isArray(ticket.messages) ? ticket.messages : [];
    const sorted = records
      .map((m: any) => ({ sender: m.sender, created: new Date(m.created) }))
      .filter((m: any) => m.created instanceof Date && !Number.isNaN(m.created.getTime()))
      .sort((a: any, b: any) => a.created.getTime() - b.created.getTime());

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

  function extractEndpoints(model: any): Array<{ base: string; apiKey?: string; id?: string }> {
    const list: Array<{ base: string; apiKey?: string; id?: string }> = [];
    try {
      if (Array.isArray(model?.endpoints) && model.endpoints.length) {
        for (const e of model.endpoints) {
          if (!e) continue;
          const base = (e.endpoint || e.url || '').toString().replace(/\/v1.*$/i, '').replace(/\/+$/, '');
          if (!base) continue;
          list.push({ base, apiKey: e.apiKey || e.key || undefined, id: e.id || base });
        }
      }
    } catch { }
    if (list.length === 0 && model?.endpoint) {
      list.push({ base: model.endpoint.toString().replace(/\/v1.*$/i, '').replace(/\/+$/, ''), apiKey: model.apiKey || undefined, id: model.endpoint });
    }
    return list;
  }

  async function requestWithFallback(opts: { model: any; path: string; method?: 'post' | 'get' | 'put' | 'delete'; data?: any; headers?: Record<string, any>; timeoutMs?: number }) {
    const { model, path, method = 'post', data, headers = {}, timeoutMs = 60000 } = opts;
    const endpoints = extractEndpoints(model);
    if (endpoints.length === 0) throw new Error('No endpoints configured');

    const errs: any[] = [];
    for (const ep of endpoints) {
      const key = ep.id || ep.base;
      const cooldown = endpointCooldowns.get(key) || 0;
      if (cooldown > nowTs()) {
        errs.push({ endpoint: ep.base, reason: 'cooldown' });
        continue;
      }

      const url = `${ep.base.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
      const hdrs = { ...(headers || {}), Authorization: `Bearer ${ep.apiKey || ''}`, 'Content-Type': 'application/json' } as any;
      try {
        const res = await axios.request({ method: method as any, url, data, headers: hdrs, timeout: timeoutMs });
        return res;
      } catch (e: any) {
        const status = e.response?.status;
        const body = e.response?.data;
        const isRate = status === 429 || (body && (String(body?.type || '').includes('rate') || String(body?.code || '').includes('rate') || String(body?.error || '').toLowerCase().includes('rate')));
        if (isRate) {
          const ra = Number(e.response?.headers?.['retry-after'] || e.response?.headers?.['x-retry-after'] || 0);
          const wait = (Number.isFinite(ra) && ra > 0) ? (ra * 1000) : 5000;
          endpointCooldowns.set(key, nowTs() + wait + 50);
          errs.push({ endpoint: ep.base, reason: 'rate_limited', wait });
          try {
            const entry = { timestamp: new Date().toISOString(), modelId: model?.id, modelName: model?.name, endpoint: ep.base, waitMs: wait };
            try { await createActivityLog({ userId: 0, action: 'ai:endpoint:cooldown', targetId: String(model?.id || ''), targetType: 'ai-model', metadata: entry, ipAddress: '', notify: false }); } catch (e) { }
          } catch (e) { }
          continue;
        }

        errs.push({ endpoint: ep.base, reason: e.message || 'error', status });
        continue;
      }
    }

    const err = new Error('All endpoints failed');
    (err as any).details = errs;
    throw err;
  }

  function resolveProviderModelId(model: any) {
    const providerId = model?.config?.modelId || model?.name;
    if (!providerId || typeof providerId !== 'string') {
      throw new Error('AI model is misconfigured: missing model identifier');
    }
    return providerId;
  }

  async function selectModelForUser(user: any) {
    const all = await modelRepo.find();
    let picked: any = null;
    for (const m of all) {
      if (Array.isArray(m.tags) && (m.tags.includes('support') || m.tags.includes('tickets'))) {
        picked = m; break;
      }
    }
    if (picked) return picked;
    return null;
  }

  async function triggerAIForTicket(ticket: any, user: any, reason: 'creation' | 'user_reply') {

    const log = (userId: number, action: string, targetId: string, metadata: Record<string, any> = {}) =>
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

    const parseJson = (raw: string): any => {
      try { return JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
    };

    const callModel = async (model: any, messages: any[], maxTokens: number, timeout: number) => {
      const res = await requestWithFallback({
        model, path: '/v1/chat/completions', method: 'post',
        data: { model: resolveProviderModelId(model), messages, max_tokens: maxTokens }, timeoutMs: timeout,
      });
      return String(res?.data?.choices?.[0]?.message?.content ?? res?.data ?? '').trim();
    };

    const buildContext = (): string => {
      const l: string[] = [];
      if (user) {
        l.push(`User ID: ${user.id ?? ''}`);
        l.push(`Name: ${[user.firstName, user.lastName].filter(Boolean).join(' ')}`);
        l.push(`Email: ${user.email ?? ''}`);
        l.push(`Role: ${user.role ?? ''}`);
        l.push(`Plan/Portal Type: ${user.portalType ?? ''}`);
        const orgNames = Array.isArray((user as any).orgs)
          ? (user as any).orgs.map((o: any) => o?.name).filter(Boolean)
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
        .filter((h: any) => h.sender === 'user' || h.sender === 'staff')
        .map((h: any) => ({
          role: h.sender === 'user' ? 'user' : 'assistant', content: h.message,
        }));

    const fullConversationText = (): string =>
      (Array.isArray(ticket.messages) ? ticket.messages : [])
        .map((m: any) => `[${m.sender}] ${m.message || ''}`).join('\n');

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
        ticket.messages.push({ sender: 'staff', message: safe, created: ts, ai: true, staffName: 'EcliAI', staffDisplayName: 'EcliAI' });
        ticket.messages.push({ sender: 'system', message: 'System: AI marked this ticket as spam, set priority low, and disabled AI auto-response.', created: ts });
        ticket.adminReply = safe;
        Object.assign(ticket, { aiTouched: true, aiMarkedSpam: true, aiDisabled: true, priority: 'low' });
        await repo.save(ticket);
        await log(uid, 'ticket:ai:spam', tid);
        return;
      }

      if (dir.close) {
        const safe = sanitizeForDb(reply || 'Closed by AI. Human verification required.');
        ticket.messages.push({ sender: 'staff', message: safe, created: ts, ai: true, staffName: 'EcliAI', staffDisplayName: 'EcliAI' });
        ticket.messages.push({ sender: 'system', message: 'System: AI closed the ticket and marked for human verification.', created: ts });
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
      ticket.messages.push({ sender: 'staff', message: safe, created: ts, ai: true, staffName: 'EcliAI', staffDisplayName: 'EcliAI' });
      ticket.adminReply = safe;

      const appliedEntries = Object.entries(changes.applied);
      if (appliedEntries.length || outageDetected || dir.escalate) {
        const parts: string[] = [];
        if (appliedEntries.length) parts.push(`applied changes: ${appliedEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
        if (outageDetected) parts.push('node-wide outage detected');
        if (dir.escalate) parts.push('escalated to human staff');
        if (dir.confidence === 'low') parts.push('low confidence reply');
        ticket.messages.push({
          sender: 'system',
          message: `System: AI ${parts.join('; ')}.`,
          created: ts,
        });
      }

      if (dir.internalNote) {
        ticket.messages.push({
          sender: 'system',
          message: `AI Internal Note: ${dir.internalNote}`,
          created: ts,
        });
      }

      ticket.aiTouched = true;
      ticket.status = dir.escalate || changes.applied.priority === 'urgent' ? 'awaiting_staff_reply' : 'replied';
      await repo.save(ticket);

      const logMeta: Record<string, any> = { modelId: undefined, confidence: dir.confidence };
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
          planSummary = plans.map((p: any) => {
            const features = p.features && typeof p.features === 'object' ? JSON.stringify(p.features) : 'none';
            const priceText = (p.type && String(p.type).toLowerCase() === 'enterprise') ? 'varies' : `$${p.price}/mo`;
            return `- ${p.name} (${p.type}) ${priceText}: memory=${p.memory ?? 'n/a'}MB, disk=${p.disk ?? 'n/a'}MB, cpu=${p.cpu ?? 'n/a'}, servers=${p.serverLimit ?? 'n/a'}, databases=${p.databases ?? 'n/a'}, backups=${p.backups ?? 'n/a'}, ports=${p.portCount ?? 'n/a'}, features=${features}`;
          }).join('\n');
        }
      } catch { /* skip */ }

      // STAGE 1 aka Intent Classification & Routing

      const stage1System = `You are a ticket intent classifier for EcliPanel (game/app server hosting).
Analyze the ticket conversation and classify it.

Output JSON only:
{
  "intent": "technical" | "billing" | "sales" | "account" | "abuse" | "spam" | "outage" | "general",
  "subIntent": string,
  "severity": "critical" | "high" | "medium" | "low",
  "needsHumanExpertise": boolean,
  "isSpam": boolean,
  "isOutage": boolean,
  "missingInfo": string[],
  "suggestedDepartment": "${ALLOWED_DEPARTMENTS.join('" | "')}",
  "suggestedPriority": "${ALLOWED_PRIORITIES.join('" | "')}",
  "summary": "one-line summary of the issue"
}

Rules:
- "isOutage": true if any mention of node down, node offline, multiple servers unreachable, host unreachable, service-wide failure.
- "needsHumanExpertise": true if the issue requires SSH/root/node access, billing disputes, refunds, legal, security incidents, or anything that cannot be resolved through the web panel alone.
- "missingInfo": list specific details the user hasn't provided but we need (server ID, error message, node name, etc). Empty array if sufficient.
- "severity": "critical" for outages/data-loss, "high" for service-degraded, "medium" for feature issues, "low" for questions/general.
- Be conservative with spam detection — only flag obvious spam/abuse.`;

      const stage1Messages = [
        { role: 'system', content: stage1System },
        { role: 'system', content: `Context:\n${buildContext()}` },
        ...conversationMessages(),
        { role: 'user', content: 'Classify this ticket. Output JSON only.' },
      ];

      interface IntentResult {
        intent: string; subIntent: string; severity: string;
        needsHumanExpertise: boolean; isSpam: boolean; isOutage: boolean;
        missingInfo: string[]; suggestedDepartment: string; suggestedPriority: string;
        summary: string;
      }

      let intent: IntentResult | null = null;
      try {
        const raw = await callModel(model, stage1Messages, 300, 15_000);
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === 'object') {
          intent = {
            intent: String(parsed.intent || 'general'),
            subIntent: String(parsed.subIntent || ''),
            severity: String(parsed.severity || 'medium'),
            needsHumanExpertise: Boolean(parsed.needsHumanExpertise),
            isSpam: Boolean(parsed.isSpam),
            isOutage: Boolean(parsed.isOutage),
            missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo.map(String) : [],
            suggestedDepartment: String(parsed.suggestedDepartment || ''),
            suggestedPriority: String(parsed.suggestedPriority || ''),
            summary: String(parsed.summary || ''),
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
- Severity: ${intent.severity}
- Needs human expertise: ${intent.needsHumanExpertise}
- Missing info from user: ${intent.missingInfo.length ? intent.missingInfo.join(', ') : 'none'}
- Summary: ${intent.summary}
${intent.needsHumanExpertise ? '\nIMPORTANT: This issue requires human expertise. Provide what panel-level guidance you can, then clearly state the infrastructure/support team will handle the rest. Do NOT attempt to fully resolve it.' : ''}
${intent.missingInfo.length ? `\nIMPORTANT: Ask the user for these missing details: ${intent.missingInfo.join(', ')}` : ''}` : '';

      const stage2System = `You are the EcliPanel support assistant. Be concise, factual and helpful.

ABSOLUTE RULES — VIOLATION IS FORBIDDEN:
1. NEVER include SSH commands, shell commands, root actions, terminal commands, or ANY node/host-level operations in your reply. This includes: ${SHELL_CMDS.slice(0, 20).join(', ')}, or ANY command typed into a terminal.
2. NEVER say "if you have SSH access", "if you have root access", "connect via SSH", "on the host machine", "on the node", "in the terminal". These phrases are BANNED.
3. ONLY suggest actions performable through the EcliPanel web dashboard: clicking buttons, navigating pages, using the panel file manager, panel restart/stop/start buttons, panel console.
4. If resolution REQUIRES node/host/SSH action, say EXACTLY: "This requires our infrastructure team. We've escalated this and our team will handle it." Then list ONLY panel-level checks the user can do while waiting.
5. The panel console (/dashboard/servers/[id] → Console) is a GAME SERVER console, NOT a system terminal. Users can type game commands there (like Minecraft commands), NOT system commands.

Panel navigation reference:
- /dashboard — account summary, usage, quick links
- /dashboard/servers — server list, status, actions
- /dashboard/servers/[id] — specific server: Console, Files, Databases, Schedules, Settings, Startup
- /dashboard/servers/[id] → Files — file manager (edit configs like server.properties, spigot.yml etc)
- /dashboard/servers/[id] → Startup — startup parameters, Java version, server jar
- /dashboard/servers/[id] → Settings — rename, reinstall, transfer
- /dashboard/billing — plans, invoices, upgrades
- /dashboard/organisations — team management, roles
- /dashboard/ai — AI settings
- /dashboard/settings — account settings
- /dashboard/identity — identity verification
- /dashboard/activity — activity logs
- /infrastructure/code-instances — code server instances
- /wings — node status overview
- Status page: https://status.ecli.app/
- Sales/support email: contact@ecli.app
- Legal email: legal@ecli.app
- Main panel: https://ecli.app/
- Official domains: ecli.app, ecli.app, eclipsesystems.top
- Node domains: n[number].ecli.app (e.g. n1.ecli.app)

Plan catalog:
${planSummary}

Student plan activation:
1. Go to /dashboard/billing
2. Click "Connect with Hack Club" (or GitHub if configured)
3. Complete OAuth consent
4. System verifies eligibility and converts to educational portal
5. If not approved, submit documentation to contact@ecli.app

Reply guidelines:
- Provide 2-5 numbered panel-level steps with exact page paths and button names.
- If you cannot resolve confidently, say so and explain why human staff are needed.
- Do not invent details. Ask for missing info if needed.
- Do not offer billing/purchase actions — link to /dashboard/billing and provide sales email.
- Keep any summary guide compact at the end.
${intentContext}

IMPORTANT: Do NOT include control tokens ([ESCALATE], [SPAM], [CLOSE], [SET ...]).
Write ONLY the user-facing reply.`;

      const stage2Messages = [
        { role: 'system', content: stage2System },
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
      } catch (err: any) {
        await log(uid, 'ticket:ai:skipped', tid, { reason: 'stage2_failed', error: String(err?.message ?? err) });
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
- "escalate": true if human staff must act (node/host issues, SSH needed, billing disputes, security, AI cannot resolve, outage).
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
        ...conversationMessages(),
        { role: 'assistant', content: aiReply },
        { role: 'user', content: 'Output the control directive JSON for this ticket. JSON only, no other text.' },
      ];

      let directive: Directive;
      try {
        const raw = await callModel(model, stage3Messages, 250, 20_000);
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === 'object') {
          directive = {
            escalate: Boolean(parsed.escalate),
            spam: Boolean(parsed.spam),
            close: Boolean(parsed.close),
            sets: parsed.sets && typeof parsed.sets === 'object' ? parsed.sets : {},
            internalNote: parsed.internalNote ? String(parsed.internalNote) : null,
            confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
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
2. Invented information not supported by the ticket context.
3. Links to domains other than ecli.app, ecli.app, eclipsesystems.top, or status.ecli.app.
4. Promises about refunds, SLAs, uptime guarantees the AI shouldn't make.
5. Reply is too short to be helpful (< 2 sentences) or too verbose.
6. References to "SSH access", "root access", "terminal", "command line" in any form.

Official domains: ecli.app, ecli.app, eclipsesystems.top
Valid subpaths: /dashboard/*, /wings, /billing, /organisations, /docs, /ai, /infrastructure/*`;

        const stage4Messages = [
          { role: 'system', content: stage4System },
          { role: 'system', content: `Ticket context:\n${buildContext()}` },
          { role: 'user', content: `Review this AI reply:\n\n---\n${aiReply}\n---\n\nOutput quality check JSON only.` },
        ];

        try {
          const raw = await callModel(model, stage4Messages, 200, 15_000);
          const parsed = parseJson(raw);
          if (parsed && typeof parsed === 'object') {
            const passes = Boolean(parsed.passesQuality);
            const hasShell = Boolean(parsed.containsShellCommands);
            const hasInvented = Boolean(parsed.containsInventedInfo);
            const hasWrongLinks = Boolean(parsed.containsWrongLinks);
            const issues = Array.isArray(parsed.issues) ? parsed.issues : [];

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

    } catch (e: any) {
      await log(0, 'ticket:ai:error', tid, { error: String(e?.message ?? e), details: e?.details || null });
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

  const computeLastReply = (ticket: any) => {
    const msgs = Array.isArray(ticket.messages) ? ticket.messages : [];
    if (msgs.length) {
      const last = msgs.reduce((prev, cur) => (new Date(cur.created) > new Date(prev.created) ? cur : prev), msgs[0]);
      return last.created;
    }
    return ticket.updatedAt || ticket.created;
  };

  const normalizeStatus = (status: any) => {
    const s = String(status || '').toLowerCase();
    if (['open', 'opened'].includes(s)) return 'opened';
    if (['pending', 'awaiting_staff_reply', 'waiting', 'waiting_staff'].includes(s)) return 'awaiting_staff_reply';
    if (['replied'].includes(s)) return 'replied';
    if (['closed'].includes(s)) return 'closed';
    return s || 'opened';
  };

  app.get(prefix + '/tickets', async (ctx: any) => {
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

    const tickets = hasPermissionSync(ctx, 'tickets:read')
      ? await repo.find({ order: { created: 'DESC' } })
      : await repo.find({ where: { userId: user.id }, order: { created: 'DESC' } });

    const statusIsArchived = statusFilter === 'archived';

    const statusMatch = (ticketStatus: string, filter: string) => {
      const ts = String(ticketStatus || '').toLowerCase();
      if (!ts) return false;
      if (filter === 'opened') return ['open', 'opened'].includes(ts);
      if (filter === 'awaiting_staff_reply') return ['pending', 'awaiting_staff_reply', 'waiting', 'waiting_staff'].includes(ts);
      if (filter === 'replied') return ts === 'replied';
      if (filter === 'closed') return ts === 'closed';
      return ts === filter;
    };

    let filtered = tickets;
    if (statusFilter && !statusIsArchived) {
      filtered = filtered.filter((t: any) => statusMatch(t.status, statusFilter));
    }
    if (priorityFilter) {
      filtered = filtered.filter((t: any) => (t.priority || '').toString().toLowerCase() === priorityFilter);
    }
    if (departmentFilter) {
      filtered = filtered.filter((t: any) => (t.department || '').toString().toLowerCase() === departmentFilter);
    }

    if (archiveOnly === 'true' || archiveOnly === '1' || archiveOnly === 'yes' || statusIsArchived) {
      filtered = filtered.filter((t: any) => t.archived === true);
    } else if (includeArchived === 'true' || includeArchived === '1' || includeArchived === 'yes') {
      // skip
    } else {
      filtered = filtered.filter((t: any) => !t.archived);
    }

    if (hasPermissionSync(ctx, 'tickets:read') && !showAi) {
      filtered = filtered.filter((t: any) => {
        if (!t.aiTouched) return true;
        const s = (t.status || '').toString().toLowerCase();
        if (['awaiting_staff_reply', 'opened'].includes(s)) return true;
        if (showReplied && s === 'replied') return true;
        if (showClosed && s === 'closed') return true;
        return false;
      });
    }

    return (filtered || tickets).map((t) => ({
      ...t,
      status: normalizeStatus(t.status),
      lastReply: computeLastReply(t),
    }));
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List tickets', tags: ['Tickets'] }
  });

  app.get(prefix + '/tickets/stats', async (ctx: any) => {
    requireFeature(ctx, 'ticketing');

    const allTickets = await repo.find();
    const nonSpam = allTickets.filter((t: any) => !(t as any).aiMarkedSpam);

    const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - WINDOW_MS;
    const recentTickets = nonSpam.filter((t: any) => {
      const created = new Date(t.created).getTime();
      const updated = new Date(t.updatedAt || t.created).getTime();
      return (!Number.isNaN(created) && created >= cutoff) || (!Number.isNaN(updated) && updated >= cutoff);
    });

    const responseDurationsLast30 = recentTickets.flatMap((t: any) => getTicketResponseDurations(t));
    const responseDurationsAll = nonSpam.flatMap((t: any) => getTicketResponseDurations(t));

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

  app.post(prefix + '/tickets', async (ctx: any) => {
    const user = ctx.user;
    const { subject, message, priority, department } = ctx.body as any;
    if (!subject || !message) {
      ctx.set.status = 400;
      return { error: 'subject and message required' };
    }

    if (user?.supportBanned) {
      ctx.set.status = 403;
      return { error: 'You are banned from creating support tickets.' };
    }

    const now = new Date();
    const safeSubject = sanitizeForDb(subject);
    const safeMessage = sanitizeForDb(message);
    const ticket = repo.create({
      userId: user.id,
      subject: safeSubject,
      message: safeMessage,
      priority: priority || 'medium',
      status: 'opened',
      department: typeof department === 'string' ? department : null,
      messages: [{ sender: 'user', message: safeMessage, created: now }],
    });
    const saved = await repo.save(ticket);
    try {
      if ((user?.portalType || '') === 'free') {
        const pri = (priority || 'medium').toString().toLowerCase();
        if (!['urgent', 'high'].includes(pri)) {
          try {
            const model = await selectModelForUser(user);
            if (model) {
              const classifierSys = `You are a ticket urgency classifier. Reply ONLY with a JSON object {"urgent":boolean, "high":boolean, "reason":string} based on the ticket subject and message.`;
              const classifierUsr = `Subject: ${subject}\n\n${message}\n\nIs this issue URGENT or HIGH priority that requires immediate support?`;
              const res = await requestWithFallback({ model, path: '/v1/chat/completions', method: 'post', data: { model: resolveProviderModelId(model), messages: [{ role: 'system', content: classifierSys }, { role: 'user', content: classifierUsr }], max_tokens: 120 }, timeoutMs: 20_000 });
              const raw = String(res?.data?.choices?.[0]?.message?.content ?? '').trim();
              let parsed: any = null;
              try { parsed = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch { } }
              const isUrgent = Boolean(parsed?.urgent) || Boolean(parsed?.high) || /urgent/i.test(raw) || /high priority/i.test(raw);
              if (!isUrgent) {
                const now = new Date();
                const note = sanitizeForDb('This ticket appears to be outside free-plan support. If you need urgent or high-priority support please upgrade your plan at /dashboard/billing or contact sales at contact@ecli.app. The ticket has been closed.');
                if (!Array.isArray(saved.messages)) saved.messages = [];
                saved.messages.push({ sender: 'staff', message: note, created: now, ai: true, staffName: 'EcliAI', staffDisplayName: 'EcliAI' });
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
      if ((priority || '').toString().toLowerCase() === 'urgent') {
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

  app.get(prefix + '/tickets/:id', async (ctx: any) => {
    const user = ctx.user;
    const ticket = await repo.findOneBy({ id: Number(ctx.params.id) });
    if (!ticket) {
      ctx.set.status = 404;
      return { error: 'Ticket not found' };
    }
    if (ticket.userId !== user.id && !hasPermissionSync(ctx, 'tickets:read')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const output: any = { ...ticket, status: normalizeStatus(ticket.status), lastReply: computeLastReply(ticket) };

    if (hasPermissionSync(ctx, 'tickets:read')) {
      const ticketUser = await AppDataSource.getRepository(User).findOneBy({ id: ticket.userId });
      if (ticketUser) {
        const membershipRows = await orgMemberRepo.find({ where: { userId: ticketUser.id }, relations: ['organisation'] });
        const orgs = membershipRows
          .filter((m: any) => !!m.organisation)
          .map((m: any) => ({
            id: m.organisation.id,
            name: m.organisation.name,
            handle: m.organisation.handle,
            portalTier: m.organisation.portalTier,
            orgRole: m.orgRole,
          }));
        output.user = {
          id: ticketUser.id,
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
        output.userName = ticketUser.displayName || `${ticketUser.firstName} ${ticketUser.lastName}`.trim() || ticketUser.email;
      }
    }

    return output;
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Get ticket by id', tags: ['Tickets'] }
  });

  app.put(prefix + '/tickets/:id', async (ctx: any) => {
    const user = ctx.user;
    const ticket = await repo.findOneBy({ id: Number(ctx.params.id) });
    if (!ticket) {
      ctx.set.status = 404;
      return { error: 'Ticket not found' };
    }
    if (!hasPermissionSync(ctx, 'tickets:write') && ticket.userId !== user.id) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }

    const { status, priority, reply, replyAs, message, assignedTo, department, aiDisabled, aiTouched } = ctx.body as any;
    const now = new Date();

    if (status) ticket.status = normalizeStatus(status);
    if (priority) ticket.priority = priority;
    if (assignedTo != null) ticket.assignedTo = Number(assignedTo);
    if (typeof department === 'string') ticket.department = department;
    if (typeof aiDisabled === 'boolean') ticket.aiDisabled = aiDisabled;
    if (typeof aiTouched === 'boolean') ticket.aiTouched = aiTouched;

    normalizeTicketMessages(ticket);
    if (!Array.isArray(ticket.messages)) ticket.messages = [];

    let pushedSender: 'staff' | 'user' | null = null;
    let lastMessageText: string | null = null;
    if (typeof reply === 'string' && reply.trim()) {
      const canStaffReply = hasPermissionSync(ctx, 'tickets:write');
      const sender: 'staff' | 'user' = replyAs === 'user' ? 'user' : replyAs === 'staff' ? 'staff' : (canStaffReply ? 'staff' : 'user');
      const rawText = reply.trim();
      const txt = sanitizeForDb(rawText);
      if (sender === 'staff') {
        const staffDisplayName = typeof user.displayName === 'string' ? user.displayName.trim() : '';
        const staffLegalName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        const staffName = staffDisplayName || staffLegalName || 'Support Team';
        ticket.messages.push({
          sender,
          message: txt,
          created: now,
          staffId: user.id,
          staffName,
          staffDisplayName: staffDisplayName || undefined,
          staffLegalName: staffLegalName || undefined,
          staffAvatar: (user as any).avatarUrl || undefined,
        } as any);
      } else {
        ticket.messages.push({ sender, message: txt, created: now });
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
      ticket.messages.push({ sender: 'user', message: safeTxt, created: now });
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

  app.delete(prefix + '/tickets/:id', async (ctx: any) => {
    const user = ctx.user;
    if (!hasPermissionSync(ctx, 'tickets:delete')) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    await repo.delete(Number(ctx.params.id));
    return { success: true };
  }, {
    beforeHandle: [authenticate, authorize('tickets:delete')],
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete ticket (admin only)', tags: ['Tickets'] }
  });
}
