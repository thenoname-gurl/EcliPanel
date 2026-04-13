const EU_COUNTRIES = new Set([
  'austria', 'at',
  'belgium', 'be',
  'bulgaria', 'bg',
  'croatia', 'hr',
  'cyprus', 'cy',
  'czech republic', 'cz', 'czechia',
  'denmark', 'dk',
  'estonia', 'ee',
  'finland', 'fi',
  'france', 'fr',
  'germany', 'de',
  'greece', 'gr',
  'hungary', 'hu',
  'ireland', 'ie',
  'italy', 'it',
  'latvia', 'lv',
  'lithuania', 'lt',
  'luxembourg', 'lu',
  'malta', 'mt',
  'netherlands', 'nl',
  'poland', 'pl',
  'portugal', 'pt',
  'romania', 'ro',
  'slovakia', 'sk',
  'slovenia', 'si',
  'spain', 'es',
  'sweden', 'se',
]);

export const EU_COUNTRY_CODES = [
  'at','be','bg','hr','cy','cz','dk','ee','fi','fr','de','gr','hu','ie','it','lv','lt','lu','mt','nl','pl','pt','ro','sk','si','es','se',
];

export async function getGeoBlockRulesWithDefaults(): Promise<Record<string, number>> {
  const result = { ...(await getGeoBlockRules()) };
  if ((process.env.EU_ID_DISABLED || '').toLowerCase() !== 'true') {
    return result;
  }

  for (const code of EU_COUNTRY_CODES) {
    const key = code.toLowerCase();
    if (result[key] === undefined || result[key] < 1) {
      result[key] = 1;
    }
  }

  return result;
}

import { AppDataSource } from '../config/typeorm';
import { PanelSetting } from '../models/panelSetting.entity';

export function isEUCountry(country?: string | null): boolean {
  if (!country) return false;
  const value = country.toString().trim().toLowerCase();
  return EU_COUNTRIES.has(value);
}

export function isEUIdVerificationDisabledForCountry(country?: string | null): boolean {
  if ((process.env.EU_ID_DISABLED || '').toLowerCase() !== 'true') return false;
  return isEUCountry(country);
}

export async function getGeoBlockRules(): Promise<Record<string, number>> {
  try {
    const repo = AppDataSource.getRepository(PanelSetting);
    const setting = await repo.findOneBy({ key: 'geoBlockCountries' });
    if (!setting || !setting.value) return {};
    const raw = setting.value;
    const result: Record<string, number> = {};
    const entries = raw.split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
    for (const e of entries) {
      const parts = e.split(/[:=]/).map((y) => y.trim());
      if (parts.length !== 2) continue;
      const country = parts[0].toLowerCase();
      const level = Number(parts[1]);
      if (!country) continue;
      if (!Number.isNaN(level) && level >= 0 && level <= 5) {
        result[country] = level;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getGeoBlockLevelFromRules(country: string | null | undefined, rules: Record<string, number>): number {
  if (!country) return 0;
  const value = country.toString().trim().toLowerCase();
  if (!value) return 0;
  if (rules[value] !== undefined) return rules[value];

  const normalized = value.slice(0, 2);
  if (rules[normalized] !== undefined) return rules[normalized];

  const baseLevel = isEUIdVerificationDisabledForCountry(value) ? 1 : 0;
  if (baseLevel > 0) {
    return Math.max(baseLevel, rules[normalized] || rules[value] || 1);
  }
  return 0;
}

export async function getGeoBlockLevel(country?: string | null, rules?: Record<string, number>): Promise<number> {
  if (!country) return 0;
  if (rules) {
    return getGeoBlockLevelFromRules(country, rules);
  }
  const loaded = await getGeoBlockRules();
  return getGeoBlockLevelFromRules(country, loaded);
}

export async function canRegister(country?: string | null): Promise<boolean> {
  return (await getGeoBlockLevel(country)) < 5;
}

export async function canPerformIdVerification(country?: string | null): Promise<boolean> {
  return (await getGeoBlockLevel(country)) < 1;
}

export async function canUseFreeServices(country?: string | null): Promise<boolean> {
  return (await getGeoBlockLevel(country)) < 2;
}

export async function canUseEducationalServices(country?: string | null): Promise<boolean> {
  return (await getGeoBlockLevel(country)) < 3;
}

export async function canUsePaidServices(country?: string | null): Promise<boolean> {
  return (await getGeoBlockLevel(country)) < 4;
}

export async function isSubuserOnly(country?: string | null): Promise<boolean> {
  return (await getGeoBlockLevel(country)) === 4;
}
