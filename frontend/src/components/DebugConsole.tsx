"use client";

import { useEffect, useRef, useState } from "react";
import { Bug, ChevronDown, ChevronUp } from "lucide-react";
import {
  clearDebugEntries,
  DEBUG_CHANGED_EVENT,
  formatDebugEntries,
  getDebugEnabled,
  getDebugEntries,
  installDebugConsole,
  setDebugEnabled as persistDebugEnabled,
  subscribeDebug,
  type DebugEntry,
} from "@/lib/debug-console";

export default function DebugConsole() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    installDebugConsole();
    try {
      if (new URLSearchParams(window.location.search).get("debug") === "1") {
        persistDebugEnabled(true);
      }
    } catch {}
    if (getDebugEnabled()) {
      setEnabled(true);
      // start minimized — the pill button is the resting state
    }
    setEntries(getDebugEntries());
    const unsub = subscribeDebug((e) =>
      setEntries((prev) => [...prev.slice(-199), e])
    );
    const onChange = () => {
      setEnabled(getDebugEnabled());
    };
    window.addEventListener(DEBUG_CHANGED_EVENT, onChange);
    return () => {
      unsub();
      window.removeEventListener(DEBUG_CHANGED_EVENT, onChange);
    };
  }, []);

  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  }, [entries, open]);

  const disable = () => {
    persistDebugEnabled(false);
    setEnabled(false);
    setOpen(false);
  };

  const copy = async () => {
    const text = formatDebugEntries();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // legacy fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
      } catch {}
    }
    setTimeout(() => setCopied(false), 1500);
  };

  if (!enabled) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-2 right-2 z-[10000] flex items-center gap-1.5 rounded-full border border-border bg-black/80 px-3 py-1.5 text-[10px] font-mono text-emerald-400 shadow-lg"
          title="Open debug console"
        >
          <Bug className="h-3.5 w-3.5" />
          Debug console
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        </button>
      )}

      {enabled && open && (
        <div className="fixed bottom-9 left-2 right-2 z-[10000] rounded-lg border border-border bg-black/90 shadow-2xl sm:left-auto sm:right-2 sm:w-[480px]">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
            <span className="text-[11px] font-mono text-muted-foreground">
              Debug console ({entries.length})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={copy}
                className="rounded border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-mono text-foreground"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button
                onClick={() => {
                  clearDebugEntries();
                  setEntries([]);
                }}
                className="rounded border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-mono text-foreground"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-mono text-foreground"
              >
                Minimize
                <ChevronDown className="h-3 w-3" />
              </button>
              <button
                onClick={disable}
                className="rounded border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-mono text-destructive"
              >
                Disable
              </button>
            </div>
          </div>
          <div
            ref={panelRef}
            className="max-h-[40vh] overflow-y-auto px-3 py-2 font-mono text-[10px] leading-relaxed text-emerald-300"
          >
            {entries.length === 0 ? (
              <p className="text-muted-foreground">No log entries yet.</p>
            ) : (
              entries.map((e, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  <span className="text-muted-foreground">
                    {new Date(e.ts).toLocaleTimeString()}{" "}
                  </span>
                  <span className={e.level === "error" ? "text-red-400" : "text-emerald-300"}>
                    {e.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
