import { AppDataSource } from '../config/typeorm';
import { SecurityFinding } from '../models/securityFinding.entity';
import type { FindingCategory, FindingSeverity } from '../models/securityFinding.entity';
import { getUnhealthyNodeIds } from '../utils/nodeHealth';
import { In } from 'typeorm';
import { WingsApiService } from './wingsApiService';
import { Node } from '../models/node.entity';
import { scoreIpReputation, extractIpsFromFinding, isPrivateIp } from './threatIntel';
import { dispatchAlert } from './alertDispatcher';
import { evaluateAllRules } from './ruleEngine';

interface ScanCheckResult {
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  serverId?: string;
  nodeId?: number;
  userId?: number;
  metadata: Record<string, any>;
  fingerprint: string;
}

interface ScanOutcome {
  created: number;
  resolved: number;
  totalOpen: number;
  findings: SecurityFinding[];
}

function fp(...parts: (string | number | undefined | null)[]): string {
  return parts.filter(Boolean).join('_').replace(/\s+/g, '_').toLowerCase().slice(0, 255);
}

let persistLock: Promise<void> = Promise.resolve();

async function persistFindings(results: ScanCheckResult[]): Promise<{ created: number; resolved: number }> {
  let release: () => void;
  const wait = new Promise<void>(r => { release = r; });
  const prev = persistLock;
  persistLock = wait;
  await prev;

  try {
    const repo = AppDataSource.getRepository(SecurityFinding);
    let created = 0;
    let resolved = 0;

  const detectedFingerprints = new Set(results.map((r) => r.fingerprint));

  for (const r of results) {
    const existing = await repo.findOne({
      where: [
        { checkFingerprint: r.fingerprint, status: 'open' as any },
        { checkFingerprint: r.fingerprint, status: 'acknowledged' as any },
      ],
    });
    if (existing) {
      detectedFingerprints.add(r.fingerprint);
      continue;
    }

    const finding = repo.create({
      source: 'internal',
      category: r.category,
      severity: r.severity,
      title: r.title,
      description: r.description,
      serverId: r.serverId || undefined,
      nodeId: r.nodeId || undefined,
      userId: r.userId || undefined,
      metadata: r.metadata,
      checkFingerprint: r.fingerprint,
      status: 'open',
    });
    await repo.save(finding);
    created++;

    if (r.severity === 'critical' || r.severity === 'high') {
      dispatchAlert({
        id: finding.id,
        title: finding.title,
        description: finding.description,
        severity: finding.severity as any,
        category: finding.category,
        serverId: finding.serverId || undefined,
        nodeId: finding.nodeId || undefined,
        userId: finding.userId || undefined,
        metadata: finding.metadata || undefined,
        fingerprint: finding.checkFingerprint || undefined,
        detectedAt: finding.detectedAt,
      }).catch(e => console.error('[securityScanner] alert dispatch error:', e));
    }
  }

  if (detectedFingerprints.size > 0) {
    const openFindings = await repo.find({ where: { source: 'internal', status: 'open' as any } });
    for (const f of openFindings) {
      if (f.checkFingerprint && !detectedFingerprints.has(f.checkFingerprint)) {
        f.status = 'resolved';
        f.resolvedAt = new Date();
        await repo.save(f);
        resolved++;
      }
    }
  }

  return { created, resolved };
  } finally {
    release!();
  }
}

async function checkFailedLogins(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const logRepo = AppDataSource.getRepository(require('../models/userLog.entity').UserLog);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const rows = await logRepo
      .createQueryBuilder('log')
      .select('log.userId', 'userId')
      .addSelect('log.ipAddress', 'ipAddress')
      .addSelect('COUNT(*)', 'count')
      .where('log.timestamp >= :since', { since: fiveMinAgo })
      .andWhere('(log.action LIKE :fail OR log.action LIKE :fail2)', {
        fail: '%fail%',
        fail2: '%invalid%',
      })
      .groupBy('log.userId')
      .addGroupBy('log.ipAddress')
      .having('COUNT(*) >= :minCount', { minCount: 3 })
      .getRawMany();

    for (const row of rows) {
      const count = Number(row.count);
      const severity: FindingSeverity = count >= 10 ? 'high' : count >= 5 ? 'medium' : 'low';
      results.push({
        category: 'login_anomaly',
        severity,
        title: `Brute force login attempt detected`,
        description: `${count} failed login attempts from IP ${row.ipAddress} for user #${row.userId} in the last 5 minutes.`,
        userId: Number(row.userId),
        metadata: { attempts: count, ip: row.ipAddress, window: '5 minutes' },
        fingerprint: fp('login_anomaly', 'brute', row.userId, row.ipAddress),
      });
    }
  } catch (e) {
    console.error('[securityScanner] checkFailedLogins error:', e);
  }
  return results;
}

async function checkNewIpLogins(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const logRepo = AppDataSource.getRepository(require('../models/userLog.entity').UserLog);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentLogins = await logRepo
      .createQueryBuilder('log')
      .select('log.userId', 'userId')
      .addSelect('log.ipAddress', 'ipAddress')
      .where('log.timestamp >= :since', { since: oneHourAgo })
      .andWhere('log.action LIKE :login', { login: '%login%' })
      .andWhere('log.ipAddress IS NOT NULL')
      .getRawMany();

    for (const login of recentLogins) {
      const userId = Number(login.userId);
      const ip = String(login.ipAddress);

      const priorCount = await logRepo
        .createQueryBuilder('log')
        .where('log.userId = :uid', { uid: userId })
        .andWhere('log.ipAddress = :ip', { ip })
        .andWhere('log.timestamp < :since', { since: oneHourAgo })
        .getCount();

      if (priorCount === 0) {
        const distinctIps = await logRepo
          .createQueryBuilder('log')
          .select('log.ipAddress')
          .where('log.userId = :uid', { uid: userId })
          .andWhere('log.ipAddress IS NOT NULL')
          .andWhere('log.timestamp < :since', { since: oneHourAgo })
          .groupBy('log.ipAddress')
          .getRawMany();

        if (distinctIps.length >= 3) {
          results.push({
            category: 'login_anomaly',
            severity: 'low',
            title: `Login from new IP address`,
            description: `User #${userId} logged in from IP ${ip}, which has never been seen before for this account.`,
            userId,
            metadata: { ip, priorDistinctIps: distinctIps.length },
            fingerprint: fp('login_anomaly', 'newip', userId, ip),
          });
        }
      }
    }
  } catch (e) {
    console.error('[securityScanner] checkNewIpLogins error:', e);
  }
  return results;
}

async function checkAbandonedServers(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const servers = await cfgRepo
      .createQueryBuilder('sc')
      .select(['sc.uuid', 'sc.name', 'sc.userId'])
      .where('sc.suspended = false')
      .andWhere('sc.hibernated = false')
      .andWhere('sc.lastActivityAt IS NOT NULL')
      .andWhere('sc.lastActivityAt < :cutoff', { cutoff: thirtyDaysAgo })
      .getMany();

    for (const s of servers) {
      results.push({
        category: 'server_posture',
        severity: 'medium',
        title: `Abandoned server: ${s.name || s.uuid}`,
        description: `Server "${s.name || s.uuid}" has had no activity for over 30 days. Consider hibernating or removing it.`,
        serverId: s.uuid,
        userId: s.userId ?? undefined,
        metadata: { serverName: s.name, lastActivityAt: (s as any).lastActivityAt },
        fingerprint: fp('server_posture', 'abandoned', s.uuid),
      });
    }
  } catch (e) {
    console.error('[securityScanner] checkAbandonedServers error:', e);
  }
  return results;
}



async function checkSuspendedRunning(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const servers = await cfgRepo.find({
            where: { suspended: true, desiredPowerState: true },
    });
    for (const s of servers) {
      results.push({
        category: 'server_posture',
        severity: 'medium',
        title: `Suspended server still powered: ${s.name || s.uuid}`,
        description: `Server "${s.name || s.uuid}" is suspended but still has desired power state enabled. It may be consuming resources.`,
        serverId: s.uuid,
        userId: s.userId ?? undefined,
        metadata: { serverName: s.name },
        fingerprint: fp('server_posture', 'suspended_running', s.uuid),
      });
    }
  } catch (e) {
    console.error('[securityScanner] checkSuspendedRunning error:', e);
  }
  return results;
}

async function checkDmcaNotSuspended(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const servers = await cfgRepo.find({
            where: { dmca: true, suspended: false },
    });
    for (const s of servers) {
      results.push({
        category: 'server_posture',
        severity: 'high',
        title: `DMCA-flagged server not suspended: ${s.name || s.uuid}`,
        description: `Server "${s.name || s.uuid}" has a DMCA flag but is not suspended. Review and take action.`,
        serverId: s.uuid,
        userId: s.userId ?? undefined,
        metadata: { serverName: s.name },
        fingerprint: fp('server_posture', 'dmca', s.uuid),
      });
    }
  } catch (e) {
    console.error('[securityScanner] checkDmcaNotSuspended error:', e);
  }
  return results;
}

async function checkSubuserAdminPerms(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const subRepo = AppDataSource.getRepository(require('../models/serverSubuser.entity').ServerSubuser);
    const rows = await subRepo
      .createQueryBuilder('ss')
      .select(['ss.id', 'ss.serverUuid', 'ss.userId', 'ss.permissions'])
      .where("JSON_CONTAINS(ss.permissions, '\"*\"')")
      .orWhere("JSON_CONTAINS(ss.permissions, '\"admin\"')")
      .orWhere("JSON_CONTAINS(ss.permissions, '\"settings\"')")
      .getMany();

    for (const r of rows) {
      results.push({
        category: 'access_control',
        severity: 'high',
        title: `Subuser with elevated permissions`,
        description: `Subuser #${r.userId} on server ${r.serverUuid} has admin/wildcard/settings permissions. Review if this access level is necessary.`,
        serverId: r.serverUuid,
        userId: r.userId,
        metadata: { subuserId: r.id, permissions: r.permissions },
        fingerprint: fp('access_control', 'admin_subuser', r.id),
      });
    }
  } catch (e) {
    console.error('[securityScanner] checkSubuserAdminPerms error:', e);
  }
  return results;
}

async function checkOrphanedSubusers(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const subRepo = AppDataSource.getRepository(require('../models/serverSubuser.entity').ServerSubuser);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await subRepo
      .createQueryBuilder('ss')
      .select(['ss.id', 'ss.serverUuid', 'ss.userId', 'ss.createdAt'])
      .where('ss.accepted = false')
      .andWhere('ss.createdAt < :cutoff', { cutoff: sevenDaysAgo })
      .getMany();

    for (const r of rows) {
      results.push({
        category: 'access_control',
        severity: 'low',
        title: `Orphaned subuser invite`,
        description: `Subuser invite for user #${r.userId} on server ${r.serverUuid} has been pending for over 7 days.`,
        serverId: r.serverUuid,
        userId: r.userId,
        metadata: { subuserId: r.id, createdAt: r.createdAt },
        fingerprint: fp('access_control', 'orphaned', r.id),
      });
    }
  } catch (e) {
    console.error('[securityScanner] checkOrphanedSubusers error:', e);
  }
  return results;
}

async function checkHighCpu(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const socRepo = AppDataSource.getRepository(require('../models/socData.entity').SocData);
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);

    const allCfgs = await cfgRepo.find({ where: { suspended: false } });
    const cpuLimits = new Map<string, number>();
    for (const c of allCfgs) {
      cpuLimits.set(c.uuid, Number(c.cpu) || 100);
    }

    const rows = await socRepo
      .createQueryBuilder('s')
      .select(['s.serverId', 's.metrics', 's.timestamp'])
      .where('s.timestamp >= :since', { since: twoMinAgo })
      .andWhere('s.serverId NOT LIKE :nodePrefix', { nodePrefix: 'node:%' })
      .orderBy('s.serverId', 'ASC')
      .addOrderBy('s.timestamp', 'DESC')
      .getMany();

    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!groups.has(row.serverId)) groups.set(row.serverId, []);
      groups.get(row.serverId)!.push(row);
    }

    for (const [serverId, data] of groups) {
      const last12 = data.slice(0, 12);
      if (last12.length < 6) continue;

      const cpuLimit = cpuLimits.get(serverId) || 100;

      const getUsagePct = (r: any): number => {
        const raw = Number(r.metrics?.cpu_absolute ?? r.metrics?.cpu ?? 0);
        return cpuLimit > 0 ? (raw / cpuLimit) * 100 : raw;
      };

      const highCount = last12.filter((r) => getUsagePct(r) > 80).length;
      const veryHighCount = last12.filter((r) => getUsagePct(r) > 90).length;

      if (veryHighCount >= 10) {
        const avgPct = Math.round(last12.reduce((a, r) => a + getUsagePct(r), 0) / last12.length);
        results.push({
          category: 'resource_anomaly',
          severity: 'critical',
          title: `Potential crypto mining detected: ${serverId}`,
          description: `Server ${serverId} is using ${avgPct}% of its allocated ${cpuLimit}% CPU (${veryHighCount}/${last12.length} readings above 90% of allocation). This pattern is consistent with crypto mining.`,
          serverId,
          metadata: { cpuLimit, avgUsagePct: avgPct, cpuReadings: last12.map((r) => getUsagePct(r)), highCount: veryHighCount, totalReadings: last12.length },
          fingerprint: fp('resource_anomaly', 'cpu_critical', serverId),
        });
      } else if (highCount >= 8) {
        const avgPct = Math.round(last12.reduce((a, r) => a + getUsagePct(r), 0) / last12.length);
        results.push({
          category: 'resource_anomaly',
          severity: 'high',
          title: `Abnormal sustained high CPU: ${serverId}`,
          description: `Server ${serverId} is using ${avgPct}% of its allocated ${cpuLimit}% CPU (${highCount}/${last12.length} readings above 80% of allocation). Investigate for resource abuse.`,
          serverId,
          metadata: { cpuLimit, avgUsagePct: avgPct, cpuReadings: last12.map((r) => getUsagePct(r)), highCount, totalReadings: last12.length },
          fingerprint: fp('resource_anomaly', 'cpu_high', serverId),
        });
      }
    }
  } catch (e) {
    console.error('[securityScanner] checkHighCpu error:', e);
  }
  return results;
}


async function checkUnhealthyNodes(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const unhealthyIds = await getUnhealthyNodeIds();
    if (unhealthyIds.length === 0) return results;

    const nodeRepo = AppDataSource.getRepository(require('../models/node.entity').Node);
    const nodes = await nodeRepo.find({ where: { id: In(unhealthyIds) } });

    for (const n of nodes) {
      results.push({
        category: 'node_security',
        severity: 'critical',
        title: `Unhealthy node: ${n.name}`,
        description: `Node "${n.name}" (ID: ${n.id}) is unhealthy — its last heartbeat is either not OK or too old. Servers on this node may be affected.`,
        nodeId: n.id,
        metadata: { nodeName: n.name },
        fingerprint: fp('node_security', 'unhealthy', n.id),
      });
    }
  } catch (e) {
    console.error('[securityScanner] checkUnhealthyNodes error:', e);
  }
  return results;
}

async function checkIpReputation(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const logRepo = AppDataSource.getRepository(require('../models/userLog.entity').UserLog);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rows = await logRepo
      .createQueryBuilder('log')
      .select('log.ipAddress', 'ip')
      .addSelect('COUNT(*)', 'count')
      .addSelect('log.userId', 'userId')
      .where('log.timestamp >= :since', { since: oneDayAgo })
      .andWhere('log.ipAddress IS NOT NULL')
      .andWhere("(log.action LIKE :fail OR log.action LIKE :invalid)", {
        fail: '%fail%',
        invalid: '%invalid%',
      })
      .groupBy('log.ipAddress')
      .addGroupBy('log.userId')
      .having('COUNT(*) >= :min', { min: 3 })
      .orderBy('COUNT(*)', 'DESC')
      .limit(20)
      .getRawMany();

    const checkedIps = new Set<string>();

    for (const row of rows) {
      const ip = String(row.ip).trim();
      if (!ip || checkedIps.has(ip) || isPrivateIp(ip)) continue;
      checkedIps.add(ip);

      const rep = await scoreIpReputation(ip);
      if (rep.score >= 30 || rep.tags.length > 0) {
        const severity: FindingSeverity = rep.score >= 80 ? 'critical'
          : rep.score >= 60 ? 'high'
          : rep.score >= 30 ? 'medium'
          : 'low';

        results.push({
          category: 'intrusion_detection',
          severity,
          title: `Suspicious IP detected: ${ip} (score: ${rep.score}/100)`,
          description: `IP ${ip} has ${Number(row.count)} failed login attempts and a threat score of ${rep.score}/100. Tags: ${rep.tags.join(', ') || 'none'}. Source: ${rep.source}${rep.country ? `, Country: ${rep.country}` : ''}.`,
          userId: Number(row.userId),
          metadata: { ip, failedAttempts: Number(row.count), reputation: rep },
          fingerprint: fp('threat_intel', 'ip', ip),
        });
      }
    }

    const findingRepo = AppDataSource.getRepository(SecurityFinding);
    const recentFindings = await findingRepo.find({
      where: { status: 'open' as any },
      order: { detectedAt: 'DESC' },
      take: 50,
    });

    for (const finding of recentFindings) {
      const ips = extractIpsFromFinding(finding);
      for (const ip of ips) {
        if (checkedIps.has(ip) || isPrivateIp(ip)) continue;
        checkedIps.add(ip);

        const rep = await scoreIpReputation(ip);
        if (rep.score >= 50) {
          results.push({
            category: 'intrusion_detection',
            severity: 'high',
            title: `Known malicious IP in finding: ${ip}`,
            description: `Finding "${finding.title}" references IP ${ip} which has a threat score of ${rep.score}/100. Source: ${rep.source}.`,
            serverId: finding.serverId || undefined,
            userId: finding.userId || undefined,
            metadata: { ip, relatedFindingId: finding.id, reputation: rep },
            fingerprint: fp('threat_intel', 'finding_ip', ip, finding.id),
          });
        }
      }
    }
  } catch (e) {
    console.error('[securityScanner] checkIpReputation error:', e);
  }
  return results;
}

async function checkCustomRules(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const matches = await evaluateAllRules();
    for (const match of matches) {
      const { rule, matchedEvents } = match;
      const firstEvent = matchedEvents[0] || {};
      results.push({
        category: rule.category as any,
        severity: rule.severity as any,
        title: `[Rule] ${rule.name}`,
        description: `Custom rule "${rule.name}" matched ${matchedEvents.length} event(s). ${rule.description || ''}`,
        serverId: firstEvent.serverId || firstEvent.targetId || undefined,
        userId: firstEvent.userId || undefined,
        metadata: {
          ruleId: rule.id,
          ruleName: rule.name,
          matchCount: matchedEvents.length,
          sampleEvent: firstEvent,
        },
        fingerprint: fp('custom_rule', rule.id),
      });
    }
  } catch (e) {
    console.error('[securityScanner] checkCustomRules error:', e);
  }
  return results;
}

const MINING_PROCESS_NAMES = [
  'xmrig', 'minerd', 'cpuminer', 't-rex', 'phoenixminer',
  'lolminer', 'nbminer', 'gminer', 'ethminer', 'claymore',
  'sgminer', 'cgminer', 'bfgminer', 'xmr-stak', 'cryptonight',
];

async function getWingsServiceForServer(serverId: string): Promise<{ svc: WingsApiService; nodeName: string } | null> {
  try {
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const cfg = await cfgRepo.findOne({ where: { uuid: serverId } });
    if (!cfg || !cfg.nodeId) return null;

    const nodeRepo = AppDataSource.getRepository(Node);
    const node = await nodeRepo.findOne({ where: { id: cfg.nodeId } });
    if (!node) return null;

    const base = (node as any).backendWingsUrl || node.url;
    const svc = new WingsApiService(base, node.token);
    return { svc, nodeName: node.name };
  } catch (e) {
    console.error('[securityScanner] getWingsServiceForServer failed for', serverId, e);
    return null;
  }
}

async function checkWingsProcesses(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const servers = await cfgRepo.find({ where: { suspended: false }, take: 200 });

    for (const s of servers) {
      try {
        const wing = await getWingsServiceForServer(s.uuid);
        if (!wing) continue;

        const resp = await wing.svc.getServerProcesses(s.uuid);
        const data = resp?.data || resp;
        const processes: any[] = data?.processes || [];

        for (const proc of processes) {
          const cmd = (proc.command || '').toLowerCase();
          for (const miner of MINING_PROCESS_NAMES) {
            if (cmd.includes(miner)) {
              results.push({
                category: 'malware',
                severity: 'critical',
                title: `Crypto miner detected: ${miner} on ${s.name || s.uuid}`,
                description: `Process "${proc.command}" matches known crypto miner signature "${miner}" on server "${s.name || s.uuid}". PID: ${proc.pid}, CPU: ${proc.cpu_percent}%.`,
                serverId: s.uuid,
                userId: s.userId ?? undefined,
                metadata: { nodeName: wing.nodeName, process: proc, miner },
                fingerprint: fp('wings', 'miner', s.uuid, miner),
              });
              break;
            }
          }
        }
      } catch (e) {
        console.error('[securityScanner] Wings check failed for', s.uuid, e);
      }
    }
  } catch (e) {
    console.error('[securityScanner] checkWingsProcesses error:', e);
  }
  return results;
}

async function checkWingsPorts(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const servers = await cfgRepo.find({ where: { suspended: false }, take: 200 });

    for (const s of servers) {
      try {
        const wing = await getWingsServiceForServer(s.uuid);
        if (!wing) continue;

        const resp = await wing.svc.getServerConnections(s.uuid);
        const data = resp?.data || resp;
        const ports = data?.network?.ports || {};
        const totalPorts = Object.keys(ports).length;

        if (totalPorts > 50) {
          results.push({
            category: 'configuration',
            severity: 'medium',
            title: `High number of exposed ports: ${s.name || s.uuid}`,
            description: `Server "${s.name || s.uuid}" has ${totalPorts} exposed ports. Review if all are necessary.`,
            serverId: s.uuid,
            userId: s.userId ?? undefined,
            metadata: { nodeName: wing.nodeName, portCount: totalPorts },
            fingerprint: fp('wings', 'ports', s.uuid),
          });
        }
      } catch (e) {
        console.error('[securityScanner] Wings check failed for', s.uuid, e);
      }
    }
  } catch (e) {
    console.error('[securityScanner] checkWingsPorts error:', e);
  }
  return results;
}

async function checkWingsFiles(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const servers = await cfgRepo.find({ where: { suspended: false }, take: 200 });

    for (const s of servers) {
      try {
        const wing = await getWingsServiceForServer(s.uuid);
        if (!wing) continue;

        const resp = await wing.svc.scanServerFiles(s.uuid);
        const data = resp?.data || resp;
        const suspicious: any[] = data?.suspicious_files || [];

        for (const file of suspicious) {
          if (file.severity === 'critical' || file.severity === 'high') {
            results.push({
              category: 'malware',
              severity: file.severity === 'critical' ? 'critical' : 'high',
              title: `Suspicious file detected: ${file.path} on ${s.name || s.uuid}`,
              description: `${file.reason}. File: ${file.path}`,
              serverId: s.uuid,
              userId: s.userId ?? undefined,
              metadata: { nodeName: wing.nodeName, file },
              fingerprint: fp('wings', 'file', s.uuid, file.path),
            });
          }
        }
      } catch (e) {
        console.error('[securityScanner] Wings check failed for', s.uuid, e);
      }
    }
  } catch (e) {
    console.error('[securityScanner] checkWingsFiles error:', e);
  }
  return results;
}

async function checkOutdatedWings(): Promise<ScanCheckResult[]> {
  const results: ScanCheckResult[] = [];
  try {
    const { getAntiAbuseAgentVersions } = require('../handlers/adminHandler');
    const agents = getAntiAbuseAgentVersions() || [];
    if (agents.length === 0) return results;

    const psRepo = AppDataSource.getRepository(require('../models/panelSetting.entity').PanelSetting);
    const versionRow = await psRepo.findOne({ where: { key: 'soc.wings_version' } });
    const latestVersion = versionRow?.value || '';

    for (const agent of agents) {
      if (!agent.active || agent.detectorName !== 'wings' || !agent.version) continue;
      if (!latestVersion || agent.version === latestVersion) continue;

      results.push({
        category: 'node_security',
        severity: 'high',
        title: `Outdated Wings on node: ${agent.nodeName}`,
        description: `Node "${agent.nodeName}" runs Wings ${agent.version}. Latest is ${latestVersion.slice(0, 16)}. Auto-upgrade should trigger within 2 minutes.`,
        metadata: { nodeName: agent.nodeName, agentVersion: agent.version, latestVersion: latestVersion.slice(0, 16) },
        fingerprint: fp('node_security', 'outdated_wings', agent.nodeName),
      });
    }
  } catch (e) {
    console.error('[securityScanner] checkOutdatedWings error:', e);
  }
  return results;
}

const ALL_CHECKS = [
  checkFailedLogins,
  checkNewIpLogins,
  checkAbandonedServers,
  checkSuspendedRunning,
  checkDmcaNotSuspended,
  checkSubuserAdminPerms,
  checkOrphanedSubusers,
  checkHighCpu,
  checkUnhealthyNodes,
  checkOutdatedWings,
  checkIpReputation,
  checkCustomRules,
  checkWingsProcesses,
  checkWingsPorts,
  checkWingsFiles,
];

export async function runSecurityScan(): Promise<ScanOutcome> {
  const startTime = Date.now();
  console.log('[securityScanner] Starting security scan...');

  const checkResults = await Promise.all(ALL_CHECKS.map((check) => check()));
  const allFindings = checkResults.flat();

  console.log(`[securityScanner] ${allFindings.length} raw findings from ${ALL_CHECKS.length} checks`);

  const { created, resolved } = await persistFindings(allFindings);

  const repo = AppDataSource.getRepository(SecurityFinding);
  const totalOpen = await repo.count({ where: { status: 'open' as any } });

  const elapsed = Date.now() - startTime;
  console.log(
    `[securityScanner] Scan complete in ${elapsed}ms: ${created} created, ${resolved} auto-resolved, ${totalOpen} total open`
  );

  return {
    created,
    resolved,
    totalOpen,
    findings: [],
  };
}

export async function submitExternalFinding(data: {
  sourceName?: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  serverId?: string;
  nodeId?: number;
  userId?: number;
  metadata?: Record<string, any>;
}): Promise<SecurityFinding> {
  const repo = AppDataSource.getRepository(SecurityFinding);
  const finding = repo.create({
    source: 'external',
    sourceName: data.sourceName || undefined,
    category: data.category,
    severity: data.severity,
    title: data.title,
    description: data.description,
    serverId: data.serverId || undefined,
    nodeId: data.nodeId || undefined,
    userId: data.userId || undefined,
    metadata: data.metadata || undefined,
    status: 'open',
  });
  await repo.save(finding);
  console.log(`[securityScanner] External finding from "${data.sourceName || 'unknown'}": ${data.title}`);
  return finding;
}
