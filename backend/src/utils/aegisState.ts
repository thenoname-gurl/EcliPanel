import { AppDataSource } from '../config/typeorm';
import { AegisAttack } from '../models/aegisAttack.entity';
import type { Node } from '../models/node.entity';
import type { BaseHandlerContext } from '../types';
import { hasPermissionSync } from '../middleware/authorize';

function safeNum(value: any): number {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

/******************\
*                  *
* Welcome to hell! *
*                  *
\******************/

export const latestMetrics = new Map<number, { nodeName: string; receivedAt: number; data: any }>();
export const MAX_AGE_MS = 10 * 60 * 1000;

export interface Sample {
  ts: number;
  rps: number;
  bps: number;
  dropRps: number;
  dropBps: number;
  methods: Record<string, number>;
}
export const HISTORY = new Map<number, Sample[]>();
export const HISTORY_MAX = 8640;

export interface AttackEvent {
  nodeId: number;
  startTs: number;
  endTs: number | null;
  durationSec: number;
  method: string;
  peakDropPps: number;
  peakDropBps: number;
  avgDropPps: number;
  avgDropBps: number;
  peakNetPps: number;
  samples: number;
  type?: string;
  missed?: number;
}

export function mergeClosedAttack(nodeId: number, type: string): AttackEvent | null {
  const list = ATTACKS.get(nodeId) ?? [];
  const idx = list.findIndex(
    (a) =>
      a.type === type &&
      a.endTs != null &&
      Date.now() - a.endTs < ATTACK_MERGE_GAP_MS,
  );
  if (idx < 0) return null;
  const [ev] = list.splice(idx, 1);
  ATTACKS.set(nodeId, list);
  return ev;
}
export function closeAttack(key: string) {
  const open = OPEN_ATTACK.get(key);
  if (!open) return;
  open.endTs = Date.now();
  open.durationSec = Math.round((open.endTs - open.startTs) / 1000);
  const list = ATTACKS.get(open.nodeId) ?? [];
  list.unshift(open);
  if (list.length > ATTACKS_MAX) list.pop();
  ATTACKS.set(open.nodeId, list);
  OPEN_ATTACK.delete(key);
  void AppDataSource.getRepository(AegisAttack)
    .insert({
      nodeId: open.nodeId,
      type: open.type ?? '',
      method: open.method,
      startTs: open.startTs,
      endTs: open.endTs,
      durationSec: open.durationSec,
      peakDropPps: open.peakDropPps,
      peakDropBps: open.peakDropBps,
      avgDropPps: open.avgDropPps,
      avgDropBps: open.avgDropBps,
      peakNetPps: open.peakNetPps,
      samples: open.samples,
    })
    .then(() =>
      AppDataSource.getRepository(AegisAttack)
        .createQueryBuilder()
        .delete()
        .where('`startTs` < :cut', { cut: Date.now() - 30 * 86400_000 })
        .execute(),
    )
    .catch((e) => console.error("[aegis] persist attack failed:", e));
}

export const ATTACKS = new Map<number, AttackEvent[]>();
export const OPEN_ATTACK = new Map<string, AttackEvent>();
export const ATTACKS_MAX = 200;

export const ATTACK_THRESHOLD_PPS = 1000;
export const ATTACK_COOLDOWN_SAMPLES = 2;
export const ATTACK_MERGE_GAP_MS = 120_000;

export const DAEMON_METHOD_LABELS: Record<string, string> = {
  syn_flood: 'SYN flood',
  udp_flood: 'UDP flood',
  icmp_flood: 'ICMP flood',
  tcp_conn_exhaustion: 'TCP connection exhaustion',
  bandwidth_saturation: 'Bandwidth saturation',
  http_flood: 'HTTP flood',
  egress_udp_flood: 'Egress UDP flood',
  egress_icmp_flood: 'Egress ICMP flood',
  egress_bandwidth: 'Egress bandwidth',
  dns_amplification: 'DNS amplification',
  ntp_amplification: 'NTP amplification',
  cldap_amplification: 'CLDAP amplification',
  ssdp_amplification: 'SSDP amplification',
  chargen_amplification: 'Chargen amplification',
  qotd_amplification: 'QOTD amplification',
  snmp_amplification: 'SNMP amplification',
  memcached_amplification: 'Memcached amplification',
  mssql_amplification: 'MSSQL amplification',
  ws_discovery_amplification: 'WS-Discovery amplification',
  coap_amplification: 'CoAP amplification',
  ipsec_nat_t_amplification: 'IPsec NAT-T amplification',
};

export function daemonMethodLabel(type: string): string {
  return (
    DAEMON_METHOD_LABELS[type] ??
    type.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export const METHOD_KEYS = [
  'drop_tcp_syn',
  'drop_udp_pps',
  'drop_icmp_pps',
  'drop_global_pps',
  'drop_mc_invalid',
  'drop_ssh_invalid',
  'drop_blocklist',
  'drop_other',
] as const;

export const METHOD_LABELS: Record<string, string> = {
  drop_tcp_syn: 'SYN flood',
  drop_udp_pps: 'UDP flood',
  drop_icmp_pps: 'ICMP flood',
  drop_global_pps: 'PPS flood',
  drop_mc_invalid: 'Minecraft invalid',
  drop_ssh_invalid: 'SSH invalid',
  drop_blocklist: 'Blocklist',
  drop_other: 'Other',
};

export function dominantMethod(prev: any, cur: any): { key: string; label: string } {
  let bestKey = 'drop_other';
  let bestDelta = -1;
  for (const k of METHOD_KEYS) {
    const a = safeNum(prev?.packets?.[k]);
    const b = safeNum(cur?.packets?.[k]);
    const delta = Math.max(0, b - a);
    if (delta > bestDelta) {
      bestDelta = delta;
      bestKey = k;
    }
  }
  return { key: bestKey, label: METHOD_LABELS[bestKey] ?? bestKey };
}

export function processPush(nodeId: number, data: any) {
  const now = Date.now();
  const prev = latestMetrics.get(nodeId)?.data;

  const methods: Record<string, number> = {};
  let dominant = 'drop_other';
  let bestDelta = -1;
  for (const k of METHOD_KEYS) {
    const a = safeNum(prev?.packets?.[k]);
    const b = safeNum(data?.packets?.[k]);
    const delta = Math.max(0, b - a);
    methods[k] = delta;
    if (delta > bestDelta) {
      bestDelta = delta;
      dominant = k;
    }
  }

  const sample: Sample = {
    ts: now,
    rps: safeNum(data?.traffic?.rps),
    bps: safeNum(data?.traffic?.bps),
    dropRps: safeNum(data?.traffic?.drop_rps),
    dropBps: safeNum(data?.traffic?.drop_bps),
    methods,
  };

  const hist = HISTORY.get(nodeId) ?? [];
  hist.push(sample);
  if (hist.length > HISTORY_MAX) hist.shift();
  HISTORY.set(nodeId, hist);

  const daemonAttacks = Array.isArray(data?.attacks) ? data.attacks : [];

  if (Array.isArray(data?.attacks)) {
    const reported = new Set<string>();
    for (const at of daemonAttacks) {
      const type = typeof at?.type === 'string' ? at.type : '';
      if (!type) continue;
      const key = `${nodeId}:${type}`;
      reported.add(key);
      if (at.active !== 1) {
        closeAttack(key);
        continue;
      }

      const isBps = type === 'bandwidth_saturation';
      const ratePps = Math.max(0, safeNum(at.rate));
      const rateBps = Math.max(0, safeNum(at.rate_bps));
      let open = OPEN_ATTACK.get(key);
      if (open === undefined) {
        const merged = mergeClosedAttack(nodeId, type);
        if (merged !== null) {
          open = merged;
        } else {
          open = {
            nodeId,
            startTs: now,
            endTs: null,
            durationSec: 0,
            method: daemonMethodLabel(type),
            type,
            peakDropPps: 0,
            peakDropBps: 0,
            avgDropPps: 0,
            avgDropBps: 0,
            peakNetPps: sample.rps,
            samples: 0,
          };
        }
        OPEN_ATTACK.set(key, open);
      }
      open.samples += 1;
      open.durationSec = Math.round((now - open.startTs) / 1000);
      open.peakNetPps = Math.max(open.peakNetPps, sample.rps);
      if (isBps) {
        open.peakDropBps = Math.max(open.peakDropBps, rateBps);
        open.avgDropBps += (rateBps - open.avgDropBps) / open.samples;
      } else {
        open.peakDropPps = Math.max(open.peakDropPps, ratePps);
        open.avgDropPps += (ratePps - open.avgDropPps) / open.samples;
        if (rateBps > 0) {
          open.peakDropBps = Math.max(open.peakDropBps, rateBps);
          open.avgDropBps += (rateBps - open.avgDropBps) / open.samples;
        }
      }
    }

    for (const [key, open] of [...OPEN_ATTACK]) {
      if (open.nodeId !== nodeId || reported.has(key)) continue;
      open.missed = (open.missed ?? 0) + 1;
      if (open.missed >= ATTACK_COOLDOWN_SAMPLES) closeAttack(key);
    }
    return;
  }

  const open = OPEN_ATTACK.get(`${nodeId}:legacy`);
  const underAttack = sample.dropRps >= ATTACK_THRESHOLD_PPS;

  if (underAttack) {
    if (!open) {
      OPEN_ATTACK.set(`${nodeId}:legacy`, {
        nodeId,
        startTs: now,
        endTs: null,
        durationSec: 0,
        method: METHOD_LABELS[dominant] ?? dominant,
        peakDropPps: sample.dropRps,
        peakDropBps: sample.dropBps,
        avgDropPps: sample.dropRps,
        avgDropBps: sample.dropBps,
        peakNetPps: sample.rps,
        samples: 1,
      });
    } else {
      open.peakDropPps = Math.max(open.peakDropPps, sample.dropRps);
      open.peakDropBps = Math.max(open.peakDropBps, sample.dropBps);
      open.peakNetPps = Math.max(open.peakNetPps, sample.rps);
      open.samples += 1;
      open.durationSec = Math.round((now - open.startTs) / 1000);
      open.avgDropPps =
        open.avgDropPps + (sample.dropRps - open.avgDropPps) / open.samples;
      open.avgDropBps =
        open.avgDropBps + (sample.dropBps - open.avgDropBps) / open.samples;
    }
  } else if (open) {
    closeAttack(`${nodeId}:legacy`);
  }
}

export function adminOk(ctx: BaseHandlerContext): boolean {
  const ctxAny = ctx as unknown as Record<string, unknown>;
  const apiKey = ctxAny.apiKey as { type: string } | undefined;
  const user = ctxAny.user as { id: number } | undefined;
  if (apiKey?.type !== 'admin' && !user) return false;
  if (!apiKey && !hasPermissionSync(ctx, 'nodes:read')) return false;
  return true;
}