// Global debug log — an F12-console replacement visible on any device.
// Intercepts console.*, window errors and unhandled rejections into a capped
// buffer that the DebugConsole UI can render and copy.

export type DebugEntry = { ts: number; level: string; msg: string };

const MAX = 200;
let entries: DebugEntry[] = [];
const subs = new Set<(e: DebugEntry) => void>();

export function debugLog(level: string, msg: string): void {
  const entry: DebugEntry = { ts: Date.now(), level, msg };
  entries.push(entry);
  if (entries.length > MAX) entries = entries.slice(-MAX);
  subs.forEach((fn) => {
    try {
      fn(entry);
    } catch {}
  });
}

export function getDebugEntries(): DebugEntry[] {
  return entries;
}

export function subscribeDebug(fn: (e: DebugEntry) => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function formatDebugEntries(): string {
  return entries
    .map((e) => {
      const d = new Date(e.ts);
      const pad = (n: number) => String(n).padStart(2, "0");
      const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      return `[${time}] ${e.level}: ${e.msg}`;
    })
    .join("\n");
}

export function clearDebugEntries(): void {
  entries = [];
}

// ---- enable/disable (persisted locally, shared with settings UI) ------------

export const DEBUG_STORAGE_KEY = "eclipanel-debug";
export const DEBUG_CHANGED_EVENT = "eclipanel-debug-changed";

export function getDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDebugEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) localStorage.setItem(DEBUG_STORAGE_KEY, "1");
    else localStorage.removeItem(DEBUG_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(DEBUG_CHANGED_EVENT));
  } catch {}
}

const stringify = (a: unknown): string => {
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
};

let installed = false;

export function installDebugConsole(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const wire = (orig: (...args: unknown[]) => void, level: string) =>
    (...args: unknown[]) => {
      try {
        debugLog(level, args.map(stringify).join(" "));
      } catch {}
      if (orig) orig(...args);
    };

  try {
    console.log = wire(console.log.bind(console), "log");
    console.warn = wire(console.warn.bind(console), "warn");
    console.error = wire(console.error.bind(console), "error");
  } catch {}

  try {
    window.addEventListener("error", (ev) => {
      debugLog("error", `${ev.message}${ev.filename ? ` @ ${ev.filename}:${ev.lineno}` : ""}`);
    });
    window.addEventListener("unhandledrejection", (ev) => {
      const reason = (ev as any).reason;
      debugLog("error", `unhandledrejection: ${reason?.message || reason}`);
    });
  } catch {}
}
