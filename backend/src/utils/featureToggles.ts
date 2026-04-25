import { AppDataSource } from '../config/typeorm';
import { PanelSetting } from '../models/panelSetting.entity';

export const DEFAULT_FEATURE_TOGGLES: Record<string, boolean> = {
  registration: true,
  tempEmailFilter: true,
  captcha: true,
  captchaInvisible: false,
  billing: true,
  ai: true,
  dns: true,
  ticketing: true,
  applications: true,
  oauth: true,
};

export async function getPanelFeatureToggles(): Promise<Record<string, boolean>> {
  const repo = AppDataSource.getRepository(PanelSetting);
  const row = await repo.findOneBy({ key: 'panelFeatureToggles' });
  const result = { ...DEFAULT_FEATURE_TOGGLES };

  if (!row || !row.value) return result;

  let parsed: any = undefined;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    parsed = undefined;
  }

  if (!parsed || typeof parsed !== 'object') return result;

  for (const [key, rawValue] of Object.entries(parsed)) {
    if (rawValue === true || rawValue === 'true' || rawValue === 1 || rawValue === '1') {
      result[key] = true;
    } else if (rawValue === false || rawValue === 'false' || rawValue === 0 || rawValue === '0') {
      result[key] = false;
    } else {
      result[key] = true;
    }
  }

  return result;
}

export async function isFeatureEnabled(feature: string): Promise<boolean> {
  if (!feature || typeof feature !== 'string') return true;
  const toggles = await getPanelFeatureToggles();
  if (feature in toggles) return Boolean(toggles[feature]);
  return true;
}
