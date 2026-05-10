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

function Stat({
  target,
  suffix,
  label,
}: {
  target: number;
  suffix: string;
  label: string;
}) {
  const locale = useLocale();
  const { value, ref } = useCountUp(target);
  const display = useMemo(
    () => new Intl.NumberFormat(locale).format(value),
    [locale, value],
  );

  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl sm:text-4xl font-bold text-white tabular-nums">
        {display}
        {suffix}
      </div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return {
    value: Math.round(value * 10) / 10,
    suffix: ` ${units[index]}`,
  };
}

const FEATURES = [
  {
    key: "deploy",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1.5 9l3-3 3 3 3-3 3 3 3-3" />
        <path d="M1.5 14l3-3 3 3 3-3 3 3 3-3" opacity=".4" />
      </svg>
    ),
  },
  {
    key: "edge",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="9" r="7" />
        <path d="M9 2C9 2 12 5.5 12 9s-3 7-3 7" />
        <path d="M9 2C9 2 6 5.5 6 9s3 7 3 7" />
        <path d="M2 9h14" />
      </svg>
    ),
  },
  {
    key: "uptime",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="14" height="14" rx="3" />
        <path d="M6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    key: "isolation",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 13V7l6-4 6 4v6l-6 4-6-4z" />
        <path d="M9 3v10M3 7l6 4 6-4" opacity=".4" />
      </svg>
    ),
  },
  {
    key: "metrics",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12l4-4 3 3 4-5 3 3" />
        <rect x="2" y="2" width="14" height="14" rx="2" />
      </svg>
    ),
  },
  {
    key: "coldStarts",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="9" r="2.5" />
        <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.2 3.2l1.4 1.4M13.4 13.4l1.4 1.4M3.2 14.8l1.4-1.4M13.4 4.6l1.4-1.4" />
      </svg>
    ),
  },
];

function FeaturesGrid({
  items,
}: {
  items: { title: string; body: string; icon: React.ReactNode }[];
}) {
  return (
    <div
      className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px"
      style={{
        background: "rgba(255,255,255,0.05)",
        borderRadius: 20,
        overflow: "hidden",
      }}
    >
      {items.map((f) => (
        <div
          key={f.title}
          className="group p-6 sm:p-7 transition-colors"
          style={{ background: "#0d0d12" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(139,92,246,0.04)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = "#0d0d12")}
        >
          <div className="text-zinc-500 group-hover:text-violet-400 transition-colors mb-4 w-fit">
            {f.icon}
          </div>
          <h3 className="text-sm font-semibold text-white mb-2">{f.title}</h3>
          <p className="text-sm text-zinc-500 leading-relaxed">{f.body}</p>
        </div>
      ))}
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
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const features = useMemo(
    () =>
      FEATURES.map(({ key, icon }) => ({
        icon,
        title: t(`features.items.${key}.title`),
        body: t(`features.items.${key}.body`),
      })),
    [t],
  );

  const faqs = useMemo(
    () => [
      { q: t("faq.q1"), a: t("faq.a1") },
      { q: t("faq.q2"), a: t("faq.a2") },
      { q: t("faq.q3"), a: t("faq.a3") },
      { q: t("faq.q4"), a: t("faq.a4") },
    ],
    [t],
  );

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

      <section id="network" className="py-20 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-4">
              {t("network.eyebrow")}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              {t("network.title")}
              <br />
              <span className="text-zinc-500">{t("network.titleMuted")}</span>
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed mb-8">
              {t("network.body")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {networkStats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    className="text-xl font-bold mb-0.5"
                    style={{ color: s.color }}
                  >
                    {s.value}
                  </div>
                  <div className="text-xs text-zinc-600">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="relative w-72 h-72">
              {/* RINGS — rotate slowly */}
              <div
                className="absolute inset-0 animate-spin"
                style={{
                  animationDuration: "20s",
                  animationTimingFunction: "linear",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      border: "1px solid rgba(139,92,246,0.15)",
                      width: `${(0.45 + i * 0.275) * 100}%`,
                      height: `${(0.45 + i * 0.275) * 100}%`,
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                ))}
              </div>

              {/* CENTER GLOBE — static */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
                    boxShadow: "0 0 40px rgba(124,58,237,0.5)",
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <circle cx="10" cy="10" r="7" />
                    <path d="M10 3C10 3 13 6.5 13 10s-3 7-3 7" />
                    <path d="M10 3C10 3 7 6.5 7 10s3 7 3 7" />
                    <path d="M3 10h14" />
                  </svg>
                </div>
              </div>

              {/* NODE DOTS — orbit clockwise on inner ring */}
              {Array.from({ length: nodeCount }, (_, i) => {
                const duration = 18 + i * 0.4;
                return (
                  <div
                    key={`node-${i}`}
                    className="absolute rounded-full"
                    style={
                      {
                        top: "50%",
                        left: "50%",
                        width: 10,
                        height: 10,
                        background: "#4ade80",
                        boxShadow: "0 0 18px rgba(74,222,128,0.55)",
                        "--orbit-r": `${NODE_R}px`,
                        animation: `orbit ${duration}s linear infinite`,
                        animationDelay: `${-(i / Math.max(nodeCount, 1)) * duration}s`,
                      } as React.CSSProperties
                    }
                  />
                );
              })}

              {/* TUNNEL DOTS — orbit counter-clockwise on outer ring */}
              {showTunnelStats &&
                Array.from({ length: tunnelCount }, (_, i) => {
                  const isActive = i < tunnelActive;
                  const color = isActive ? "#38bdf8" : "#f87171";
                  const duration = 28 + i * 0.3;
                  return (
                    <div
                      key={`tunnel-${i}`}
                      className="absolute rounded-full"
                      style={
                        {
                          top: "50%",
                          left: "50%",
                          width: 8,
                          height: 8,
                          background: color,
                          boxShadow: `0 0 ${isActive ? 16 : 10}px ${color}`,
                          "--orbit-r": `${TUNNEL_R}px`,
                          animation: `orbit-reverse ${duration}s linear infinite`,
                          animationDelay: `${-(i / Math.max(tunnelCount, 1)) * duration}s`,
                        } as React.CSSProperties
                      }
                    />
                  );
                })}

              {/* STATUS PILL — static */}
              <div
                className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full px-4 py-1.5 whitespace-nowrap"
                style={{
                  background: "#0a0a0f",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <StatusPill infra={infra} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <FAQ />
      <End />
      <Footer />
    </div>
  );
}
