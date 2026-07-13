"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const BATCH_SIZE = 20;
const FLUSH_INTERVAL = 30_000;
const INGEST_URL = "/api/telemetry/ingest";
const EXCLUDED_PATHS = ["/dashboard/chat"];

let globalBuffer: TelemetryPayload[] = [];
let globalTimer: ReturnType<typeof setTimeout> | null = null;

interface TelemetryPayload {
  event: string;
  category?: string;
  label?: string;
  path: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

function generateSessionId(): string {
  const key = "_ecli_sid";
  let sid = sessionStorage.getItem(key);
  if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem(key, sid); }
  return sid;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

function cleanText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("svg,img,.badge,.sr-only,[aria-hidden='true'],.animate-spin,.opacity-0,.hidden,.invisible,kbd,code,time").forEach(c => c.remove());
  return (clone.textContent ?? "").trim().replace(/\s+/g, " ");
}

function getEventName(el: Element): string {
  const dt = el.getAttribute("data-telemetry");
  if (dt) return dt;
  const aria = el.getAttribute("aria-label");
  if (aria) return slug(aria);
  const title = el.getAttribute("title");
  if (title) return slug(title);
  const name = el.getAttribute("name");
  if (name) return `input:${slug(name)}`;
  const id = el.getAttribute("id");
  if (id) return slug(id);

  for (const a of ["data-testid", "data-cy", "data-action"]) {
    const v = el.getAttribute(a);
    if (v) return slug(v);
  }

  const text = cleanText(el);
  if (!text || text.length < 3) {
    const svg = el.querySelector("svg[class*='lucide-'],.lucide,[data-lucide]") ?? el.querySelector("svg");
    if (svg) {
      const cls = svg.getAttribute("class") || "";
      const m = cls.match(/lucide-(\w+)/);
      if (m) return `icon:${m[1]}`;
      const svgAria = svg.getAttribute("aria-label");
      if (svgAria) return `icon:${slug(svgAria)}`;
    }
  }

  const tag = el.tagName.toLowerCase();
  if (!text) return tag;

  const short = slug(text);
  if (short.length <= 40) return short;

  const words = short.split("-").filter(w => w.length > 1);
  return words.slice(0, 3).join("-");
}

function getCategory(el: Element): string | undefined {
  const cat = el.closest("[data-telemetry-category]");
  if (cat) return cat.getAttribute("data-telemetry-category") ?? undefined;

  const dialog = el.closest("[role='dialog']");
  if (dialog) {
    const h = dialog.querySelector("[role='heading'],h2,h3");
    if (h?.textContent) return `dlg:${slug(h.textContent)}`;
  }

  const section = el.closest("section,[role='tabpanel']");
  if (section) {
    const h = section.querySelector("h1,h2,h3");
    if (h?.textContent) return `sec:${slug(h.textContent)}`;
  }

  const path = window.location.pathname;
  if (path.startsWith("/dashboard/")) {
    const segs = path.split("/").filter(Boolean);
    return segs.slice(0, 3).join("/");
  }

  return undefined;
}

async function flush() {
  if (globalTimer) { clearTimeout(globalTimer); globalTimer = null; }
  const batch = globalBuffer.splice(0);
  if (batch.length === 0) return;

  const sid = generateSessionId();
  const body = JSON.stringify({ events: batch });
  const url = `${INGEST_URL}?sid=${encodeURIComponent(sid)}`;
  const blob = new Blob([body], { type: "application/json" });

  if (navigator.sendBeacon(url, blob)) return;
  try { await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }); } catch { /* best-effort */ }
}

function enqueue(payload: TelemetryPayload) {
  globalBuffer.push(payload);
  if (globalBuffer.length >= BATCH_SIZE) { flush(); }
  else if (!globalTimer) { globalTimer = setTimeout(flush, FLUSH_INTERVAL); }
}

export default function TelemetryProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPageview = useRef("");

  const excluded = EXCLUDED_PATHS.some(p => pathname.startsWith(p));

  useEffect(() => {
    if (excluded) return;
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
    if (url === lastPageview.current) return;
    lastPageview.current = url;
    enqueue({ event: "pageview", path: url, category: "navigation", timestamp: Date.now() });
  }, [pathname, searchParams, excluded]);

  useEffect(() => {
    if (excluded) return;

    const handler = (e: PointerEvent) => {
      const el = (e.target as Element)?.closest(
        "button,a,input,select,textarea,[role='button'],[role='tab'],[role='menuitem'],[role='option'],[role='switch'],[role='checkbox'],[data-telemetry]",
      );
      if (!el) return;

      const label = cleanText(el).slice(0, 128) || undefined;

      enqueue({
        event: getEventName(el),
        category: getCategory(el),
        label,
        path: window.location.pathname,
        timestamp: Date.now(),
      });
    };

    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [excluded]);

  useEffect(() => {
    if (excluded) return;

    const timers = new Map<Element, ReturnType<typeof setTimeout>>();

    const handler = (e: Event) => {
      const el = e.target as Element;
      if (!["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      if ((el as any).type === "password") return;
      const ename = getEventName(el);
      if (!ename || ["input", "select", "textarea"].includes(ename)) return;

      const prev = timers.get(el);
      if (prev) clearTimeout(prev);
      timers.set(el, setTimeout(() => {
        timers.delete(el);
        enqueue({
          event: `change:${ename}`,
          category: getCategory(el),
          label: ((el as HTMLInputElement).value || (el as HTMLSelectElement).value || "").slice(0, 64) || undefined,
          path: window.location.pathname,
          timestamp: Date.now(),
        });
      }, 2000));
    };

    document.addEventListener("change", handler, true);
    document.addEventListener("input", handler, true);
    return () => {
      document.removeEventListener("change", handler, true);
      document.removeEventListener("input", handler, true);
      timers.forEach(t => clearTimeout(t));
    };
  }, [excluded]);

  useEffect(() => {
    const cb = () => flush();
    window.addEventListener("beforeunload", cb);
    return () => window.removeEventListener("beforeunload", cb);
  }, []);

  return null;
}