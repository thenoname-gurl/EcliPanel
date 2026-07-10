import { httpRequest } from '../utils/http';
import { redisGet, redisSet } from '../config/redis';
import { AppDataSource } from '../config/typeorm';
import { PanelSetting } from '../models/panelSetting.entity';

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
  } catch {
    return {};
  }
}

function getSetting(key: string, envFallback: string): string {
  if (_settingsCache && _settingsCache[key] !== undefined && _settingsCache[key] !== '') {
    return _settingsCache[key];
  }
  return process.env[key.toUpperCase().replace(/\./g, '_')] || envFallback;
}

export async function refreshSocSettings(): Promise<void> {
  _settingsCache = null;
  await getSocSettings();
}

const CACHE_TTL_CLEAN = 86_400;
const CACHE_TTL_SUSPICIOUS = 14_400;
const CACHE_TTL_MALICIOUS = 3_600;

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redisGet(key);
    if (raw) return JSON.parse(typeof raw === 'string' ? raw : String(raw)) as T;
  } catch {}
  return null;
}

async function cacheSet(key: string, data: any, ttlSeconds: number): Promise<void> {
  try {
    await redisSet(key, JSON.stringify(data), ttlSeconds);
  } catch {}
}

function cacheKey(ip: string): string {
  return `threat:intel:ip:${ip.trim().toLowerCase()}`;
}

export interface IpReputation {
  ip: string;
  score: number;
  confidence: number;
  tags: string[];
  country?: string;
  isp?: string;
  domain?: string;
  lastReportedAt?: string;
  totalReports?: number;
  source: 'abuseipdb' | 'blocklist' | 'internal' | 'unknown';
}

export interface ImageReputation {
  image: string;
  risk: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  issues: string[];
}

function getBlocklist(panelKey: string, envKey: string): Set<string> {
  const raw = getSetting(panelKey, process.env[envKey] || '');
  return new Set(
    raw.split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
  );
}

async function checkAbuseIPDB(ip: string): Promise<Partial<IpReputation> | null> {
  const apiKey = getSetting('soc.abuseipdb_key', process.env.SOC_ABUSEIPDB_API_KEY || '');
  if (!apiKey) return null;

  try {
    const resp = await httpRequest(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
      {
        method: 'GET',
        headers: {
          'Key': apiKey,
          'Accept': 'application/json',
        },
        timeoutMs: 5000,
      }
    );

    const data = typeof resp === 'string' ? JSON.parse(resp) : resp;
    if (!data?.data) return null;

    const d = data.data;
    return {
      ip,
      score: Math.min(100, (d.abuseConfidenceScore || 0)),
      confidence: Math.min(100, (d.abuseConfidenceScore || 0)),
      tags: [
        d.usageType ? `usage:${d.usageType.toLowerCase()}` : null,
      ].filter(Boolean) as string[],
      country: d.countryCode || undefined,
      isp: d.isp || undefined,
      domain: d.domain || undefined,
      lastReportedAt: d.lastReportedAt || undefined,
      totalReports: d.totalReports || 0,
      source: 'abuseipdb' as const,
    };
  } catch {
    return null;
  }
}

function checkBlocklists(ip: string): Partial<IpReputation> | null {
  const ipBlocklist = getBlocklist('soc.threat_ip_list', 'SOC_THREAT_IP_LIST');
  const cidrBlocklist = getBlocklist('soc.threat_ip_cidr_list', 'SOC_THREAT_IP_CIDR_LIST');

  const normalized = ip.trim().toLowerCase();

  if (ipBlocklist.has(normalized)) {
    return {
      ip,
      score: 100,
      confidence: 100,
      tags: ['blocklisted'],
      source: 'blocklist',
    };
  }

  for (const cidr of cidrBlocklist) {
    if (cidr.includes('/')) {
      const [prefix, bitsStr] = cidr.split('/');
      const bits = parseInt(bitsStr, 10);
      if (isIpInCidr(normalized, prefix, bits)) {
        return {
          ip,
          score: 90,
          confidence: 80,
          tags: ['blocklisted_cidr'],
          source: 'blocklist',
        };
      }
    }
  }

  return null;
}

function isIpInCidr(ip: string, cidrIp: string, bits: number): boolean {
  try {
    if (bits < 0 || bits > 32) return false;
    const ipParts = ip.split('.').map(Number);
    const cidrParts = cidrIp.split('.').map(Number);
    if (ipParts.length !== 4 || cidrParts.length !== 4) return false;

    const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const cidrInt = (cidrParts[0] << 24) | (cidrParts[1] << 16) | (cidrParts[2] << 8) | cidrParts[3];
    const mask = ~((1 << (32 - bits)) - 1);

    return (ipInt & mask) === (cidrInt & mask);
  } catch {
    return false;
  }
}

export async function scoreIpReputation(ip: string): Promise<IpReputation> {
  if (isPrivateIp(ip)) {
    return {
      ip,
      score: 0,
      confidence: 100,
      tags: ['private_ip'],
      source: 'internal',
    };
  }

  const key = cacheKey(ip);
  const cached = await cacheGet<IpReputation>(key);
  if (cached) return cached;

  let result: IpReputation;

  const blocklistResult = checkBlocklists(ip);
  if (blocklistResult) {
    result = {
      ip,
      score: 0,
      confidence: 0,
      tags: [],
      source: 'unknown' as const,
      ...blocklistResult,
    } as IpReputation;
    await cacheSet(key, result, CACHE_TTL_MALICIOUS);
    return result;
  }

  const abuseResult = await checkAbuseIPDB(ip);
  if (abuseResult) {
    result = {
      ip,
      score: 0,
      confidence: 0,
      tags: [],
      source: 'unknown' as const,
      ...abuseResult,
    } as IpReputation;
    const ttl = result.score >= 70 ? CACHE_TTL_MALICIOUS
      : result.score >= 30 ? CACHE_TTL_SUSPICIOUS
      : CACHE_TTL_CLEAN;
    await cacheSet(key, result, ttl);
    return result;
  }

  result = { ip, score: 0, confidence: 0, tags: [], source: 'unknown' };
  await cacheSet(key, result, CACHE_TTL_CLEAN);
  return result;
}

export async function isKnownMalicious(ip: string): Promise<boolean> {
  const rep = await scoreIpReputation(ip);
  return rep.score >= 70;
}

export function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;
  return false;
}

export function checkImageReputation(image: string): ImageReputation {
  const issues: string[] = [];
  let risk: ImageReputation['risk'] = 'low';
  const lower = image.toLowerCase();

  const imageBlocklist = getBlocklist('soc.threat_image_list', 'SOC_THREAT_IMAGE_LIST');

  const defaultSuspicious = [
    { pattern: 'alpine:3.', reason: 'Alpine image — check for musl CVE compatibility', risk: 'low' as const },
    { pattern: 'debian:8', reason: 'Debian 8 (Jessie) is EOL since 2020', risk: 'high' as const },
    { pattern: 'debian:9', reason: 'Debian 9 (Stretch) is EOL since 2022', risk: 'high' as const },
    { pattern: 'debian:10', reason: 'Debian 10 (Buster) is EOL since 2024', risk: 'medium' as const },
    { pattern: 'ubuntu:14', reason: 'Ubuntu 14.04 is EOL since 2019', risk: 'critical' as const },
    { pattern: 'ubuntu:16', reason: 'Ubuntu 16.04 is EOL since 2021', risk: 'critical' as const },
    { pattern: 'ubuntu:18', reason: 'Ubuntu 18.04 is EOL since 2023', risk: 'high' as const },
    { pattern: 'centos:6', reason: 'CentOS 6 is EOL since 2020', risk: 'critical' as const },
    { pattern: 'centos:7', reason: 'CentOS 7 is EOL since 2024', risk: 'high' as const },
    { pattern: 'centos:8', reason: 'CentOS 8 is EOL since 2021', risk: 'critical' as const },
    { pattern: ':master', reason: 'Using development branch tag', risk: 'medium' as const },
    { pattern: ':dev', reason: 'Using development branch tag', risk: 'medium' as const },
    { pattern: ':nightly', reason: 'Using nightly/unstable tag', risk: 'medium' as const },
  ];

  for (const blocked of imageBlocklist) {
    if (lower.includes(blocked)) {
      issues.push(`Image matches blocklist pattern: ${blocked}`);
      risk = 'critical';
    }
  }

  for (const sp of defaultSuspicious) {
    if (lower.includes(sp.pattern)) {
      issues.push(sp.reason);
      if (sp.risk === 'critical' || (sp.risk === 'high' && risk !== 'critical')) {
        risk = sp.risk;
      } else if (sp.risk === 'medium' && risk === 'low') {
        risk = 'medium';
      }
    }
  }

  if (issues.length === 0) {
    issues.push('No known issues detected');
  }

  return { image, risk, issues };
}

export function extractIpsFromFinding(finding: { metadata?: Record<string, any> }): string[] {
  const ips = new Set<string>();
  const meta = finding.metadata || {};

  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === 'string' && isIpLike(value)) {
      ips.add(value);
    }
    if (typeof value === 'object' && value !== null) {
      for (const v of Object.values(value)) {
        if (typeof v === 'string' && isIpLike(v)) {
          ips.add(v);
        }
      }
    }
  }

  return [...ips];
}

function isIpLike(s: string): boolean {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) {
    const parts = s.split('.').map(Number);
    return parts.every(p => p >= 0 && p <= 255);
  }
  return false;
}