import { AppDataSource } from '../config/typeorm';
import { PanelSetting } from '../models/panelSetting.entity';

export const CPU_BOOST_STARTUP_ENABLED = 'cpu_boost.startup_enabled';
export const CPU_BOOST_STARTUP_TIMEOUT = 'cpu_boost.startup_timeout';

export const CPU_BOOST_RUNTIME_ENABLED = 'cpu_boost.runtime_enabled';
export const CPU_BOOST_RUNTIME_THRESHOLD = 'cpu_boost.runtime_threshold';
export const CPU_BOOST_RUNTIME_SUSTAINED = 'cpu_boost.runtime_sustained';
export const CPU_BOOST_RUNTIME_MULTIPLE = 'cpu_boost.runtime_multiple';
export const CPU_BOOST_RUNTIME_DURATION = 'cpu_boost.runtime_duration';
export const CPU_BOOST_RUNTIME_COOLDOWN = 'cpu_boost.runtime_cooldown';

export async function getSetting(key: string): Promise<string | undefined> {
  try {
    const row = await AppDataSource.getRepository(PanelSetting).findOneBy({ key });
    return row?.value ?? undefined;
  } catch {
    return undefined;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const repo = AppDataSource.getRepository(PanelSetting);
  const existing = await repo.findOneBy({ key });
  if (existing) {
    existing.value = value;
    await repo.save(existing);
  } else {
    await repo.save(repo.create({ key, value }));
  }
}

export async function getStartupCpuBoostDefaults(): Promise<{
  enabled: boolean;
  timeout: number;
}> {
  const enabled = (await getSetting(CPU_BOOST_STARTUP_ENABLED)) === 'true';
  const timeout = Number(await getSetting(CPU_BOOST_STARTUP_TIMEOUT)) || 3000;
  return { enabled, timeout };
}

export async function getRuntimeCpuBoostDefaults(): Promise<{
  enabled: boolean;
  threshold: number;
  sustained: number;
  multiple: number;
  duration: number;
  cooldown: number;
}> {
  const enabled = (await getSetting(CPU_BOOST_RUNTIME_ENABLED)) === 'true';
  const threshold = Number(await getSetting(CPU_BOOST_RUNTIME_THRESHOLD)) || 20;
  const sustained = Number(await getSetting(CPU_BOOST_RUNTIME_SUSTAINED)) || 5;
  const multiple = Number(await getSetting(CPU_BOOST_RUNTIME_MULTIPLE)) || 1.5;
  const duration = Number(await getSetting(CPU_BOOST_RUNTIME_DURATION)) || 30;
  const cooldown = Number(await getSetting(CPU_BOOST_RUNTIME_COOLDOWN)) || 60;
  return { enabled, threshold, sustained, multiple, duration, cooldown };
}

export async function setStartupCpuBoostDefaults(
  enabled: boolean,
  timeout: number
): Promise<void> {
  await setSetting(CPU_BOOST_STARTUP_ENABLED, enabled ? 'true' : 'false');
  await setSetting(CPU_BOOST_STARTUP_TIMEOUT, String(timeout));
}

export async function setRuntimeCpuBoostDefaults(
  enabled: boolean,
  threshold: number,
  sustained: number,
  multiple: number,
  duration: number,
  cooldown: number
): Promise<void> {
  await setSetting(CPU_BOOST_RUNTIME_ENABLED, enabled ? 'true' : 'false');
  await setSetting(CPU_BOOST_RUNTIME_THRESHOLD, String(threshold));
  await setSetting(CPU_BOOST_RUNTIME_SUSTAINED, String(sustained));
  await setSetting(CPU_BOOST_RUNTIME_MULTIPLE, String(multiple));
  await setSetting(CPU_BOOST_RUNTIME_DURATION, String(duration));
  await setSetting(CPU_BOOST_RUNTIME_COOLDOWN, String(cooldown));
}