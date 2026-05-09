"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { API_ENDPOINTS } from "@/lib/panel-config"

const API_URL = "https://backend.ecli.app/public/status"
const METRICS_URL = "https://backend.ecli.app/public/metrics"

interface InfraStatus {
  status: "online" | "degraded" | "offline" | string
  nodeCount: number
  online: number
  degraded: number
  offline: number
  tunnelCount: number
  tunnelActive: number
  tunnelInactive: number
}

interface PublicMetrics {
  windowHours: number
  trafficBytes: number
  nodeTrafficBytes?: number
  requestCount: number
  totalUsers: number
  trafficStart: string
  trafficEnd: string
}

function useInfraStatus() {
  const [infra, setInfra] = useState<InfraStatus | null>(null)
  useEffect(() => {
    let mounted = true
    const go = async () => {
      try {
        const r = await fetch(API_URL, { cache: "no-store" })
        if (!r.ok) return
        const d: InfraStatus = await r.json()
        if (mounted) setInfra(d)
      } catch {}
    }
    go()
    const iv = setInterval(go, 15_000)
    return () => {
      mounted = false
      clearInterval(iv)
    }
  }, [])
  return infra
}

function usePublicMetrics() {
  const [metrics, setMetrics] = useState<PublicMetrics | null>(null)
  useEffect(() => {
    let mounted = true
    const go = async () => {
      try {
        const r = await fetch(METRICS_URL, { cache: "no-store" })
        if (!r.ok) return
        const d: PublicMetrics = await r.json()
        if (mounted) setMetrics(d)
      } catch {}
    }
    go()
    const iv = setInterval(go, 60_000)
    return () => {
      mounted = false
      clearInterval(iv)
    }
  }, [])
  return metrics
}

function usePublicFeatures() {
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null)

  useEffect(() => {
    let mounted = true
    const go = async () => {
      try {
        const r = await fetch(API_ENDPOINTS.publicFeatures, { cache: "no-store" })
        if (!r.ok) return
        const data = await r.json()
        if (!mounted) return
        setFeatures(data?.featureToggles ?? null)
      } catch {
        if (!mounted) return
        setFeatures(null)
      }
    }
    go()
    const iv = setInterval(go, 60_000)
    return () => {
      mounted = false
      clearInterval(iv)
    }
  }, [])

  return features
}

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const started = useRef(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const start = performance.now()
          const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1)
            const ease = 1 - Math.pow(1 - p, 3)
            setValue(Math.round(ease * target))
            if (p < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [target, duration])

  return { value, ref }
}

function StatusPill({ infra }: { infra: InfraStatus | null }) {
  const t = useTranslations("landing")
  const locale = useLocale()
  const color =
    infra?.status === "online"
      ? "#4ade80"
      : infra?.status === "degraded"
      ? "#fbbf24"
      : infra?.status === "offline"
      ? "#f87171"
      : "#6b7280"

  const label = infra
    ? t("statusPill.nodesLive", {
        count: new Intl.NumberFormat(locale).format(infra.nodeCount),
      })
    : t("statusPill.connecting")

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
  )
}

function Stat({
  target,
  suffix,
  label,
}: {
  target: number
  suffix: string
  label: string
}) {
  const locale = useLocale()
  const { value, ref } = useCountUp(target)
  const display = useMemo(
    () => new Intl.NumberFormat(locale).format(value),
    [locale, value]
  )

  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl sm:text-4xl font-bold text-white tabular-nums">
        {display}
        {suffix}
      </div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  )
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return {
    value: Math.round(value * 10) / 10,
    suffix: ` ${units[index]}`,
  }
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
]

function FeaturesGrid({
  items,
}: {
  items: { title: string; body: string; icon: React.ReactNode }[]
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
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "#0d0d12")
          }
        >
          <div className="text-zinc-500 group-hover:text-violet-400 transition-colors mb-4 w-fit">
            {f.icon}
          </div>
          <h3 className="text-sm font-semibold text-white mb-2">{f.title}</h3>
          <p className="text-sm text-zinc-500 leading-relaxed">{f.body}</p>
        </div>
      ))}
    </div>
  )
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
`

export default function LandingPage() {
  const t = useTranslations("landing")
  const infra = useInfraStatus()
  const metrics = usePublicMetrics()
  const publicFeatures = usePublicFeatures()
  const showTunnelStats = publicFeatures?.tunnels !== false
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const features = useMemo(
    () =>
      FEATURES.map(({ key, icon }) => ({
        icon,
        title: t(`features.items.${key}.title`),
        body: t(`features.items.${key}.body`),
      })),
    [t]
  )

  const plans = useMemo(
    () => [
      {
        name: t("pricing.plans.free.name"),
        priceLabel: t("pricing.plans.free.price"),
        desc: t("pricing.plans.free.desc"),
        features: [
          t("pricing.plans.free.features.0"),
          t("pricing.plans.free.features.1"),
          t("pricing.plans.free.features.2"),
          t("pricing.plans.free.features.3"),
          t("pricing.plans.free.features.4"),
          t("pricing.plans.free.features.5"),
          t("pricing.plans.free.features.6"),
          t("pricing.plans.free.features.7"),
        ],
        cta: t("pricing.plans.free.cta"),
        highlight: false,
      },
      {
        name: t("pricing.plans.educational.name"),
        priceLabel: t("pricing.plans.educational.price"),
        desc: t("pricing.plans.educational.desc"),
        features: [
          t("pricing.plans.educational.features.0"),
          t("pricing.plans.educational.features.1"),
          t("pricing.plans.educational.features.2"),
          t("pricing.plans.educational.features.3"),
          t("pricing.plans.educational.features.4"),
          t("pricing.plans.educational.features.5"),
          t("pricing.plans.educational.features.6"),
          t("pricing.plans.educational.features.7"),
          t("pricing.plans.educational.features.8"),
        ],
        cta: t("pricing.plans.educational.cta"),
        highlight: false,
      },
      {
        name: t("pricing.plans.paid.name"),
        priceLabel: t("pricing.plans.paid.price"),
        desc: t("pricing.plans.paid.desc"),
        features: [
          t("pricing.plans.paid.features.0"),
          t("pricing.plans.paid.features.1"),
          t("pricing.plans.paid.features.2"),
          t("pricing.plans.paid.features.3"),
          t("pricing.plans.paid.features.4"),
          t("pricing.plans.paid.features.5"),
          t("pricing.plans.paid.features.6"),
          t("pricing.plans.paid.features.7"),
          t("pricing.plans.paid.features.8"),
          t("pricing.plans.paid.features.9"),
        ],
        cta: t("pricing.plans.paid.cta"),
        highlight: true,
      },
      {
        name: t("pricing.plans.enterprise.name"),
        priceLabel: t("pricing.plans.enterprise.price"),
        desc: t("pricing.plans.enterprise.desc"),
        features: [
          t("pricing.plans.enterprise.features.0"),
          t("pricing.plans.enterprise.features.1"),
          t("pricing.plans.enterprise.features.2"),
          t("pricing.plans.enterprise.features.3"),
          t("pricing.plans.enterprise.features.4"),
          t("pricing.plans.enterprise.features.5"),
          t("pricing.plans.enterprise.features.6"),
          t("pricing.plans.enterprise.features.7"),
          t("pricing.plans.enterprise.features.8"),
          t("pricing.plans.enterprise.features.9"),
          t("pricing.plans.enterprise.features.10"),
          t("pricing.plans.enterprise.features.11"),
          t("pricing.plans.enterprise.features.12"),
        ],
        cta: t("pricing.plans.enterprise.cta"),
        href: "mailto:contact@ecli.app",
        highlight: false,
      },
    ],
    [t]
  )

  const faqs = useMemo(
    () => [
      { q: t("faq.q1"), a: t("faq.a1") },
      { q: t("faq.q2"), a: t("faq.a2") },
      { q: t("faq.q3"), a: t("faq.a3") },
      { q: t("faq.q4"), a: t("faq.a4") },
    ],
    [t]
  )

  const nodeCount = infra?.nodeCount ?? 0
  const tunnelCount = showTunnelStats ? infra?.tunnelCount ?? 0 : 0
  const tunnelActive = showTunnelStats
    ? Math.min(infra?.tunnelActive ?? 0, tunnelCount)
    : 0
  const tunnelInactive = showTunnelStats
    ? Math.max(0, tunnelCount - tunnelActive)
    : 0

  const networkStats = useMemo(
    () => [
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
    [infra, showTunnelStats, t]
  )

  // orbit radii in px — container is w-72 = 288px, so half = 144px
  const NODE_R = 0.36 * 144
  const TUNNEL_R = 0.7 * 144

  return (
    <div className="bg-[#0a0a0f] min-h-screen text-white">
      {/* inject orbit keyframes once */}
      <style>{ORBIT_STYLES}</style>

      <header
        className="fixed top-0 inset-x-0 z-50 h-14 flex items-center"
        style={{
          background: "rgba(10,10,15,0.85)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="max-w-5xl mx-auto w-full px-5 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/assets/icons/logo.png"
              alt={t("brand")}
              width={24}
              height={24}
              className="h-6 w-6"
            />
            <span className="font-semibold text-[14px] tracking-tight">
              {t("brand")}
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-0.5">
            {[
              { id: "features", label: t("nav.features") },
              { id: "pricing", label: t("nav.pricing") },
              { id: "network", label: t("nav.network") },
              { id: "faq", label: t("nav.faq") },
            ].map((l) => (
              <a
                key={l.id}
                href={`#${l.id}`}
                className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden sm:block text-sm text-zinc-400 hover:text-white px-3 py-1.5 transition-colors"
            >
              {t("nav.signIn")}
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold bg-white text-black px-4 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              {t("nav.getStarted")}
            </Link>
          </div>
        </div>
      </header>

      <section
        id="hero"
        className="relative min-h-screen flex items-center justify-center overflow-hidden px-5 pt-14"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(139,92,246,0.08) 1px,transparent 1px),linear-gradient(90deg,rgba(139,92,246,0.08) 1px,transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 40%,transparent 30%,#0a0a0f 100%)",
          }}
        />
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle,rgba(139,92,246,0.12) 0%,transparent 70%)",
          }}
        />

        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.08] mb-5">
            {t("hero.titleLine1")}
            <br />
            <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              {t("hero.titleLine2")}
            </span>
          </h1>

          <p className="text-base sm:text-lg text-zinc-400 leading-relaxed mb-8 max-w-lg mx-auto">
            {t("hero.subtitle")}
          </p>

          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2.5 bg-white text-black font-semibold text-[15px] px-7 py-3.5 rounded-xl hover:bg-zinc-50 active:scale-[0.98] transition-all shadow-2xl shadow-black/30 mb-4"
          >
            {t("hero.cta")}
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M3 7.5h9M9 4l3.5 3.5L9 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>

          <p className="text-xs text-zinc-600 mb-10">{t("hero.note")}</p>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30">
          <div className="w-px h-8 bg-gradient-to-b from-transparent to-white" />
        </div>
      </section>

      <section className="py-20 px-5">
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">
          {(() => {
            const totalTraffic = metrics?.nodeTrafficBytes ?? metrics?.trafficBytes ?? 0
            const traffic = formatBytes(totalTraffic)
            return (
              <Stat
                target={traffic.value}
                suffix={traffic.suffix}
                label={t("stats.dailyNodeTraffic")}
              />
            )
          })()}
          <Stat
            target={metrics?.requestCount ?? 0}
            suffix=""
            label={t("stats.monthlyRequests")}
          />
          <Stat
            target={metrics?.totalUsers ?? 0}
            suffix=""
            label={t("stats.totalUsers")}
          />
        </div>
      </section>

      <section
        id="features"
        className="py-20 px-5 sm:px-8"
        style={{ background: "#0d0d12" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-3">
              {t("features.eyebrow")}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t("features.title")}
              <br />
              <span className="text-zinc-500">{t("features.titleMuted")}</span>
            </h2>
          </div>
          <FeaturesGrid items={features} />
        </div>
      </section>

      <section
        id="pricing"
        className="py-20 px-5 sm:px-8"
        style={{ background: "#0d0d12" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-3">
              {t("pricing.eyebrow")}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
              {t("pricing.title")}
            </h2>
            <p className="text-zinc-500 text-sm mb-6">
              {t("pricing.subtitle")}
            </p>
            <p className="text-xs text-zinc-600 mb-8">{t("pricing.taxNote")}</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => {
              const href = plan.href ?? "/register"
              const isExternal =
                href.startsWith("http") || href.startsWith("mailto:")

              return (
                <div
                  key={plan.name}
                  className="relative rounded-2xl p-6 flex flex-col"
                  style={{
                    background: plan.highlight
                      ? "linear-gradient(135deg,rgba(139,92,246,0.15) 0%,rgba(99,102,241,0.08) 100%)"
                      : "rgba(255,255,255,0.02)",
                    border: plan.highlight
                      ? "1px solid rgba(139,92,246,0.35)"
                      : "1px solid rgba(255,255,255,0.06)",
                    boxShadow: plan.highlight
                      ? "0 0 40px rgba(139,92,246,0.08)"
                      : "none",
                  }}
                >
                  <p className="text-sm font-semibold text-zinc-300 mb-3">
                    {plan.name}
                  </p>

                  <div className="text-3xl font-bold mb-2">
                    {plan.priceLabel}
                  </div>

                  <p className="text-xs text-zinc-500 mb-5">{plan.desc}</p>

                  {isExternal ? (
                    <a
                      href={href}
                      className="block text-center text-sm font-semibold py-2.5 rounded-xl mb-6 transition-all"
                      style={
                        plan.highlight
                          ? { background: "#7c3aed", color: "white" }
                          : {
                              background: "rgba(255,255,255,0.07)",
                              color: "white",
                              border: "1px solid rgba(255,255,255,0.08)",
                            }
                      }
                    >
                      {plan.cta}
                    </a>
                  ) : (
                    <Link
                      href={href}
                      className="block text-center text-sm font-semibold py-2.5 rounded-xl mb-6 transition-all"
                      style={
                        plan.highlight
                          ? { background: "#7c3aed", color: "white" }
                          : {
                              background: "rgba(255,255,255,0.07)",
                              color: "white",
                              border: "1px solid rgba(255,255,255,0.08)",
                            }
                      }
                    >
                      {plan.cta}
                    </Link>
                  )}

                  <ul className="space-y-2.5 mt-auto">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2.5 text-sm text-zinc-400"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          className="flex-shrink-0"
                        >
                          <circle
                            cx="7"
                            cy="7"
                            r="6.5"
                            stroke="rgba(139,92,246,0.3)"
                          />
                          <path
                            d="M4 7l2 2 4-4"
                            stroke="#a78bfa"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </section>

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
                const duration = 18 + i * 0.4
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
                )
              })}

              {/* TUNNEL DOTS — orbit counter-clockwise on outer ring */}
              {showTunnelStats &&
                Array.from({ length: tunnelCount }, (_, i) => {
                  const isActive = i < tunnelActive
                  const color = isActive ? "#38bdf8" : "#f87171"
                  const duration = 28 + i * 0.3
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
                  )
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

      <section
        id="faq"
        className="py-20 px-5 sm:px-8"
        style={{ background: "#0d0d12" }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-3">
              {t("faq.eyebrow")}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t("faq.title")}
            </h2>
          </div>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden transition-all"
                style={{
                  background:
                    openFaq === i
                      ? "rgba(139,92,246,0.05)"
                      : "rgba(255,255,255,0.02)",
                  border:
                    openFaq === i
                      ? "1px solid rgba(139,92,246,0.2)"
                      : "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <button
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span
                    className={`text-sm font-medium transition-colors ${
                      openFaq === i ? "text-white" : "text-zinc-300"
                    }`}
                  >
                    {faq.q}
                  </span>
                  <span
                    className="flex-shrink-0 transition-transform duration-200 text-zinc-500"
                    style={{
                      transform: openFaq === i ? "rotate(45deg)" : "none",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="M7 1v12M1 7h12" />
                    </svg>
                  </span>
                </button>
                <div
                  style={{
                    maxHeight: openFaq === i ? "200px" : 0,
                    overflow: "hidden",
                    transition: "max-height 0.28s ease",
                  }}
                >
                  <p
                    className="px-5 pb-5 text-sm text-zinc-400 leading-relaxed"
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      paddingTop: 16,
                    }}
                  >
                    {faq.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-28 px-5 text-center relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 50%,rgba(139,92,246,0.1) 0%,transparent 70%)",
          }}
        />
        <div className="relative z-10 max-w-xl mx-auto">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
            {t("finalCta.titleLine1")}
            <br />
            {t("finalCta.titleLine2")}
          </h2>
          <p className="text-zinc-400 mb-10">{t("finalCta.subtitle")}</p>

          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2.5 bg-white text-black font-bold text-base px-8 py-4 rounded-xl hover:bg-zinc-50 active:scale-[0.98] transition-all shadow-2xl shadow-black/30"
          >
            {t("finalCta.cta")}
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M3 7.5h9M9 4l3.5 3.5L9 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>

          <p className="text-xs text-zinc-600 mt-4">{t("finalCta.note")}</p>
        </div>
      </section>

      <footer
        className="px-5 sm:px-8 py-12"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.05)",
          background: "#0d0d12",
        }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img
                  src="/assets/icons/logo.png"
                  alt={t("brand")}
                  width={24}
                  height={24}
                  className="h-6 w-6"
                />
                <span className="font-semibold text-sm">{t("brand")}</span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                {t("footer.tagline")}
              </p>
              <a
                href="mailto:contact@ecli.app"
                className="inline-block mt-3 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                {t("footer.contact")}
              </a>
            </div>

            {[
              {
                title: t("footer.columns.product"),
                links: [
                  { l: t("footer.links.features"), h: "#features" },
                  { l: t("footer.links.pricing"), h: "#pricing" },
                  { l: t("footer.links.network"), h: "#network" },
                  { l: t("footer.links.status"), h: "/status" },
                ],
              },
              {
                title: t("footer.columns.developers"),
                links: [
                  { l: t("footer.links.docs"), h: "/docs" },
                  {
                    l: t("footer.links.api"),
                    h: "https://backend.ecli.app/openapi",
                  },
                  {
                    l: t("footer.links.github"),
                    h: "https://github.com/thenoname-gurl/EcliPanel",
                  },
                  { l: t("footer.links.changelog"), h: "/changelog" },
                ],
              },
              {
                title: t("footer.columns.legal"),
                links: [
                  { l: t("footer.links.terms"), h: "/legal/terms-of-service" },
                  {
                    l: t("footer.links.privacy"),
                    h: "/legal/privacy-policy",
                  },
                  {
                    l: t("footer.links.cookies"),
                    h: "/legal/cookies-policy",
                  },
                  {
                    l: t("footer.links.acceptable"),
                    h: "/legal/acceptable-use-policy",
                  },
                  { l: t("footer.links.imprint"), h: "/legal/imprint" },
                ],
              },
            ].map((col) => (
              <div key={col.title}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-4">
                  {col.title}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map(({ l, h }) => (
                    <li key={l}>
                      <a
                        href={h}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        {...(h.startsWith("http")
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div
            className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-8"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
          >
            <p className="text-xs text-zinc-700">
              {t("footer.copyright", { year: new Date().getFullYear() })}
            </p>
            <p className="text-xs text-zinc-700">{t("footer.byline")}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}