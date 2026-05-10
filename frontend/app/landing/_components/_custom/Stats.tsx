"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

interface PublicMetrics {
  windowHours: number;
  trafficBytes: number;
  nodeTrafficBytes?: number;
  requestCount: number;
  totalUsers: number;
  trafficStart: string;
  trafficEnd: string;
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

function usePublicMetrics() {
  const [metrics, setMetrics] = useState<PublicMetrics | null>(null);
  useEffect(() => {
    let mounted = true;
    const go = async () => {
      try {
        const r = await fetch("https://backend.ecli.app/public/metrics", {
          cache: "no-store",
        });
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

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    started.current = false;
    setValue(0);
  }, [target]);

  useEffect(() => {
    const el = ref.current;
    if (!el || target === 0) return;

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
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { value, ref };
}

const colorMap: Record<number, string> = {
  0: "#c7e8d4",
  1: "#dcd0f5",
  2: "#ffd4b8",
};

const HOVER_BONUS = 80;
const BASE_HEIGHT = 400;

interface StatCardProps {
  target: number;
  suffix: string;
  label: string;
  colorKey: number;
  index: number;
}

function StatCard({ target, suffix, label, colorKey, index }: StatCardProps) {
  const locale = useLocale();
  const { value, ref } = useCountUp(target);
  const display = useMemo(
    () => new Intl.NumberFormat(locale).format(value),
    [locale, value],
  );

  return (
    <motion.div
      ref={ref}
      className="flex flex-col gap-3 border border-white/20 p-6 sm:p-8 justify-center w-full overflow-hidden cursor-pointer"
      style={{ background: colorMap[colorKey] }}
      initial={{ height: 0, opacity: 0, y: 40 }}
      whileInView={{ height: BASE_HEIGHT, opacity: 1, y: 0 }}
      whileHover={{ height: BASE_HEIGHT + HOVER_BONUS }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        height: {
          duration: 0.7,
          ease: [0.34, 1.56, 0.64, 1],
          delay: index * 0.15,
        },
        opacity: { duration: 0.4, delay: index * 0.15 },
        y: { duration: 0.5, ease: "easeOut", delay: index * 0.15 },
      }}
    >
      <p className="text-[#171717] text-xl sm:text-2xl lg:text-3xl mb-auto">
        {label}
      </p>
      <p className="text-[#171717] text-xl sm:text-2xl lg:text-3xl font-inter font-medium">
        Total
      </p>
      <span className="flex gap-1 items-baseline flex-wrap">
        <span className="text-[#171717] text-xl sm:text-2xl lg:text-3xl font-inter font-medium tabular-nums">
          {display}
        </span>
        {suffix && (
          <span className="text-[#171717] font-medium font-inter text-xl sm:text-2xl lg:text-3xl">
            {suffix}
          </span>
        )}
      </span>
    </motion.div>
  );
}

function StatCardMobile({
  target,
  suffix,
  label,
  colorKey,
  index,
}: StatCardProps) {
  const locale = useLocale();
  const { value, ref } = useCountUp(target);
  const display = useMemo(
    () => new Intl.NumberFormat(locale).format(value),
    [locale, value],
  );

  return (
    <motion.div
      ref={ref}
      className="flex flex-col gap-2 border border-white/20 p-6 cursor-pointer"
      style={{ background: colorMap[colorKey] }}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.12 }}
    >
      <p className="text-[#171717] text-lg">{label}</p>
      <p className="text-sm font-inter text-[#171717]/60">Total</p>
      <span className="flex gap-1 items-baseline">
        <span className="text-[#171717] text-3xl font-inter font-bold tabular-nums">
          {display}
        </span>
        {suffix && (
          <span className="text-[#171717] font-bold font-inter text-3xl">
            {suffix}
          </span>
        )}
      </span>
    </motion.div>
  );
}

export function Stats() {
  const t = useTranslations("landing");
  const metrics = usePublicMetrics();

  const stats = useMemo(() => {
    const totalTraffic =
      metrics?.nodeTrafficBytes ?? metrics?.trafficBytes ?? 0;
    const traffic = formatBytes(totalTraffic);
    return [
      {
        target: traffic.value,
        suffix: traffic.suffix,
        label: t("stats.dailyNodeTraffic"),
        colorKey: 0,
      },
      {
        target: metrics?.requestCount ?? 0,
        suffix: "",
        label: t("stats.monthlyRequests"),
        colorKey: 1,
      },
      {
        target: metrics?.totalUsers ?? 0,
        suffix: "",
        label: t("stats.totalUsers"),
        colorKey: 2,
      },
    ];
  }, [metrics, t]);

  return (
    <div className="my-12 sm:my-20 mb-20 sm:mb-40">
      <motion.p
        className="font-flink text-white font-bold text-4xl sm:text-5xl lg:text-[5.4rem] text-center mb-8 sm:mb-0"
        initial={{ opacity: 0, y: -24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {t("stats.heading")}
      </motion.p>

      <div className="hidden sm:flex gap-4 lg:gap-6 items-end justify-center px-8 md:px-20 lg:px-40 h-[55vh] lg:h-[60vh]">
        {stats.map((s, i) => (
          <StatCard {...s} index={i} key={i} />
        ))}
      </div>

      <div className="flex sm:hidden flex-col gap-4 px-6 mt-4">
        {stats.map((s, i) => (
          <StatCardMobile {...s} index={i} key={i} />
        ))}
      </div>
    </div>
  );
}
