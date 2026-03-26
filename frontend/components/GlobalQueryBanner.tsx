"use client"
import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function prettyKey(k: string) {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

const KNOWN_KEYS = new Set([
  "emailVerified",
  "emailRestore",
  "emailRestored",
  "studentVerified",
  "restoreEmail",
  "verified",
]);

export default function GlobalQueryBanner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [handledKeys, setHandledKeys] = useState<string[]>([]);

  const entries = useMemo(() => {
    if (!searchParams) return [] as Array<[string, string]>;
    const arr: Array<[string, string]> = [];
    for (const [k, v] of (searchParams as any).entries()) {
      arr.push([k, v]);
    }
    return arr;
  }, [searchParams]);

  useEffect(() => {
    if (!entries || entries.length === 0) return;
    const matches: string[] = [];
    let msg: string | null = null;
    for (const [k, v] of entries) {
      const lower = k.toLowerCase();
      const truthy = v === "1" || v === "true" || v === "ok" || v === "success" || v === "yes" || v === "done" || v === "";
      if (KNOWN_KEYS.has(k) || lower.includes("verify") || lower.includes("restor") || lower.includes("verified") || lower.includes("restore")) {
        matches.push(k);
        if (!msg) {
          if (lower.includes("email") && lower.includes("restor")) {
            msg = "Email restore successful.";
          } else if (lower.includes("email") && lower.includes("verif")) {
            msg = "Email verified successfully.";
          } else if (lower.includes("student") || lower.includes("studentverified") || lower.includes("verifiedstudent")) {
            msg = "Student verification completed.";
          } else if (truthy) {
            msg = `${prettyKey(k)} completed.`;
          } else {
            msg = `${prettyKey(k)}: ${v}`;
          }
        }
      }
    }

    if (matches.length > 0 && msg) {
      setHandledKeys(matches);
      setMessage(msg);
      setVisible(true);
    }
  }, [entries]);

  function clearParams() {
    if (!searchParams) return;
    const next = new URLSearchParams();
    for (const [k, v] of (searchParams as any).entries()) {
      if (!handledKeys.includes(k)) next.append(k, v);
    }
    const qs = next.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    router.replace(href);
    setVisible(false);
  }

  if (!visible || !message) return null;

  return (
    <div className="fixed left-1/2 transform -translate-x-1/2 top-6 z-[9999]">
      <div className="max-w-xl bg-emerald-600 text-white px-4 py-2 rounded shadow-lg flex items-center gap-3">
        <div className="flex-1 text-sm">{message}</div>
        <button
          aria-label="Dismiss message"
          onClick={clearParams}
          className="opacity-90 hover:opacity-100 text-sm font-semibold px-2 py-1 rounded bg-white/10"
        >
          OK
        </button>
      </div>
    </div>
  );
}
