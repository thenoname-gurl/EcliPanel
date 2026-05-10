"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { API_ENDPOINTS } from "@/lib/panel-config";
import GradualBlurMemo from "./landing/_components/_reacts-bits/GradualBlur";
import { Hero } from "./landing/_components/_custom/Hero";
import { Menu } from "./landing/_components/_custom/Menu";
import { Stats } from "./landing/_components/_custom/Stats";
import { Features } from "./landing/_components/_custom/Features";
import { Pricing } from "./landing/_components/_custom/Pricing";
import { FAQ } from "./landing/_components/_custom/FAQ";
import { End } from "./landing/_components/_custom/End";
import { Footer } from "./landing/_components/_custom/Footer";
import { Network } from "./landing/_components/_custom/Orbit";

const API_URL = "https://backend.ecli.app/public/status";
const METRICS_URL = "https://backend.ecli.app/public/metrics";

interface InfraStatus {
  status: "online" | "degraded" | "offline" | string;
  nodeCount: number;
  online: number;
  degraded: number;
  offline: number;
  tunnelCount: number;
  tunnelActive: number;
  tunnelInactive: number;
}

interface PublicMetrics {
  windowHours: number;
  trafficBytes: number;
  nodeTrafficBytes?: number;
  requestCount: number;
  totalUsers: number;
  trafficStart: string;
  trafficEnd: string;
}

function useInfraStatus() {
  const [infra, setInfra] = useState<InfraStatus | null>(null);
  useEffect(() => {
    let mounted = true;
    const go = async () => {
      try {
        const r = await fetch(API_URL, { cache: "no-store" });
        if (!r.ok) return;
        const d: InfraStatus = await r.json();
        if (mounted) setInfra(d);
      } catch {}
    };
    go();
    const iv = setInterval(go, 15_000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);
  return infra;
}

function usePublicMetrics() {
  const [metrics, setMetrics] = useState<PublicMetrics | null>(null);
  useEffect(() => {
    let mounted = true;
    const go = async () => {
      try {
        const r = await fetch(METRICS_URL, { cache: "no-store" });
        if (!r.ok) return;
        const d: PublicMetrics = await r.json();
        if (mounted) setMetrics(d);
      } catch {}
    };
    go();
    const iv = setInterval(go, 60_000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);
  return metrics;
}

function usePublicFeatures() {
  const [features, setFeatures] = useState<Record<string, boolean> | null>(
    null,
  );

  useEffect(() => {
    let mounted = true;
    const go = async () => {
      try {
        const r = await fetch(API_ENDPOINTS.publicFeatures, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const data = await r.json();
        if (!mounted) return;
        setFeatures(data?.featureToggles ?? null);
      } catch {
        if (!mounted) return;
        setFeatures(null);
      }
    };
    go();
    const iv = setInterval(go, 60_000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  return features;
}

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - p, 3);
            setValue(Math.round(ease * target));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { value, ref };
}

function StatusPill({ infra }: { infra: InfraStatus | null }) {
  const t = useTranslations("landing");
  const locale = useLocale();
  const color =
    infra?.status === "online"
      ? "#4ade80"
      : infra?.status === "degraded"
        ? "#fbbf24"
        : infra?.status === "offline"
          ? "#f87171"
          : "#6b7280";

  const label = infra
    ? t("statusPill.nodesLive", {
        count: new Intl.NumberFormat(locale).format(infra.nodeCount),
      })
    : t("statusPill.connecting");

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1"
      style={{
        background: `${color}12`,
        border: `1px solid ${color}30`,
      }}
    >
      <span className="relative flex h-1.5 w-1.5">
        {infra?.status === "online" && (
          <span
            className="absolute inline-flex h-full w-full rounded-full animate-ping"
            style={{ background: color, opacity: 0.5 }}
          />
        )}
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
        />
      </span>
      <span className="text-[11px] font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

// Orbit keyframes injected once
const ORBIT_STYLES = `
  @keyframes orbit {
    from { transform: translate(-50%, -50%) rotate(0deg) translateX(var(--orbit-r)) rotate(0deg); }
    to   { transform: translate(-50%, -50%) rotate(360deg) translateX(var(--orbit-r)) rotate(-360deg); }
  }
  @keyframes orbit-reverse {
    from { transform: translate(-50%, -50%) rotate(0deg) translateX(var(--orbit-r)) rotate(0deg); }
    to   { transform: translate(-50%, -50%) rotate(-360deg) translateX(var(--orbit-r)) rotate(360deg); }
  }
`;

export default function LandingPage() {
  const t = useTranslations("landing");
  const infra = useInfraStatus();
  const metrics = usePublicMetrics();
  const publicFeatures = usePublicFeatures();
  const showTunnelStats = publicFeatures?.tunnels !== false;

  const nodeCount = infra?.nodeCount ?? 0;
  const tunnelCount = showTunnelStats ? (infra?.tunnelCount ?? 0) : 0;
  const tunnelActive = showTunnelStats
    ? Math.min(infra?.tunnelActive ?? 0, tunnelCount)
    : 0;
  const tunnelInactive = showTunnelStats
    ? Math.max(0, tunnelCount - tunnelActive)
    : 0;

  const networkStats = useMemo(
    () =>
      [
        {
          label: t("network.stats.totalNodes"),
          value: infra?.nodeCount?.toLocaleString() ?? "-",
          color: "#fff",
        },
        {
          label: t("network.stats.online"),
          value: infra?.online ?? "-",
          color: "#4ade80",
        },
        {
          label: t("network.stats.degraded"),
          value: infra?.degraded ?? "-",
          color: "#fbbf24",
        },
        {
          label: t("network.stats.offline"),
          value: infra?.offline ?? "-",
          color: "#f87171",
        },
        {
          label: t("network.stats.tunnels"),
          value: infra?.tunnelCount?.toLocaleString() ?? "-",
          color: "#38bdf8",
          isTunnel: true,
        },
        {
          label: t("network.stats.tunnelsActive"),
          value: infra?.tunnelActive?.toLocaleString() ?? "-",
          color: "#4ade80",
          isTunnel: true,
        },
        {
          label: t("network.stats.tunnelsInactive"),
          value: infra?.tunnelInactive?.toLocaleString() ?? "-",
          color: "#f87171",
          isTunnel: true,
        },
      ].filter((item) => showTunnelStats || !item.isTunnel),
    [infra, showTunnelStats, t],
  );

  // orbit radii in px — container is w-72 = 288px, so half = 144px
  const NODE_R = 0.36 * 144;
  const TUNNEL_R = 0.7 * 144;

  return (
    <div className="bg-[#0a0a0f] min-h-screen text-white">
      <GradualBlurMemo
        target="page"
        position="top"
        height="13rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
      />
      {/* inject orbit keyframes once */}
      <style>{ORBIT_STYLES}</style>

      <Menu />
      <Hero />
      <Stats />
      <Features />
      <Pricing />
      <Network />
      <FAQ />
      <End />
      <Footer />
    </div>
  );
}
