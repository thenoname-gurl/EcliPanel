import { AppDataSource } from '../config/typeorm';
import { PanelSetting } from '../models/panelSetting.entity';

let _settingsCache: Record<string, string> | null = null;
let _settingsCacheTs = 0;

export async function getSocSettings(): Promise<Record<string, string>> {
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

export function getSocSetting(key: string, envFallback: string): string {
  if (_settingsCache && _settingsCache[key] !== undefined && _settingsCache[key] !== '') {
    return _settingsCache[key];
  }
  return process.env[key.toUpperCase().replace(/\./g, '_')] || envFallback;
}

export async function refreshSocSettings(): Promise<void> {
  _settingsCache = null;
  await getSocSettings();
}