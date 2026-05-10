"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { API_ENDPOINTS } from "@/lib/panel-config";

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

function toBool(value: any): boolean {
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  if (value === undefined || value === null) return true;
  return value === true || value === "true" || value === 1 || value === "1" || Boolean(value);
}

function useInfraStatus() {
  const [infra, setInfra] = useState<InfraStatus | null>(null);
  useEffect(() => {
    let mounted = true;
    const go = async () => {
      try {
        const r = await fetch("https://backend.ecli.app/public/status", {
          cache: "no-store",
        });
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

function StatusPill({ infra }: { infra: InfraStatus | null }) {
  const t = useTranslations("landing");
  const color =
    infra?.status === "online"
      ? "#4ade80"
      : infra?.status === "degraded"
        ? "#fbbf24"
        : infra?.status === "offline"
          ? "#f87171"
          : "#6b7280";

  const label = infra
    ? t("statusPill.nodesLive", { count: infra.nodeCount })
    : t("statusPill.connecting");

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1"
      style={{ background: `${color}12`, border: `1px solid ${color}30` }}
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
      <span className="text-[11px] font-inter font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

const BAR_COLORS: Record<number, string> = {
  0: "#c7e8d4",
  1: "#4ade80",
  2: "#fbbf24",
  3: "#f87171",
  4: "#dcd0f5",
  5: "#38bdf8",
};

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 260;
const HOVER_BONUS = 40;

function BarStat({
  label,
  value,
  maxValue,
  colorKey,
  index,
}: {
  label: string;
  value: number;
  maxValue: number;
  colorKey: number;
  index: number;
}) {
  const barH =
    maxValue > 0
      ? MIN_HEIGHT + (value / maxValue) * (MAX_HEIGHT - MIN_HEIGHT)
      : MIN_HEIGHT;

  const bg = BAR_COLORS[colorKey] ?? "#fff";

  return (
    <motion.div
      className="flex flex-col gap-2 border border-white/20 p-4 justify-end cursor-pointer overflow-hidden relative w-full min-h-25"
      style={{ background: bg }}
      initial={{ height: 0, opacity: 0, y: 30 }}
      whileInView={{ height: barH, opacity: 1, y: 0 }}
      whileHover={{ height: barH + HOVER_BONUS }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        height: {
          duration: 0.7,
          ease: [0.34, 1.56, 0.64, 1],
          delay: index * 0.1,
        },
        opacity: { duration: 0.4, delay: index * 0.1 },
        y: { duration: 0.5, ease: "easeOut", delay: index * 0.1 },
      }}
    >
      <p className="text-[#171717]/60 font-flink text-2xl sm:text-xl leading-tight">
        {label}
      </p>
      <p className="text-[#171717] font-flink text-sm sm:text-xs leading-none">
        {value.toLocaleString()}
      </p>
    </motion.div>
  );
}

export function Network() {
  const t = useTranslations("landing");
  const infra = useInfraStatus();
  const [tunnelsEnabled, setTunnelsEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadFeatures = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.publicFeatures, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        const enabled = toBool(data?.featureToggles?.tunnels);
        if (mounted) setTunnelsEnabled(enabled);
      } catch {
      }
    };

    loadFeatures();
    return () => {
      mounted = false;
    };
  }, []);

  const NODE_R = 52;
  const TUNNEL_R = 100;

  const nodeCount = infra?.nodeCount ?? 0;
  const tunnelCount = tunnelsEnabled ? (infra?.tunnelCount ?? 0) : 0;
  const tunnelActive = Math.min(tunnelsEnabled ? (infra?.tunnelActive ?? 0) : 0, tunnelCount);

  const stats = useMemo(() => {
    const baseStats = [
      {
        label: t("network.stats.totalNodes"),
        value: infra?.nodeCount ?? 0,
      },
      {
        label: t("network.stats.online"),
        value: infra?.online ?? 0,
      },
      {
        label: t("network.stats.degraded"),
        value: infra?.degraded ?? 0,
      },
      {
        label: t("network.stats.offline"),
        value: infra?.offline ?? 0,
      },
    ];

    if (!tunnelsEnabled) return baseStats;

    return [
      ...baseStats,
      {
        label: t("network.stats.tunnels"),
        value: infra?.tunnelCount ?? 0,
      },
      {
        label: t("network.stats.tunnelsActive"),
        value: infra?.tunnelActive ?? 0,
      },
    ];
  }, [infra, t, tunnelsEnabled]);

  const maxValue = useMemo(
    () => Math.max(...stats.map((s) => s.value), 1),
    [stats],
  );

  return (
    <div id="network" className="my-12 sm:my-20 px-6 sm:px-12 lg:px-40">
      <style>{ORBIT_STYLES}</style>

      <motion.p
        className="font-flink text-white font-bold text-4xl sm:text-5xl lg:text-[5.4rem] text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {t("network.title")}
      </motion.p>
      <motion.p
        className="font-flink text-center text-lg sm:text-[22px] text-white/70 mt-2 mb-10 sm:mb-14"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
      >
        {t("network.body")}
      </motion.p>

      <div className="flex flex-col lg:flex-row gap-12 lg:gap-0 items-stretch border border-white/20">
        <motion.div
          className="flex items-center justify-center p-10 lg:w-[45%] shrink-0"
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
          <div className="relative w-64 h-64 sm:w-72 sm:h-72">
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
                    border: "1px solid rgba(184,90,150,0.2)",
                    width: `${(0.45 + i * 0.275) * 100}%`,
                    height: `${(0.45 + i * 0.275) * 100}%`,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                  }}
                />
              ))}
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #B85A96, #7e87ff)",
                  boxShadow: "0 0 40px rgba(184,90,150,0.5)",
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
                      boxShadow: "0 0 18px rgba(74,222,128,0.6)",
                      "--orbit-r": `${NODE_R}px`,
                      animation: `orbit ${duration}s linear infinite`,
                      animationDelay: `${-(i / Math.max(nodeCount, 1)) * duration}s`,
                    } as React.CSSProperties
                  }
                />
              );
            })}

            {Array.from({ length: tunnelCount }, (_, i) => {
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

            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <StatusPill infra={infra} />
            </div>
          </div>
        </motion.div>

        <span className="hidden lg:block w-px self-stretch bg-white/20 shrink-0" />
        <span className="lg:hidden h-px w-full bg-white/20" />

        <div className="flex-1 p-6 sm:p-8 flex flex-col justify-end">
          <div className="flex items-end gap-3 sm:gap-4 h-[260px]">
            {stats.map((s, i) => (
              <BarStat
                key={s.label}
                {...s}
                maxValue={maxValue}
                colorKey={i}
                index={i}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
