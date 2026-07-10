import { AppDataSource } from '../config/typeorm';
import { DetectionRule } from '../models/detectionRule.entity';
import type { RuleCondition, RuleConditionGroup, RuleFrequency } from '../models/detectionRule.entity';

function getFieldValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function evaluateCondition(condition: RuleCondition, event: any): boolean {
  const value = getFieldValue(event, condition.field);
  const expected = condition.value;

  switch (condition.operator) {
    case 'exists':
      return value !== undefined && value !== null;
    case 'not_exists':
      return value === undefined || value === null;
    case 'equals':
      return String(value).toLowerCase() === String(expected).toLowerCase();
    case 'not_equals':
      return String(value).toLowerCase() !== String(expected).toLowerCase();
    case 'contains':
      return String(value).toLowerCase().includes(String(expected).toLowerCase());
    case 'not_contains':
      return !String(value).toLowerCase().includes(String(expected).toLowerCase());
    case 'regex':
      try { return new RegExp(String(expected), 'i').test(String(value)); }
      catch { return false; }
    case 'not_regex':
      try { return !new RegExp(String(expected), 'i').test(String(value)); }
      catch { return true; }
    case 'gt':
      return Number(value) > Number(expected);
    case 'gte':
      return Number(value) >= Number(expected);
    case 'lt':
      return Number(value) < Number(expected);
    case 'lte':
      return Number(value) <= Number(expected);
    default:
      return false;
  }
}

function evaluateGroup(group: RuleConditionGroup, event: any): boolean {
  const results = group.rules.map(r => {
    if ('operator' in r && 'rules' in r) {
      return evaluateGroup(r as RuleConditionGroup, event);
    }
    return evaluateCondition(r as RuleCondition, event);
  });

  if (group.operator === 'and') return results.every(Boolean);
  return results.some(Boolean);
}

function eventMatchesRule(rule: DetectionRule, event: any): boolean {
  return evaluateGroup(rule.conditions, event);
}

interface MatchWindow {
  timestamps: number[];
  values: Map<string, number>;
}

const frequencyWindows = new Map<number, MatchWindow>();

function checkFrequency(rule: DetectionRule, eventTimestamp: number, correlationKey?: string): boolean {
  if (!rule.frequency) return true;

  let window = frequencyWindows.get(rule.id);
  const now = Date.now();
  const windowMs = rule.frequency.windowSeconds * 1000;

  if (!window || (now - (window.timestamps[0] || 0) > windowMs)) {
    window = { timestamps: [], values: new Map() };
    frequencyWindows.set(rule.id, window);
  }

  window.timestamps = window.timestamps.filter(ts => now - ts < windowMs);
  window.timestamps.push(eventTimestamp);

  if (rule.correlation && correlationKey) {
    const count = (window.values.get(correlationKey) || 0) + 1;
    window.values.set(correlationKey, count);
    return count >= rule.correlation.minSources;
  }

  return window.timestamps.length >= rule.frequency.count;
}

async function querySource(source: string, rule: DetectionRule): Promise<any[]> {
  switch (source) {
    case 'user_log': {
      const repo = AppDataSource.getRepository(require('../models/userLog.entity').UserLog);
      const qb = repo.createQueryBuilder('log').orderBy('log.timestamp', 'DESC').take(500);
      if (rule.scope === 'user' && rule.scopeId) {
        qb.andWhere('log.userId = :uid', { uid: Number(rule.scopeId) });
      } else if (rule.scope === 'server' && rule.scopeId) {
        qb.andWhere('log.targetId = :sid', { sid: rule.scopeId });
      }
      return qb.getMany();
    }
    case 'soc_data': {
      const repo = AppDataSource.getRepository(require('../models/socData.entity').SocData);
      const qb = repo.createQueryBuilder('s').orderBy('s.timestamp', 'DESC').take(200);
      if (rule.scope === 'server' && rule.scopeId) {
        qb.andWhere('s.serverId = :sid', { sid: rule.scopeId });
      }
      return qb.getMany();
    }
    case 'server_config': {
      const repo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
      if (rule.scope === 'server' && rule.scopeId) {
        return repo.find({ where: { uuid: rule.scopeId } });
      }
      if (rule.scope === 'user' && rule.scopeId) {
        return repo.find({ where: { userId: Number(rule.scopeId) }, take: 200 });
      }
      return repo.find({ take: 500 });
    }
    case 'wings_processes':
    case 'wings_connections':
      return [];
    default:
      return [];
  }
}

interface RuleMatch {
  rule: DetectionRule;
  matchedEvents: any[];
  correlationKey?: string;
}

export async function evaluateRule(rule: DetectionRule): Promise<RuleMatch | null> {
  if (!rule.enabled) return null;

  const matchedEvents: any[] = [];
  const correlationValues = new Map<string, number>();

  for (const source of rule.sources) {
    const events = await querySource(source, rule);

    for (const event of events) {
      if (eventMatchesRule(rule, event)) {
        const ts = new Date(event.timestamp || Date.now()).getTime();

        let corrKey: string | undefined;
        if (rule.correlation) {
          corrKey = String(getFieldValue(event, rule.correlation.field) || 'unknown');
        }

        if (checkFrequency(rule, ts, corrKey)) {
          matchedEvents.push(event);
        }
      }
    }
  }

  if (matchedEvents.length === 0) return null;

  return { rule, matchedEvents };
}

export async function evaluateAllRules(): Promise<RuleMatch[]> {
  if (frequencyWindows.size > 1000) frequencyWindows.clear();
  const repo = AppDataSource.getRepository(DetectionRule);
  const rules = await repo.find({ where: { enabled: true } });
  const matches: RuleMatch[] = [];

  for (const rule of rules) {
    try {
      const match = await evaluateRule(rule);
      if (match) {
        matches.push(match);

        rule.triggerCount += 1;
        rule.lastTriggeredAt = new Date();
        await repo.save(rule);
      }
    } catch (e) {
      console.error(`[ruleEngine] Rule "${rule.name}" evaluation failed:`, e);
    }
  }

  return matches;
}

export function testRule(rule: Partial<DetectionRule>, sampleEvent: any): boolean {
  if (!rule.conditions) return false;
  return evaluateGroup(rule.conditions, sampleEvent);
}