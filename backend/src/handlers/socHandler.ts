import { AppDataSource } from '../config/typeorm';
import { SocData } from '../models/socData.entity';
import { SecurityFinding } from '../models/securityFinding.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { ServerSubuser } from '../models/serverSubuser.entity';
import { logAdminAction, getAdminAuditEntries, getAdminTimeReport } from '../services/adminAuditService';
import { authenticate } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { WingsApiService } from '../services/wingsApiService';
import { redisGet, redisSet } from '../config/redis';
import { runSecurityScan, submitExternalFinding } from '../services/securityScanner';
import { getUserSocAlertPrefs } from '../services/alertDispatcher';
import { In, Not, IsNull } from 'typeorm';
import { t } from 'elysia';
import { PanelSetting } from '../models/panelSetting.entity';
import { DetectionRule } from '../models/detectionRule.entity';
import { testRule } from '../services/ruleEngine';
import { Ticket } from '../models/ticket.entity';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

async function buildWingsConfigPayload() {
  const psRepo = AppDataSource.getRepository(PanelSetting);
  const rows = await psRepo.find();
  const map: Record<string, string> = {};
  for (const r of rows) { if (r.key.startsWith('soc.')) map[r.key] = r.value; }

  const ruleRepo = AppDataSource.getRepository(DetectionRule);
  const rules = await ruleRepo.find({ where: { enabled: true } });

  let latestVersion = map['soc.wings_version'] || '';
  if (!latestVersion) {
    const binPath = join(process.cwd(), '..', 'wings', 'target', 'release', 'wings-rs');
    if (existsSync(binPath)) {
      const { createHash } = await import('crypto');
      const bin = await readFile(binPath);
      latestVersion = createHash('sha256').update(bin).digest('hex').slice(0, 16);
    }
  }

  return {
    antiabuse: {
      enabled: map['soc.ab_enabled'] !== 'false',
      cpuThresholdPct: Number(map['soc.ab_cpu_threshold'] || '80'),
      networkThresholdMbps: Number(map['soc.ab_network_threshold_mbps'] || '100'),
      cooldownSeconds: Number(map['soc.ab_cooldown_seconds'] || '300'),
      strikesForSuspend: Number(map['soc.ab_strikes_suspend'] || '3'),
    },
    vpnDpi: {
      enabled: map['soc.vpn_dpi_enabled'] !== 'false',
      protocolActions: (() => { try { return JSON.parse(map['soc.vpn_dpi_protocol_actions'] || '{}'); } catch { return {}; } })(),
      sampleIntervalSeconds: Number(map['soc.vpn_dpi_sample_interval'] || '300'),
      sampleDurationMs: Number(map['soc.vpn_dpi_sample_duration'] || '10000'),
      bandwidthThresholdKbps: Number(map['soc.vpn_dpi_bandwidth_threshold'] || '1'),
      portScanThreshold: Number(map['soc.vpn_dpi_port_scan_threshold'] || '15'),
      portScanAction: map['soc.vpn_dpi_port_scan_action'] || 'alert',
      dpiRules: (() => { try { return JSON.parse(map['soc.vpn_dpi_rules'] || '[]'); } catch { return []; } })(),
    },
    rules: rules.map(r => ({
      id: r.id, name: r.name, severity: r.severity, category: r.category,
      conditions: r.conditions, frequency: r.frequency, sources: r.sources,
      visibility: r.visibility || 'public',
      createsIncident: r.createsIncident || false,
    })),
    latestVersion,
    downloadUrl: '/api/wings/download',
    heartbeatIntervalSeconds: 30,
    configPollIntervalSeconds: 120,
  };
}

async function computeConfigVersion(payload: Record<string, any>): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

export async function socRoutes(app: any, prefix = '') {
  const socRepo = AppDataSource.getRepository(SocData);

  async function withCache<T>(key: string, ttlSeconds: number, loader: () => Promise<T>) {
    try {
      const cached = await redisGet(key);
      if (cached) {
        const raw = typeof cached === 'string' ? cached : String(cached);
        return JSON.parse(raw) as T;
      }
    } catch { }

    const data = await loader();
    try {
      await redisSet(key, JSON.stringify(data), ttlSeconds);
    } catch { }
    return data;
  }

  app.get(
    prefix + '/soc/overview',
    async (ctx: any) => {
      const user = ctx.user as any;
      const isAdmin = hasPermissionSync(ctx, 'soc:read');

      const cacheKey = isAdmin ? 'soc:overview:admin' : `soc:overview:user:${user.id}`;

      return withCache(cacheKey, 5, async () => {
        if (isAdmin) {
          return socRepo.find({ order: { timestamp: 'DESC' }, take: 500 });
        }

        try {
          const nodeRepo = AppDataSource.getRepository(require('../models/node.entity').Node);
          const nodes = await nodeRepo.find();

          const nodeResults = await Promise.allSettled(
            nodes.map(async n => {
              try {
                const base = (n as any).backendWingsUrl || n.url;
                const svc = new WingsApiService(base, n.token);
                const res = await svc.getServers();
                return { servers: Array.isArray(res.data) ? res.data : [] };
              } catch { return null; }
            })
          );
          const serverIds: string[] = [];
          for (const r of nodeResults) {
            if (r.status !== 'fulfilled' || !r.value) continue;
            for (const s of r.value.servers) {
              if (s.owner === user.id) serverIds.push(s.uuid);
            }
          }

          if (!serverIds.length) return [];

          return socRepo
            .createQueryBuilder('s')
            .where('s.serverId IN (:...ids)', { ids: serverIds })
            .orderBy('s.timestamp', 'DESC')
            .take(200)
            .getMany();
        } catch {
          return [];
        }
      });
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'SOC overview metrics', tags: ['SOC'] },
    }
  );

  app.post(
    prefix + '/soc/data',
    async (ctx: any) => {
      const payload = ctx.body as Partial<SocData>;
      const metrics = payload.metrics || {};
      if (JSON.stringify(metrics).length > 64000) {
        ctx.set.status = 413;
        return { error: 'Metrics payload exceeds 64KB limit' };
      }
      const entry = socRepo.create({
        serverId: payload.serverId,
        metrics,
        timestamp: new Date(),
      });
      await socRepo.save(entry);
      try {
        const { socEmitter } = require('../services/socSocketService');
        socEmitter.emit('update', entry);
      } catch { }
      return { success: true, entry };
    },
    {
      beforeHandle: [authenticate, authorize('soc:write')],
      response: {
        200: t.Object({ success: t.Boolean(), entry: t.Any() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Submit SOC data point', tags: ['SOC'] },
    }
  );

  app.get(
    prefix + '/soc/plans',
    async (ctx: any) => {
      const planRepo = AppDataSource.getRepository(require('../models/plan.entity').Plan);
      const plans = await planRepo.find();
      return plans;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'List SOC plans', tags: ['SOC'] },
    }
  );

  app.get(
    prefix + '/soc/usage/user/:id',
    async (ctx: any) => {
      const userId = Number(ctx.params['id']);
      const repo = AppDataSource.getRepository(
        require('../models/apiRequestLog.entity').ApiRequestLog
      );
      const data = await repo
        .createQueryBuilder('r')
        .select('r.endpoint', 'endpoint')
        .addSelect('COUNT(*)', 'count')
        .where('r.userId = :uid', { uid: userId })
        .groupBy('r.endpoint')
        .getRawMany();
      return data;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'API usage by user', tags: ['SOC'] },
    }
  );

  app.get(
    prefix + '/soc/usage/org/:id',
    async (ctx: any) => {
      const orgId = Number(ctx.params['id']);
      const repo = AppDataSource.getRepository(
        require('../models/apiRequestLog.entity').ApiRequestLog
      );
      const data = await repo
        .createQueryBuilder('r')
        .select('r.endpoint', 'endpoint')
        .addSelect('COUNT(*)', 'count')
        .where('r.organisationId = :oid', { oid: orgId })
        .groupBy('r.endpoint')
        .getRawMany();
      return data;
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'API usage by organisation', tags: ['SOC'] },
    }
  );

  const findingRepo = () => AppDataSource.getRepository(SecurityFinding);

  app.get(
    prefix + '/soc/security-findings',
    async (ctx: any) => {
      const repo = findingRepo();
      const qb = repo.createQueryBuilder('f');

      if (ctx.query?.status && ctx.query.status !== 'all') {
        qb.andWhere('f.status = :status', { status: ctx.query.status });
      } else if (ctx.query?.status !== 'all') {
        qb.andWhere('f.status = :status', { status: 'open' });
      }
      if (ctx.query?.status !== 'internal_resolved') {
        qb.andWhere('f.status != :hiddenStatus', { hiddenStatus: 'internal_resolved' });
      }
      if (ctx.query?.severity) {
        qb.andWhere('f.severity = :severity', { severity: ctx.query.severity });
      }
      if (ctx.query?.category) {
        qb.andWhere('f.category = :category', { category: ctx.query.category });
      }
      if (ctx.query?.source) {
        qb.andWhere('f.source = :source', { source: ctx.query.source });
      }
      if (ctx.query?.serverId) {
        qb.andWhere('f.serverId = :serverId', { serverId: ctx.query.serverId });
      }
      if (ctx.query?.nodeId) {
        qb.andWhere('f.nodeId = :nodeId', { nodeId: Number(ctx.query.nodeId) });
      }
      if (ctx.query?.visibility === 'public') {
        qb.andWhere('f.visibility != :staffOnly', { staffOnly: 'staff_only' });
      } else if (ctx.query?.visibility === 'staff_only') {
        qb.andWhere('f.visibility = :staffOnly', { staffOnly: 'staff_only' });
      }

      const user = ctx.user as any;
      let scopeClause = '';
      let scopeParams: Record<string, any> = {};

      if (user && !hasPermissionSync(ctx, 'soc:read')) {
        qb.andWhere('f.visibility != :staffOnly', { staffOnly: 'staff_only' });

        const cfgRepo = AppDataSource.getRepository(ServerConfig);
        const subuserRepo = AppDataSource.getRepository(ServerSubuser);

        // Get user's own + subuser servers
        const subuserEntries = await subuserRepo.find({ where: { userId: user.id } });
        const subuserUuids = subuserEntries.map((s: any) => s.serverUuid);

        // Get org member servers (user's organisations → all member userIds → their servers)
        let orgMemberIds: number[] = [];
        try {
          const orgMemberRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);
          const memberships = await orgMemberRepo.find({ where: { userId: user.id } });
          const orgIds = memberships.map((m: any) => m.organisationId);
          if (orgIds.length > 0) {
            const orgPeers = await orgMemberRepo.find({ where: { organisationId: In(orgIds) } });
            orgMemberIds = [...new Set(orgPeers.map((m: any) => m.userId))];
          }
        } catch {}

        const ownServers = await cfgRepo.find({
          where: [
            { userId: user.id },
            ...(subuserUuids.length ? [{ uuid: In(subuserUuids) }] : []),
            ...(orgMemberIds.length ? [{ userId: In(orgMemberIds) }] : []),
          ],
        });
        const allowedIds = ownServers.map((s: any) => s.uuid);
        scopeClause = '(f.userId = :scopeUserId OR f.serverId IN (:...scopeServerIds))';
        scopeParams = {
          scopeUserId: user.id,
          scopeServerIds: allowedIds.length ? allowedIds : ['__none__'],
        };
        qb.andWhere(scopeClause, scopeParams);
      } else {
        const cfgRepo = AppDataSource.getRepository(ServerConfig);
        const adminServers = await cfgRepo.find({ where: { userId: user.id } });
        const adminServerIds = adminServers.map((s: any) => s.uuid);
        scopeClause = `(f.checkFingerprint NOT LIKE 'access_control_orphaned_%' AND f.checkFingerprint NOT LIKE 'access_control_admin_subuser_%' AND f.checkFingerprint NOT LIKE 'login_anomaly_newip_%') OR f.serverId IN (:...adminSrvIds)`;
        scopeParams = { adminSrvIds: adminServerIds.length ? adminServerIds : ['__none__'] };
        qb.andWhere(scopeClause, scopeParams);
      }

      qb.orderBy('f.detectedAt', 'DESC');

      const page = Math.max(1, Number(ctx.query?.page) || 1);
      const perPage = Math.min(100, Math.max(1, Number(ctx.query?.perPage) || 50));
      qb.skip((page - 1) * perPage).take(perPage);

      const [findings, total] = await qb.getManyAndCount();

      const summaryQb = repo
        .createQueryBuilder('f')
        .select('f.severity', 'severity')
        .addSelect('COUNT(*)', 'count')
        .where('f.status = :status', { status: 'open' })
        .groupBy('f.severity');
      if (scopeClause) summaryQb.andWhere(scopeClause, scopeParams);
      if (ctx.query?.visibility === 'public') {
        summaryQb.andWhere('f.visibility != :staffOnly', { staffOnly: 'staff_only' });
      } else if (ctx.query?.visibility === 'staff_only') {
        summaryQb.andWhere('f.visibility = :staffOnly', { staffOnly: 'staff_only' });
      }
      if (user && !hasPermissionSync(ctx, 'soc:read')) {
        summaryQb.andWhere('f.visibility != :staffOnly', { staffOnly: 'staff_only' });
      }
      const summaryRows = await summaryQb.getRawMany();

      const summary: Record<string, number> = {};
      for (const r of summaryRows) {
        summary[String(r.severity)] = Number(r.count);
      }

      return { findings, total, page, perPage, summary };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'List security findings with filters', tags: ['SOC'] },
    }
  );

  app.post(
    prefix + '/soc/security-findings',
    async (ctx: any) => {
      const body = ctx.body as any;
      if (!body || !body.title || !body.severity || !body.category) {
        ctx.set.status = 400;
        return { error: 'title, severity, and category are required' };
      }

      const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
      if (!validSeverities.includes(body.severity)) {
        ctx.set.status = 400;
        return { error: `severity must be one of: ${validSeverities.join(', ')}` };
      }

      const finding = await submitExternalFinding({
        sourceName: body.sourceName,
        category: body.category,
        severity: body.severity,
        title: body.title,
        description: body.description || '',
        serverId: body.serverId,
        nodeId: body.nodeId,
        userId: body.userId,
        metadata: body.metadata,
      });

      void logAdminAction({ adminUserId: ctx.user?.id, action: 'soc:finding:external_submit', targetId: finding.serverId, targetType: 'server', metadata: { title: finding.title, severity: finding.severity, sourceName: finding.sourceName }, ipAddress: ctx.ip });

      return { success: true, finding };
    },
    {
      beforeHandle: [authenticate, authorize('soc:write')],
      response: {
        200: t.Object({ success: t.Boolean(), finding: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Submit external security finding (Wazuh/Fail2ban/etc)', tags: ['SOC'] },
    }
  );

  app.post(
    prefix + '/soc/security-scan',
    async (ctx: any) => {
      const result = await runSecurityScan();
      void logAdminAction({ adminUserId: ctx.user?.id, action: 'soc:scan:run', metadata: { created: result.created, resolved: result.resolved }, ipAddress: ctx.ip });
      return { success: true, ...result };
    },
    {
      beforeHandle: [authenticate, authorize('soc:write')],
      response: {
        200: t.Object({
          success: t.Boolean(),
          created: t.Number(),
          resolved: t.Number(),
          totalOpen: t.Number(),
        }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Run internal security scan on demand', tags: ['SOC'] },
    }
  );

  app.patch(
    prefix + '/soc/security-findings/:id',
    async (ctx: any) => {
      const repo = findingRepo();
      const id = Number(ctx.params['id']);
      if (isNaN(id)) {
        ctx.set.status = 400;
        return { error: 'Invalid finding ID' };
      }

      const finding = await repo.findOneBy({ id });
      if (!finding) {
        ctx.set.status = 404;
        return { error: 'Finding not found' };
      }

      const user = ctx.user as any;
      if (user && !hasPermissionSync(ctx, 'soc:read')) {
        const isOwner = finding.userId === user.id;
        let isOwnServer = false;
        if (finding.serverId) {
          const cfgRepo = AppDataSource.getRepository(ServerConfig);
          const subuserRepo = AppDataSource.getRepository(ServerSubuser);
          const subuserEntries = await subuserRepo.find({ where: { userId: user.id } });
          const subuserUuids = subuserEntries.map((s: any) => s.serverUuid);
          const ownCount = await cfgRepo.count({
            where: [
              { uuid: finding.serverId, userId: user.id },
              ...(subuserUuids.includes(finding.serverId) ? [{ uuid: finding.serverId }] : []),
            ],
          });
          isOwnServer = ownCount > 0;
        }
        if (!isOwner && !isOwnServer) {
          ctx.set.status = 403;
          return { error: 'You can only update findings on your own servers' };
        }
      }

      const { status } = (ctx.body || {}) as any;
      const validStatuses = ['acknowledged', 'resolved', 'false_positive', 'internal_resolved'];
      if (!validStatuses.includes(status)) {
        ctx.set.status = 400;
        return { error: `status must be one of: ${validStatuses.join(', ')}` };
      }

      finding.status = status;
      if (status === 'resolved') {
        finding.resolvedAt = new Date();
        finding.resolvedByUserId = ctx.user?.id;
      } else if (status === 'open' || status === 'acknowledged') {
        finding.resolvedAt = null as any;
        finding.resolvedByUserId = null as any;
      }
      await repo.save(finding);

      void logAdminAction({ adminUserId: ctx.user?.id, action: `soc:finding:${status}`, targetId: String(id), targetType: 'finding', metadata: { title: finding.title, severity: finding.severity }, ipAddress: ctx.ip });

      return { success: true, finding };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Object({ success: t.Boolean(), finding: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Update security finding status', tags: ['SOC'] },
    }
  );

  app.delete(
    prefix + '/soc/security-findings/:id',
    async (ctx: any) => {
      const repo = findingRepo();
      const id = Number(ctx.params['id']);
      if (isNaN(id)) {
        ctx.set.status = 400;
        return { error: 'Invalid finding ID' };
      }

      const finding = await repo.findOneBy({ id });
      if (!finding) {
        ctx.set.status = 404;
        return { error: 'Finding not found' };
      }

      await repo.remove(finding);
      void logAdminAction({ adminUserId: ctx.user?.id, action: 'soc:finding:force_delete', targetId: String(id), targetType: 'finding', metadata: { title: finding.title, severity: finding.severity, category: finding.category }, ipAddress: ctx.ip });
      console.log(`[soc] Finding #${id} force-deleted by user #${ctx.user?.id}: ${finding.title}`);
      return { success: true };
    },
    {
      beforeHandle: [authenticate, authorize('soc:read')],
      response: {
        200: t.Object({ success: t.Boolean() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Force delete a security finding (admin only)', tags: ['SOC'] },
    }
  );

  app.post(
    prefix + '/soc/security-findings/:id/escalate',
    async (ctx: any) => {
      const repo = findingRepo();
      const id = Number(ctx.params['id']);
      if (isNaN(id)) {
        ctx.set.status = 400;
        return { error: 'Invalid finding ID' };
      }

      const finding = await repo.findOneBy({ id });
      if (!finding) {
        ctx.set.status = 404;
        return { error: 'Finding not found' };
      }

      const user = ctx.user as any;
      const isAdmin = user && hasPermissionSync(ctx, 'soc:read');

      if (!isAdmin) {
        let canEscalate = finding.userId === user?.id;
        if (!canEscalate && finding.serverId) {
          try {
            const cfg = await AppDataSource.getRepository(ServerConfig).findOne({ where: { uuid: finding.serverId } });
            canEscalate = cfg?.userId === user?.id;
          } catch {}
        }
        if (!canEscalate) {
          ctx.set.status = 403;
          return { error: 'You can only escalate findings on your own servers' };
        }
      }

      const { action, note } = (ctx.body || {}) as any;

      let ownerId = finding.userId;
      if (!ownerId && finding.serverId) {
        try {
          const cfg = await AppDataSource.getRepository(ServerConfig).findOne({ where: { uuid: finding.serverId } });
          ownerId = cfg?.userId ?? undefined;
        } catch { }
      }

      const ticketRepo = AppDataSource.getRepository(Ticket);
      const now = new Date();
      const ticketSubject = `[Security] ${finding.title}`;
      const ticketBody = [
        `**Security Finding Escalation**`,
        `**Finding:** ${finding.title}`,
        `**Severity:** ${finding.severity} | **Category:** ${finding.category}`,
        `**Description:** ${finding.description}`,
        `**Server:** ${finding.serverId || 'N/A'}`,
        `**Detected:** ${finding.detectedAt?.toISOString() || 'unknown'}`,
        note ? `**Staff Note:** ${note}` : '',
      ].filter(Boolean).join('\n');

      const ticket = ticketRepo.create({
        userId: ownerId || user?.id || 0,
        subject: ticketSubject,
        message: ticketBody,
        priority: finding.severity === 'critical' ? 'urgent' : finding.severity === 'high' ? 'high' : 'medium',
        status: 'opened',
        department: 'technical',
        messages: [{ sender: 'staff', message: ticketBody, created: now }],
      });
      const savedTicket = await ticketRepo.save(ticket);

      if (ownerId) {
        try {
          const notifRepo = AppDataSource.getRepository(require('../models/notification.entity').Notification);
          await notifRepo.save(notifRepo.create({
            userId: ownerId, type: 'security_escalation',
            title: `Security issue escalated: ${finding.title}`,
            body: `A support ticket (#${savedTicket.id}) has been created. Staff will respond there.`,
            url: `/dashboard/tickets/${savedTicket.id}`,
          }));
        } catch { }
      }

      finding.metadata = { ...(finding.metadata || {}), escalated: true, escalatedAt: now.toISOString(), escalatedBy: user?.id, ticketId: savedTicket.id };
      finding.status = 'acknowledged';
      await repo.save(finding);

      void logAdminAction({ adminUserId: ctx.user?.id, action: 'soc:finding:escalate', targetId: String(id), targetType: 'finding', metadata: { title: finding.title, ticketId: savedTicket.id }, ipAddress: ctx.ip });

      return { success: true, finding, ticketId: savedTicket.id };
    },
    {
      beforeHandle: [authenticate, authorize('soc:read')],
      response: {
        200: t.Object({ success: t.Boolean(), finding: t.Any(), ticketId: t.Number() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Escalate security finding to staff for evaluation', tags: ['SOC'] },
    }
  );

  app.get(
    prefix + '/soc/alert-prefs',
    async (ctx: any) => {
      const user = ctx.user as any;
      if (!user) {
        ctx.set.status = 401;
        return { error: 'Unauthorized' };
      }
      const prefs = await getUserSocAlertPrefs(user.id);
      return { success: true, prefs };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'Get current user SOC alert preferences', tags: ['SOC'] },
    }
  );

  app.get(
    prefix + '/soc/admin-settings',
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'soc:read')) {
        ctx.set.status = 403;
        return { error: 'Forbidden' };
      }
      const repo = AppDataSource.getRepository(PanelSetting);
      const rows = await repo.find();
      const map: Record<string, string> = {};
      for (const r of rows) {
        if (r.key.startsWith('soc.')) map[r.key] = r.value;
      }
      return {
        abuseipdbKey: map['soc.abuseipdb_key'] || '',
        threatIpList: map['soc.threat_ip_list'] || '',
        threatIpCidrList: map['soc.threat_ip_cidr_list'] || '',
        threatImageList: map['soc.threat_image_list'] || '',
        alertEmail: map['soc.alert_email'] || process.env.ABUSE_REPORT_EMAIL || '',
        alertWebhookUrl: map['soc.alert_webhook_url'] || '',
        alertSeverities: (map['soc.alert_severities'] || 'critical,high').split(','),
        scanScheduleMinutes: Number(map['soc.scan_schedule_minutes'] || '30'),
        abCpuThreshold: Number(map['soc.ab_cpu_threshold'] || '80'),
        abNetworkThresholdMbps: Number(map['soc.ab_network_threshold_mbps'] || '100'),
        abCooldownSeconds: Number(map['soc.ab_cooldown_seconds'] || '300'),
        abStrikesForSuspend: Number(map['soc.ab_strikes_suspend'] || '3'),
        abEnabled: map['soc.ab_enabled'] !== 'false',
        vpnDpiEnabled: map['soc.vpn_dpi_enabled'] !== 'false',
        vpnDpiProtocolActions: (() => { try { return JSON.parse(map['soc.vpn_dpi_protocol_actions'] || '{}'); } catch { return {}; } })(),
        vpnDpiSampleInterval: Number(map['soc.vpn_dpi_sample_interval'] || '300'),
        vpnDpiSampleDuration: Number(map['soc.vpn_dpi_sample_duration'] || '10000'),
        vpnDpiBandwidthThreshold: Number(map['soc.vpn_dpi_bandwidth_threshold'] || '1'),
        vpnDpiPortScanThreshold: Number(map['soc.vpn_dpi_port_scan_threshold'] || '15'),
        vpnDpiPortScanAction: map['soc.vpn_dpi_port_scan_action'] || 'alert',
        vpnDpiRules: (() => { try { return JSON.parse(map['soc.vpn_dpi_rules'] || '[]'); } catch { return []; } })(),
      };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Get admin SOC settings', tags: ['SOC'] },
    }
  );

  app.put(
    prefix + '/soc/admin-settings',
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'soc:read')) {
        ctx.set.status = 403;
        return { error: 'Forbidden' };
      }
      const body = ctx.body as any;
      if (!body) { ctx.set.status = 400; return { error: 'Missing body' }; }

      const repo = AppDataSource.getRepository(PanelSetting);
      const updates: Record<string, string> = {
        'soc.abuseipdb_key': String(body.abuseipdbKey || ''),
        'soc.threat_ip_list': String(body.threatIpList || ''),
        'soc.threat_ip_cidr_list': String(body.threatIpCidrList || ''),
        'soc.threat_image_list': String(body.threatImageList || ''),
        'soc.alert_email': String(body.alertEmail || ''),
        'soc.alert_webhook_url': String(body.alertWebhookUrl || ''),
        'soc.alert_severities': String(body.alertSeverities || 'critical,high'),
        'soc.scan_schedule_minutes': String(body.scanScheduleMinutes || '30'),
        'soc.ab_cpu_threshold': String(body.abCpuThreshold || '80'),
        'soc.ab_network_threshold_mbps': String(body.abNetworkThresholdMbps || '100'),
        'soc.ab_cooldown_seconds': String(body.abCooldownSeconds || '300'),
        'soc.ab_strikes_suspend': String(body.abStrikesSuspend || '3'),
        'soc.ab_enabled': String(body.abEnabled !== false),
        'soc.vpn_dpi_enabled': String(body.vpnDpiEnabled !== false),
        'soc.vpn_dpi_protocol_actions': JSON.stringify(body.vpnDpiProtocolActions || {}),
        'soc.vpn_dpi_sample_interval': String(body.vpnDpiSampleInterval || '300'),
        'soc.vpn_dpi_sample_duration': String(body.vpnDpiSampleDuration || '10000'),
        'soc.vpn_dpi_bandwidth_threshold': String(body.vpnDpiBandwidthThreshold || '1'),
        'soc.vpn_dpi_port_scan_threshold': String(body.vpnDpiPortScanThreshold || '15'),
        'soc.vpn_dpi_port_scan_action': String(body.vpnDpiPortScanAction || 'alert'),
        'soc.vpn_dpi_rules': JSON.stringify(body.vpnDpiRules || []),
      };

      for (const [key, value] of Object.entries(updates)) {
        let row = await repo.findOneBy({ key });
        if (row) {
          row.value = value;
        } else {
          row = repo.create({ key, value });
        }
        await repo.save(row);
      }

      void logAdminAction({ adminUserId: ctx.user?.id, action: 'soc:settings:update', metadata: { keys: Object.keys(updates) }, ipAddress: ctx.ip });
      return { success: true };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Object({ success: t.Boolean() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Update admin SOC settings', tags: ['SOC'] },
    }
  );

  const ruleRepo = () => AppDataSource.getRepository(DetectionRule);

  app.get(
    prefix + '/soc/detection-rules',
    async (ctx: any) => {
      const isAdmin = hasPermissionSync(ctx, 'soc:read');
      const repo = ruleRepo();

      const wingsMode = ctx.query?.mode === 'wings';
      if (wingsMode) {
        const rules = await repo.find({ where: { enabled: true } });
        return { rules, total: rules.length };
      }

      if (!isAdmin) {
        const user = ctx.user as any;
        const rules = await repo.createQueryBuilder('r')
          .where('r.enabled = true')
          .andWhere('(r.scope = :global OR (r.scope = :userScope AND r.scopeId = :uid) OR r.createdByUserId = :uid2)',
            { global: 'global', userScope: 'user', uid: String(user?.id || ''), uid2: user?.id || 0 })
          .orderBy('r.createdAt', 'DESC')
          .getMany();
        return { rules, total: rules.length };
      }

      const rules = await repo.find({ order: { createdAt: 'DESC' } });
      return { rules, total: rules.length };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'List detection rules (Wings-compatible polling)', tags: ['SOC'] },
    }
  );

  app.post(
    prefix + '/soc/detection-rules',
    async (ctx: any) => {
      const user = ctx.user as any;
      if (!user) { ctx.set.status = 401; return { error: 'Unauthorized' }; }

      const body = ctx.body as any;
      if (!body?.name || !body?.conditions) {
        ctx.set.status = 400;
        return { error: 'name and conditions are required' };
      }

      const isAdmin = hasPermissionSync(ctx, 'soc:read');
      const repo = ruleRepo();

      const rule = repo.create({
        name: String(body.name).slice(0, 200),
        description: String(body.description || '').slice(0, 1000),
        category: body.category || 'other',
        severity: body.severity || 'medium',
        enabled: body.enabled !== false,
        sources: body.sources || ['user_log'],
        conditions: body.conditions,
        frequency: body.frequency || null,
        correlation: body.correlation || null,
        scope: isAdmin ? (body.scope || 'global') : 'user',
        scopeId: isAdmin ? (body.scopeId || null) : String(user.id),
        createdByUserId: user.id,
        visibility: body.visibility === 'staff_only' ? 'staff_only' : 'public',
        createsIncident: body.createsIncident === true,
      });

      await repo.save(rule);
      void logAdminAction({ adminUserId: user.id, action: 'soc:rule:create', targetId: String(rule.id), targetType: 'detection_rule', metadata: { name: rule.name, severity: rule.severity }, ipAddress: ctx.ip });
      return { success: true, rule };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }) },
      detail: { summary: 'Create detection rule', tags: ['SOC'] },
    }
  );

  app.put(
    prefix + '/soc/detection-rules/:id',
    async (ctx: any) => {
      const id = Number(ctx.params.id);
      const repo = ruleRepo();
      const rule = await repo.findOneBy({ id });
      if (!rule) { ctx.set.status = 404; return { error: 'Rule not found' }; }

      const user = ctx.user as any;
      const isAdmin = hasPermissionSync(ctx, 'soc:read');
      if (!isAdmin && rule.createdByUserId !== user?.id) {
        ctx.set.status = 403; return { error: 'Forbidden' };
      }

      const body = ctx.body as any;
      if (body.name !== undefined) rule.name = String(body.name).slice(0, 200);
      if (body.description !== undefined) rule.description = String(body.description).slice(0, 1000);
      if (body.category !== undefined) rule.category = body.category;
      if (body.severity !== undefined) rule.severity = body.severity;
      if (body.enabled !== undefined) rule.enabled = body.enabled;
      if (body.sources !== undefined) rule.sources = body.sources;
      if (body.conditions !== undefined) rule.conditions = body.conditions;
      if (body.frequency !== undefined) rule.frequency = body.frequency || null;
      if (body.correlation !== undefined) rule.correlation = body.correlation || null;
      if (body.visibility !== undefined) rule.visibility = body.visibility === 'staff_only' ? 'staff_only' : 'public';
      if (body.createsIncident !== undefined) rule.createsIncident = body.createsIncident === true;

      await repo.save(rule);
      void logAdminAction({ adminUserId: user?.id, action: 'soc:rule:update', targetId: String(rule.id), targetType: 'detection_rule', metadata: { name: rule.name }, ipAddress: ctx.ip });
      return { success: true, rule };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Update detection rule', tags: ['SOC'] },
    }
  );

  app.delete(
    prefix + '/soc/detection-rules/:id',
    async (ctx: any) => {
      const id = Number(ctx.params.id);
      const repo = ruleRepo();
      const rule = await repo.findOneBy({ id });
      if (!rule) { ctx.set.status = 404; return { error: 'Rule not found' }; }

      const user = ctx.user as any;
      const isAdmin = hasPermissionSync(ctx, 'soc:read');
      if (!isAdmin && rule.createdByUserId !== user?.id) {
        ctx.set.status = 403; return { error: 'Forbidden' };
      }

      await repo.remove(rule);
      void logAdminAction({ adminUserId: ctx.user?.id, action: 'soc:rule:delete', targetId: String(id), targetType: 'detection_rule', metadata: { name: rule.name }, ipAddress: ctx.ip });
      return { success: true };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Delete detection rule', tags: ['SOC'] },
    }
  );

  app.post(
    prefix + '/soc/detection-rules/test',
    async (ctx: any) => {
      const body = ctx.body as any;
      if (!body?.conditions || !body?.event) {
        ctx.set.status = 400;
        return { error: 'conditions and event are required' };
      }
      const matched = testRule({ conditions: body.conditions }, body.event);
      return { matched };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Object({ matched: t.Boolean() }), 400: t.Object({ error: t.String() }) },
      detail: { summary: 'Test a rule against a sample event', tags: ['SOC'] },
    }
  );

  app.get(
    prefix + '/soc/admin-audit',
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'soc:read')) {
        ctx.set.status = 403;
        return { error: 'Forbidden' };
      }
      const { adminUserId, action, since, until, page, perPage } = ctx.query as any;
      const result = await getAdminAuditEntries({
        adminUserId: adminUserId ? Number(adminUserId) : undefined,
        action: action || undefined,
        since: since ? new Date(since) : undefined,
        until: until ? new Date(until) : undefined,
        page: Number(page) || 1,
        perPage: Number(perPage) || 50,
      });

      const userIds = [...new Set(result.entries.map(e => e.adminUserId))];
      const userMap: Record<number, any> = {};
      if (userIds.length > 0) {
        const User = require('../models/user.entity').User;
        const users = await AppDataSource.getRepository(User)
          .createQueryBuilder('u')
          .select(['u.id', 'u.firstName', 'u.lastName', 'u.email', 'u.avatarUrl'])
          .where('u.id IN (:...ids)', { ids: userIds })
          .getMany();
        for (const u of users) {
          userMap[u.id] = {
            username: [`${u.firstName || ''}`.trim(), `${u.lastName || ''}`.trim()].filter(Boolean).join(' ') || u.email || `#${u.id}`,
            email: u.email,
            avatarUrl: u.avatarUrl,
          };
        }
      }

      const entries = result.entries.map(e => ({
        ...e,
        adminName: userMap[e.adminUserId]?.username || `User #${e.adminUserId}`,
        adminEmail: userMap[e.adminUserId]?.email || null,
        adminAvatarUrl: userMap[e.adminUserId]?.avatarUrl || null,
      }));

      return { entries, total: result.total };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'List admin audit entries (read-only, immutable)', tags: ['SOC'] },
    }
  );

  app.get(
    prefix + '/soc/admin-audit/report',
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'soc:read')) {
        ctx.set.status = 403;
        return { error: 'Forbidden' };
      }
      const { adminUserId, since, until } = ctx.query as any;
      const rows = await getAdminTimeReport({
        adminUserId: adminUserId ? Number(adminUserId) : undefined,
        since: since ? new Date(since) : undefined,
        until: until ? new Date(until) : undefined,
      });

      const userIds = [...new Set(rows.map(r => r.adminUserId))];
      const userMap: Record<number, string> = {};
      if (userIds.length > 0) {
        const User = require('../models/user.entity').User;
        const users = await AppDataSource.getRepository(User)
          .createQueryBuilder('u')
          .select(['u.id', 'u.firstName', 'u.lastName', 'u.email'])
          .where('u.id IN (:...ids)', { ids: userIds })
          .getMany();
        for (const u of users) {
          userMap[u.id] = [`${u.firstName || ''}`.trim(), `${u.lastName || ''}`.trim()].filter(Boolean).join(' ') || u.email || `#${u.id}`;
        }
      }

      const report = rows.map(r => ({
        ...r,
        adminName: userMap[r.adminUserId] || `User #${r.adminUserId}`,
        totalMinutes: Math.round((r.totalMs / 60000) * 10) / 10,
      }));

      return { report };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Admin time-spent report by action', tags: ['SOC'] },
    }
  );

  app.get(
    prefix + '/wings/config',
    async (ctx: any) => {
      const isWings = await (async () => {
        try {
          const auth = ((ctx.headers || {})['authorization'] || '') as string;
          const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
          if (!token) return false;
          const nodeRepo = AppDataSource.getRepository(require('../models/node.entity').Node);
          return !!(await nodeRepo.findOne({ where: { token } }));
        } catch { return false; }
      })();
      if (!isWings) { ctx.set.status = 403; return { error: 'Wings node token required' }; }

      const configPayload = await buildWingsConfigPayload();
      const configVersion = await computeConfigVersion(configPayload);
      return { ...configPayload, configVersion };
    },
    {
      response: { 200: t.Any(), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Wings config poll — anti-abuse settings + detection rules', tags: ['Wings'] },
    }
  );

  app.post(
    prefix + '/wings/command',
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'soc:read')) {
        ctx.set.status = 403; return { error: 'Forbidden' };
      }
      const body = ctx.body as any;
      const nodeId = body?.nodeId;
      const action = body?.action;
      if (!nodeId || !action) {
        ctx.set.status = 400; return { error: 'nodeId and action are required' };
      }
      const nodeRepo = AppDataSource.getRepository(require('../models/node.entity').Node);
      const node = await nodeRepo.findOne({ where: { id: Number(nodeId) } });
      if (!node) { ctx.set.status = 404; return { error: 'Node not found' }; }

      const commands = [{ action, payload: body?.payload || null }];
      node.pendingCommand = JSON.stringify(commands);
      await nodeRepo.save(node);

      void logAdminAction({ adminUserId: ctx.user?.id, action: 'soc:wings:command', targetId: String(nodeId), targetType: 'node', metadata: { action, nodeName: node.name }, ipAddress: ctx.ip });
      return { success: true, message: `Command "${action}" queued for node "${node.name}". Will be delivered on next heartbeat.` };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Queue a command for a Wings node (delivered via heartbeat)', tags: ['SOC'] },
    }
  );

  app.get(
    prefix + '/soc/node-status',
    async (ctx: any) => {
      if (!hasPermissionSync(ctx, 'soc:read')) {
        ctx.set.status = 403; return { error: 'Forbidden' };
      }
      const nodeRepo = AppDataSource.getRepository(require('../models/node.entity').Node);
      const nodes = await nodeRepo.find({ where: { lastHeartbeatAt: Not(IsNull()) } });
      const now = Date.now();

      const configPayload = await buildWingsConfigPayload();
      const currentVersion = await computeConfigVersion(configPayload);

      const nodeStatus = nodes.map(n => {
        const ageMs = n.lastHeartbeatAt ? now - n.lastHeartbeatAt.getTime() : 999999;
        const active = ageMs < 120_000;
        const synced = active && n.configVersion === currentVersion;
        return {
          id: n.id, name: n.name,
          active,
          lastSeenMs: ageMs,
          wingsVersion: n.wingsVersion || null,
          nodeConfigVersion: n.configVersion || null,
          currentConfigVersion: currentVersion,
          synced,
          pendingCommand: n.pendingCommand || null,
        };
      });

      return { nodes: nodeStatus, currentConfigVersion: currentVersion };
    },
    {
      beforeHandle: authenticate,
      response: { 200: t.Any(), 403: t.Object({ error: t.String() }) },
      detail: { summary: 'Get Wings node config status', tags: ['SOC'] },
    }
  );

  app.get(
    prefix + '/wings/download',
    async (ctx: any) => {
      const arch = (ctx.query?.arch as string) || 'x86_64';
      const binName = arch === 'aarch64' ? 'wings-rs-aarch64' : 'wings-rs';

      const paths = [
        join(process.cwd(), '..', 'wings', 'output', 'target', 'release', 'wings-rs'),
        join(process.cwd(), '..', 'wings', 'target', 'release', 'wings-rs'),
        join(process.cwd(), 'wings', 'output', 'target', 'release', 'wings-rs'),
        join(process.cwd(), 'wings', 'target', 'release', 'wings-rs'),
      ];

      for (const p of paths) {
        if (existsSync(p)) {
          const binary = await readFile(p);
          return new Response(binary, {
            status: 200,
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${binName}"`,
              'Content-Length': String(binary.length),
            },
          });
        }
      }

      ctx.set.status = 404;
      return { error: 'Wings binary not found. Build it first: cd wings && ./manage.sh build' };
    },
    {
      response: { 200: t.Any(), 404: t.Object({ error: t.String() }) },
      detail: { summary: 'Download Wings binary (one-line installer)', tags: ['Wings'] },
    }
  );

  app.get(
    prefix + '/wings/install.sh',
    async (ctx: any) => {
      const host = process.env.PANEL_URL || process.env.FRONTEND_URL || 'localhost';
      const baseUrl = host.replace(/\/$/, "");
      const arch = '$(uname -m)';

      const script = `#!/bin/bash
set -e
ARCH=\$(uname -m)
if [ "\$ARCH" = "x86_64" ]; then ARCH="x86_64"; elif [ "\$ARCH" = "aarch64" ]; then ARCH="aarch64"; else echo "Unsupported arch: \$ARCH"; exit 1; fi
echo "Downloading Wings for \$ARCH..."
curl -fSL "${baseUrl}/api/wings/download?arch=\$ARCH" -o /usr/local/bin/wings
chmod +x /usr/local/bin/wings
echo "Wings installed to /usr/local/bin/wings"
echo "Run: wings --config /etc/pterodactyl/config.yml"
`;
      return new Response(script, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    },
    {
      response: { 200: t.Any() },
      detail: { summary: 'One-line Wings install script', tags: ['Wings'] },
    }
  );
}
