export const DEFAULT_STARTUP_DETECTION_PATTERN = ' ';

export function normalizeStartupDonePatterns(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : input === undefined || input === null
      ? []
      : [input];

  const patterns = raw
    .map((value) => String(value ?? ''))
    .filter((value) => value.length > 0);

  if (patterns.length === 0) return [DEFAULT_STARTUP_DETECTION_PATTERN];
  return patterns;
}

export function normalizeProcessConfig(processConfig: Record<string, any> | null | undefined): Record<string, any> | null {
  if (processConfig === null || processConfig === undefined) return processConfig ?? null;
  if (typeof processConfig !== 'object' || Array.isArray(processConfig)) return processConfig as any;

  const normalized = { ...processConfig };
  const startup = {
    ...(normalized.startup || {}),
    done: normalizeStartupDonePatterns(normalized.startup?.done),
  };

  normalized.startup = startup;
  return normalized;
}