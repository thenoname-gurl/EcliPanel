function parseCronField(field: string, min: number, max: number): Set<number> | null {
  if (field === '*' || field === '?') return null;

  const values = new Set<number>();
  const parts = field.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    const stepMatch = trimmed.match(/^\*\/\d+$/);
    if (stepMatch) {
      const st = parseInt(trimmed.slice(2));
      if (st < 1) return null;
      for (let v = min; v <= max; v += st) {
        values.add(v);
      }
      continue;
    }

    const rangeMatch = trimmed.match(/^(\d+)(?:-(\d+))?(?:\/(\d+))?$/);
    if (!rangeMatch) return null;

    let [, start, end, step] = rangeMatch;
    const s = parseInt(start);
    const e = end ? parseInt(end) : s;
    const st = step ? parseInt(step) : 1;

    if (isNaN(s) || isNaN(e) || isNaN(st) || st < 1) return null;
    if (s < min || e > max || s > e) return null;

    for (let v = s; v <= e; v += st) {
      values.add(v);
    }
  }

  return values;
}

function parseExpr(expr: string): {
  seconds: Set<number> | null;
  minutes: Set<number> | null;
  hours: Set<number> | null;
  days: Set<number> | null;
  months: Set<number> | null;
  weekdays: Set<number> | null;
} | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return null;

  let seconds: Set<number> | null = null;
  let minuteIdx = 0;

  if (parts.length === 6) {
    const s = parseCronField(parts[0], 0, 59);
    if (s === null && parts[0] !== '*') return null;
    seconds = s;
    minuteIdx = 1;
  }

  const minutes = parseCronField(parts[minuteIdx], 0, 59);
  const hours = parseCronField(parts[minuteIdx + 1], 0, 23);
  const days = parseCronField(parts[minuteIdx + 2], 1, 31);
  const months = parseCronField(parts[minuteIdx + 3], 1, 12);
  const weekdays = parseCronField(parts[minuteIdx + 4], 0, 7);

  if (minutes === null && parts[minuteIdx] !== '*') return null;
  if (hours === null && parts[minuteIdx + 1] !== '*') return null;
  if (days === null && parts[minuteIdx + 2] !== '*') return null;
  if (months === null && parts[minuteIdx + 3] !== '*') return null;
  if (weekdays === null && parts[minuteIdx + 4] !== '*') return null;

  return { seconds, minutes, hours, days, months, weekdays };
}

function matches(field: Set<number> | null, value: number): boolean {
  return field === null || field.has(value);
}

export function nextRun(expr: string, from: Date = new Date()): Date | null {
  const SHORTHANDS: Record<string, string> = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@hourly': '0 * * * *',
  };

  const resolved = SHORTHANDS[expr.trim().toLowerCase()];
  if (resolved) expr = resolved;

  const parsed = parseExpr(expr);
  if (!parsed) return null;

  const { seconds, minutes, hours, days, months, weekdays } = parsed;
  const hasSeconds = seconds !== null;

  const startMs = from.getTime();
  const candidateStart = hasSeconds
    ? startMs + 1000
    : (Math.floor(startMs / 60000) + 1) * 60000;
  let candidate = new Date(candidateStart);

  for (let i = 0; i < 525600; i++) {
    const c = new Date(candidate);

    const cMonth = c.getMonth() + 1;
    const cDay = c.getDate();
    const cWeekday = c.getDay();
    const cHour = c.getHours();
    const cMinute = c.getMinutes();
    const cSecond = c.getSeconds();

    const monthMatch = matches(months, cMonth);
    const dayMatch = matches(days, cDay);
    const weekdayMatch = matches(weekdays, cWeekday);
    const dayOk = (dayMatch || weekdayMatch)
      && (days === null || weekdays === null || (dayMatch && weekdayMatch));
    const hourOk = matches(hours, cHour);
    const minuteOk = matches(minutes, cMinute);
    const secondOk = !hasSeconds || matches(seconds, cSecond);

    if (monthMatch && dayOk && hourOk && minuteOk && secondOk) {
      return c;
    }

    candidate = new Date(candidate.getTime() + (hasSeconds ? 1000 : 60000));
  }

  return null;
}

export function validate(expr: string): boolean {
  const SHORTHANDS = new Set([
    '@yearly', '@annually', '@monthly', '@weekly', '@daily', '@hourly',
  ]);
  if (SHORTHANDS.has(expr.trim().toLowerCase())) return true;
  return nextRun(expr) !== null;
}

export function schedule(expr: string, fn: () => void): { stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = () => {
    const now = new Date();
    const next = nextRun(expr, now);
    if (!next) {
      console.error('cron: unsupported expression (redacted)');
      return;
    }
    const delay = next.getTime() - now.getTime();
    timer = setTimeout(() => {
      fn();
      tick();
    }, delay > 0 ? delay : 0);
  };

  tick();
  return { stop: () => { if (timer !== undefined) clearTimeout(timer); } };
}