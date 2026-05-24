type Messages = Record<string, unknown>;

function resolve(obj: Messages, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (let i = 0; i < keys.length; i++) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[keys[i]];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`
  );
}

export type TFunction = (path: string, vars?: Record<string, string | number>) => string;

export function createT(messages: Messages): TFunction {
  return (path, vars) => {
    const template = resolve(messages, path);
    if (template === undefined) return path;
    return interpolate(template, vars);
  };
}
