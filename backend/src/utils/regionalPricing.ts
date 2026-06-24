import { AppDataSource } from '../config/typeorm';
import { RegionalPrice } from '../models/regionalPrice.entity';
import { Plan } from '../models/plan.entity';
import { User } from '../models/user.entity';
import { PanelSetting } from '../models/panelSetting.entity';

export async function getEffectivePrice(
  plan: Plan,
  user: User
): Promise<{ basePrice: number; regionalPrice: number | null; countryCode: string | null }> {
  const effectiveCountry = user.countryOverride || user.billingCountry || null;

  if (!effectiveCountry) {
    return { basePrice: plan.price, regionalPrice: null, countryCode: null };
  }

  const code = effectiveCountry.toUpperCase();
  const repo = AppDataSource.getRepository(RegionalPrice);
  const regional = await repo.findOneBy({ planId: plan.id, countryCode: code });

  if (regional) {
    return { basePrice: regional.price, regionalPrice: regional.price, countryCode: code };
  }

  return { basePrice: plan.price, regionalPrice: null, countryCode: code };
}

export async function calculateTax(
  amount: number,
  countryCode: string | null | undefined
): Promise<{ taxRate: number; taxAmount: number }> {
  if (!countryCode) return { taxRate: 0, taxAmount: 0 };

  const settingRepo = AppDataSource.getRepository(PanelSetting);
  const rawRules = await settingRepo.findOneBy({ key: 'billingTaxRules' });

  const rules = parseTaxRules(rawRules?.value);
  const code = countryCode.toUpperCase();

  const euCodes = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV',
    'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  ]);

  let rate = 0;
  if (rules[code] !== undefined) rate = rules[code];
  else if (euCodes.has(code) && rules.EU !== undefined) rate = rules.EU;
  else if (rules['*'] !== undefined) rate = rules['*'];
  else if (rules.DEFAULT !== undefined) rate = rules.DEFAULT;

  rate = Math.max(0, Math.min(100, Number(rate) || 0));
  const tax = Number((amount * (rate / 100)).toFixed(2));

  return { taxRate: rate, taxAmount: tax };
}

function parseTaxRules(raw?: string | null): Record<string, number> {
  if (!raw) return {};
  const parsed: Record<string, number> = {};
  const entries = String(raw)
    .split(/[\n,;]+/)
    .map(part => part.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const [lhs, rhs] = entry.split(/[:=]/).map(v => v?.trim());
    if (!lhs || rhs === undefined) continue;
    const rate = Number(rhs);
    if (!Number.isFinite(rate)) continue;
    parsed[lhs.toUpperCase()] = Math.max(0, Math.min(100, rate));
  }

  return parsed;
}