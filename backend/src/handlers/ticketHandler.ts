import { AppDataSource } from '../config/typeorm';
import { Ticket } from '../models/ticket.entity';
import { authenticate } from '../middleware/auth';
import { t } from 'elysia';
import axios from 'axios';
import { AIModel } from '../models/aiModel.entity';
import { AIModelUser } from '../models/aiModelUser.entity';
import { AIModelOrg } from '../models/aiModelOrg.entity';
import { Plan } from '../models/plan.entity';
import { createActivityLog } from './logHandler';

const adminRoles = ['admin', 'rootAdmin', '*'];

// TODO: IMPROVE THIS, ALSO ADD REPLY FUNCTIONALITY TO
// TICKETS INSTEAD OF JUST ADMIN REPLY
export async function ticketRoutes(app: any, prefix = '') {
  const repo = AppDataSource.getRepository(Ticket);
  const modelRepo = AppDataSource.getRepository(AIModel);
  const modelUserRepo = AppDataSource.getRepository(AIModelUser);
  const modelOrgRepo = AppDataSource.getRepository(AIModelOrg);
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
      out = out.replace(/[\u2190-\u21FF]/g, '->');
      out = out.replace(/≥/g, '>=').replace(/≤/g, '<=');
      out = out.replace(/©/g, '(c)').replace(/®/g, '(r)');
      out = out.replace(/([\uD800-\uDBFF][\uDC00-\uDFFF])/g, '?');
      return out;
    } catch (e) { return String(s); }
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
        l.push(`Role: ${user.role ?? user.orgRole ?? ''}`);
        l.push(`Plan/Portal Type: ${user.portalType ?? ''}`);
        if (user.org?.name) l.push(`Organisation: ${user.org.name}`);
      }
      l.push(`Ticket ID: ${ticket.id ?? ''}`);
      l.push(`Ticket priority: ${ticket.priority ?? ''}`);
      l.push(`Ticket department: ${ticket.department ?? ''}`);
      return l.join('\n');
    };

    const conversationMessages = (): { role: string; content: string }[] =>
      (Array.isArray(ticket.messages) ? ticket.messages : []).map((h: any) => ({
        role: h.sender === 'user' ? 'user' : 'assistant', content: h.message,
      }));

    interface Directive { escalate: boolean; spam: boolean; close: boolean; sets: Record<string, string>; }
    const empty = (): Directive => ({ escalate: false, spam: false, close: false, sets: {} });

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

    const apply = async (reply: string, dir: Directive) => {
      if (!Array.isArray(ticket.messages)) ticket.messages = [];
      const ts = now();

      const outageDetected = hasOutage(reply) || hasOutage(
        (Array.isArray(ticket.messages) ? ticket.messages : []).map((m: any) => m.message || '').join(' ')
      );
      if (outageDetected) {
        dir.escalate = true;
        if (!dir.sets.priority) dir.sets.priority = 'urgent';
        if (!dir.sets.department) dir.sets.department = 'Technical Support';
      }

      if (dir.spam) {
        const safe = sanitizeForDb(reply || 'Marked as spam by AI.');
        ticket.messages.push({ sender: 'staff', message: safe, created: ts, ai: true });
        ticket.messages.push({ sender: 'system', message: 'System: AI marked this ticket as spam, set priority low, and disabled AI auto-response.', created: ts });
        ticket.adminReply = safe;
        Object.assign(ticket, { aiTouched: true, aiMarkedSpam: true, aiDisabled: true, priority: 'low' });
        await repo.save(ticket);
        await log(uid, 'ticket:ai:spam', tid);
        return;
      }

      if (dir.close) {
        const safe = sanitizeForDb(reply || 'Closed by AI. Human verification required.');
        ticket.messages.push({ sender: 'staff', message: safe, created: ts, ai: true });
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
          if (current !== v) {
            ticket.priority = v;
            changes.applied.priority = v;
          }
        } else {
          changes.rejected.priority = dir.sets.priority;
        }
      }

      if (dir.sets.department) {
        const match = ALLOWED_DEPARTMENTS.find(d => d.toLowerCase() === dir.sets.department.toLowerCase());
        const current = (ticket.department || '').toLowerCase();
        if (match) {
          if (current !== match.toLowerCase()) {
            ticket.department = match;
            changes.applied.department = match;
          }
        } else {
          changes.rejected.department = dir.sets.department;
        }
      }

      const safe = sanitizeForDb(reply);
      ticket.messages.push({ sender: 'staff', message: safe, created: ts, ai: true });
      ticket.adminReply = safe;

      const appliedEntries = Object.entries(changes.applied);
      if (appliedEntries.length) {
        const summary = appliedEntries.map(([k, v]) => `${k}=${v}`).join(', ');
        const reason = outageDetected ? ' (node-wide outage detected)' : '';
        ticket.messages.push({
          sender: 'system',
          message: `System: AI applied changes: ${summary}${reason}`,
          created: ts,
        });
      }

      ticket.aiTouched = true;
      ticket.status = dir.escalate || changes.applied.priority === 'urgent' ? 'awaiting_staff_reply' : 'replied';
      await repo.save(ticket);

      if (appliedEntries.length) await log(uid, 'ticket:ai:set', tid, { changes, outageDetected });
      if (outageDetected) await log(uid, 'ticket:ai:force-outage', tid, { reason: 'outage_detected' });
      if (dir.escalate) await log(uid, 'ticket:ai:escalate', tid, { reason: 'AI suggested escalation' });
      else await log(uid, 'ticket:ai:reply', tid, { modelId: undefined });
    };

    try {
      if (ticket?.aiDisabled) { await log(uid, 'ticket:ai:skipped', tid, { reason: 'ai_disabled' }); return; }

      const model = await selectModelForUser(user);
      if (!model) { await log(uid, 'ticket:ai:skipped', tid, { reason: 'no_model_configured' }); return; }

      const plans = await planRepo.find({ order: { price: 'ASC' } });
      const planSummary = plans.length ? plans.map((p: any) => {
        const features = p.features && typeof p.features === 'object' ? JSON.stringify(p.features) : 'none';
        const priceText = (p.type && String(p.type).toLowerCase() === 'enterprise') ? 'varies' : `$${p.price}/mo`;
        return `- ${p.name} (${p.type}) ${priceText}: memory=${p.memory ?? 'n/a'}MB, disk=${p.disk ?? 'n/a'}MB, cpu=${p.cpu ?? 'n/a'}, servers=${p.serverLimit ?? 'n/a'}, databases=${p.databases ?? 'n/a'}, backups=${p.backups ?? 'n/a'}, ports=${p.portCount ?? 'n/a'}, features=${features}`;
      }).join('\n') : 'Plan table is empty.';

      const stage1System = `
STRICT RULES — NEVER VIOLATE:
1. NEVER suggest, show, or reference any SSH commands, shell commands, root actions, terminal commands, or node-level/host-level operations. This includes but is not limited to: systemctl, docker, cd, nano, vim, cat, tail, grep, journalctl, wings, sudo, apt, yum, curl, wget, service, reboot, shutdown, kill, or ANY command that would be typed into a terminal/console/SSH session.
2. ONLY suggest actions the user can perform through the EcliPanel web dashboard UI (clicking buttons, navigating pages, editing files through the panel file manager, using panel restart/stop/start buttons).
3. If an issue REQUIRES node-level/host-level/SSH intervention to resolve, do NOT provide those commands. Instead, clearly tell the user: "This requires intervention from our infrastructure team. We are escalating this ticket and our team will handle it from here." Then explain what the user can check from the panel in the meantime.
4. NEVER say "if you have SSH access" or "if you have root access" — assume the user does NOT and must NOT run host commands.

Reply guidelines:
- Provide 2-5 short, actionable panel-level steps (exact page paths, button names).
  Example: "Panel action: Go to /dashboard/servers/[id] → Files → edit server.properties → set eula=true → Save → Press Restart".
- Include a short overview of where in the panel to find common features and settings:
  * /dashboard: account summary, usage, and quick links.
  * /dashboard/servers: list of servers, status, actions, and console links.
  * /dashboard/billing: plan details, usage, invoices, and upgrade options.
  * /dashboard/organisations: users, roles, and team permissions.
  * /dashboard/ai: AI model controls and automation rules.
- Mention plan categories when relevant and include a brief outline of actual plan schema:
  * Current plan catalog (from DB): ${planSummary}
- Explain student plan activation flow:
  1) Go to /dashboard/billing.
  2) Click "Connect with Hack Club" (or GitHub if configured).
  3) Complete OAuth consent and allow access.
  4) The system verifies eligibility and converts user to educational portal (if approved).
  5) If not approved, ask them to submit documentation to contact@eclipsesystems.org.
- If you cannot resolve the issue confidently, say so clearly and explain why human staff are needed.
- Do not invent or assume details not present in the ticket. If required details are missing, ask for them (server ID, exact error text).
- For critical node-wide failures (node offline, network partition, host unreachable), clearly state that the infrastructure team has been notified and will handle it. Give the user only panel-level checks they can do while waiting.
- Include links when relevant: /dashboard, /dashboard/servers, /dashboard/servers/[id], /dashboard/billing, /dashboard/organisations, /dashboard/ai, /dashboard/settings, /dashboard/identity, /infrastructure/code-instances, /dashboard/activity
- Keep any "All-in-One Guide" compact and near the end under a clear heading.
- Include official status page if relevant: https://status.eclipsesystems.org/
- Include official sales email if relevant: contact@eclipsesystems.org
- Include official legal email if relevant: legal@eclipsesystems.org
- Dont offer any billing or purchase actions, just link to the billing page (/dashboard/billing) and provide sales email
- Main panel link is: https://ecli.app/
- Official domains are: ecli.app, eclipsesystems.org, eclipsesystems.top. Do not reference any other domains and dont reference subdomains of ecli.app.
- Node domain: n(count).eclipsesystems.org, example n1.eclipsesystems.org

IMPORTANT: Do NOT include any control tokens ([ESCALATE], [SPAM], [CLOSE], [SET ...]) in your reply.
Write a helpful, natural response to the user only.`;

      const stage1Messages = [
        { role: 'system', content: stage1System },
        { role: 'system', content: `User & Ticket context:\n${buildContext()}` },
        ...conversationMessages(),
        {
          role: 'user',
          content: reason === 'creation'
            ? `A user opened this ticket. Provide a helpful staff reply addressing the subject: "${ticket.subject}". Be confident and actionable. Remember: ONLY panel-level actions, NEVER SSH/root/terminal commands.`
            : 'The user just replied to an existing ticket. Provide a helpful staff reply to move the issue forward. Be confident and actionable. Remember: ONLY panel-level actions, NEVER SSH/root/terminal commands.',
        },
      ];

      let aiReply: string;
      try {
        aiReply = await callModel(model, stage1Messages, 800, 60_000);
      } catch (err: any) {
        await log(uid, 'ticket:ai:skipped', tid, { reason: 'stage1_failed', error: String(err?.message ?? err) });
        throw err;
      }

      if (!aiReply) {
        await log(uid, 'ticket:ai:skipped', tid, { reason: 'empty_response', modelId: model.id });
        return;
      }

      aiReply = aiReply.replace(/^\s*\[[^\]]+\]\s*/i, '').trim();

      const shellPatterns = [
        /`{1,3}(?:bash|sh|shell|terminal|console|ssh)?\n[\s\S]*?`{1,3}/gi,
        /(?:^|\n)\s*(?:sudo|systemctl|docker|service|journalctl|cd |nano |vim |cat |tail |grep |curl |wget |apt |yum |kill |reboot|shutdown|wings )\s+.+/gi,
        /\$\s+\S+/g,
        /#\s+(?:sudo|systemctl|docker|service|cd|nano|vim|cat|tail|grep|curl|wget|apt|yum|kill|reboot|shutdown|wings)\s+.+/gi,
      ];
      let filtered = aiReply;
      for (const pat of shellPatterns) {
        filtered = filtered.replace(pat, '\n> _[This step requires infrastructure team action — it has been escalated automatically.]_\n');
      }
      const wasFiltered = filtered !== aiReply;
      if (wasFiltered) {
        aiReply = filtered.trim();
      }

      const stage2System = `
You are a ticket-control classifier. You receive a support conversation and an AI-generated reply.
Output a JSON object with control directives. Nothing else.

Rules:
- "escalate": true if the issue requires human staff (node outages, critical failures, AI cannot resolve, user lacks access, any node/host-level action is needed).
- "spam": true if the ticket is clearly spam or abuse.
- "close": true if the issue is fully resolved (will be marked for human verification).
- "sets": object of field updates. Supported keys:
    "priority": one of ${ALLOWED_PRIORITIES.join(', ')}
    "department": one of ${ALLOWED_DEPARTMENTS.join(', ')}
  Only include keys that SHOULD CHANGE from the current values.
  Current priority: "${ticket.priority || ''}"
  Current department: "${ticket.department || ''}"
  Do NOT include a key if it already matches the current value.

Example output:
{"escalate":false,"spam":false,"close":false,"sets":{"priority":"urgent","department":"Technical Support"}}

No actions needed:
{"escalate":false,"spam":false,"close":false,"sets":{}}`;

      const stage2Messages = [
        { role: 'system', content: stage2System },
        ...conversationMessages(),
        { role: 'assistant', content: aiReply },
        { role: 'user', content: 'Analyze the full conversation and assistant reply above. Output the control JSON only.' },
      ];

      let directive: Directive;
      try {
        const raw = await callModel(model, stage2Messages, 200, 20_000);
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === 'object') {
          directive = {
            escalate: Boolean(parsed.escalate),
            spam: Boolean(parsed.spam),
            close: Boolean(parsed.close),
            sets: parsed.sets && typeof parsed.sets === 'object' ? parsed.sets : {},
          };
        } else {
          directive = extractFallback(aiReply);
        }
      } catch {
        directive = extractFallback(aiReply);
      }

      if (wasFiltered) {
        directive.escalate = true;
      }

      await apply(aiReply, directive);

    } catch (e: any) {
      await log(0, 'ticket:ai:error', tid, { error: String(e?.message ?? e) });
      console.error('AI handler error', e);
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

    const tickets = adminRoles.includes(user.role)
      ? await repo.find({ order: { created: 'DESC' } })
      : await repo.find({ where: { userId: user.id }, order: { created: 'DESC' } });

    let filtered = tickets;
    if (statusFilter) {
      filtered = filtered.filter((t: any) => (t.status || '').toString().toLowerCase() === statusFilter);
    }
    if (priorityFilter) {
      filtered = filtered.filter((t: any) => (t.priority || '').toString().toLowerCase() === priorityFilter);
    }
    if (departmentFilter) {
      filtered = filtered.filter((t: any) => (t.department || '').toString().toLowerCase() === departmentFilter);
    }

    if (archiveOnly === 'true' || archiveOnly === '1' || archiveOnly === 'yes' || statusFilter === 'archived') {
      filtered = filtered.filter((t: any) => t.archived === true);
    } else if (includeArchived === 'true' || includeArchived === '1' || includeArchived === 'yes') {
      // skip
    } else {
      filtered = filtered.filter((t: any) => !t.archived);
    }

    if (adminRoles.includes(user.role) && !showAi) {
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
    const ticket = repo.create({
      userId: user.id,
      subject,
      message,
      priority: priority || 'medium',
      status: 'opened',
      department: typeof department === 'string' ? department : null,
      messages: [{ sender: 'user', message, created: now }],
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
              try { parsed = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
              const isUrgent = Boolean(parsed?.urgent) || Boolean(parsed?.high) || /urgent/i.test(raw) || /high priority/i.test(raw);
              if (!isUrgent) {
                const now = new Date();
                const note = sanitizeForDb('This ticket appears to be outside free-plan support. If you need urgent or high-priority support please upgrade your plan at /dashboard/billing or contact sales at contact@eclipsesystems.org. The ticket has been closed.');
                if (!Array.isArray(saved.messages)) saved.messages = [];
                saved.messages.push({ sender: 'staff', message: note, created: now, ai: true });
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
    if (ticket.userId !== user.id && !adminRoles.includes(user.role)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    return { ...ticket, status: normalizeStatus(ticket.status), lastReply: computeLastReply(ticket) };
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
    if (!adminRoles.includes(user.role) && ticket.userId !== user.id) {
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

    if (!Array.isArray(ticket.messages)) ticket.messages = [];

    let pushedSender: 'staff' | 'user' | null = null;
    let lastMessageText: string | null = null;
    if (typeof reply === 'string' && reply.trim()) {
      const isAdmin = adminRoles.includes(user.role);
      const sender: 'staff' | 'user' = replyAs === 'user' ? 'user' : replyAs === 'staff' ? 'staff' : (isAdmin ? 'staff' : 'user');
      const txt = reply.trim();
      ticket.messages.push({ sender, message: txt, created: now });
      pushedSender = sender;
      lastMessageText = txt;

      if (sender === 'staff') {
        ticket.adminReply = reply.trim();
      }

      if (!status) {
        ticket.status = sender === 'staff' ? 'replied' : 'awaiting_staff_reply';
      }
    } else if (typeof message === 'string' && message.trim()) {
      const txt = message.trim();
      const safeTxt = sanitizeForDb(txt);
      ticket.message = `${ticket.message}\n\n---\n${safeTxt}`;
      ticket.messages.push({ sender: 'user', message: safeTxt, created: now });
      pushedSender = 'user';
      lastMessageText = txt;
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
    if (!adminRoles.includes(user.role)) {
      ctx.set.status = 403;
      return { error: 'Forbidden' };
    }
    await repo.delete(Number(ctx.params.id));
    return { success: true };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Delete ticket (admin only)', tags: ['Tickets'] }
  });
}
