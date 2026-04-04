"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { RefreshCw, Server, Activity, Globe } from "lucide-react"
import { useTranslations } from "next-intl"

interface HeartbeatPoint {
  timestamp: string
  responseMs: number | null
  status: string
}

interface WingNodeSummary {
  uptime_pct: number
  avg_ms: number | null
  total_checks: number
  okCount: number
  timeoutCount: number
  errorCount: number
}

interface WingNode {
  id: number
  name: string
  url: string
  window: string
  points: HeartbeatPoint[]
  summary: WingNodeSummary
}

interface PublicWingsResponse {
  window: string
  generatedAt: string
  nodes: WingNode[]
  summary: { total_nodes: number; total_checks: number; average_uptime_pct: number }
}

function BinaryStrip() {
  const [binary, setBinary] = useState("")

  useEffect(() => {
    const chars = "01"
    let str = ""
    for (let i = 0; i < 200; i++) {
      str += chars[Math.floor(Math.random() * chars.length)]
    }
    setBinary(str)
  }, [])

  return (
    <div className="overflow-hidden py-4 text-[10px] font-mono text-purple-500/30 select-none">
      {binary}
    </div>
  )
}

function TerminalBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-purple-500/20 bg-black/60 p-3 sm:p-4 font-mono text-xs sm:text-sm backdrop-blur-sm overflow-x-auto">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-red-500 flex-shrink-0" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-yellow-500 flex-shrink-0" />
        <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-green-500 flex-shrink-0" />
        <span className="ml-2 text-xs text-purple-400/60 whitespace-nowrap">Terminal</span>
      </div>
      {children}
    </div>
  )
}

// Helper function to get uptime color class
function getUptimeColorClass(uptime: number): string {
  if (uptime >= 97) return 'text-emerald-400'
  if (uptime >= 95) return 'text-yellow-400'
  return 'text-red-400'
}

// Helper function to get uptime color hex
function getUptimeColorHex(uptime: number): string {
  if (uptime >= 97) return '#34d399'
  if (uptime >= 95) return '#facc15'
  return '#f87171'
}

function NodeSparkline({ data, compact = true }: { data: HeartbeatPoint[]; compact?: boolean }) {
  const W = 300
  const H = compact ? 38 : 88
  const pts = compact ? data.slice(-120) : data
  const last = pts[pts.length - 1]
  const recent5 = pts.slice(-5)
  const isOffline = !last || last.status !== "ok"
  const isDegraded = !isOffline && recent5.some((p) => p.status !== "ok")
  const statusColor = isOffline ? "#ef4444" : isDegraded ? "#eab308" : "#22c55e"
  const statusText = isOffline ? "Offline" : isDegraded ? "Degraded" : "Online"
  const statusTextClass = isOffline ? "text-red-400" : isDegraded ? "text-yellow-400" : "text-emerald-400"
  const validMs = pts.filter((p) => p.responseMs != null).map((p) => p.responseMs!)
  const maxMs = Math.max(...validMs, 100)
  let path = ""

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (p.responseMs == null) continue
    const x = pts.length <= 1 ? W / 2 : (i / (pts.length - 1)) * W
    const y = H - (p.responseMs / maxMs) * (H - 8) - 4
    path += i > 0 && pts[i - 1].responseMs != null ? `L${x.toFixed(1)},${y.toFixed(1)} ` : `M${x.toFixed(1)},${y.toFixed(1)} `
  }

  const uptimePct = pts.length > 0 ? Math.round((pts.filter((p) => p.status === "ok").length / pts.length) * 1000) / 10 : 100

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
          <span className={`font-mono text-xs font-medium ${statusTextClass}`}>{statusText}</span>
          {last?.responseMs != null && <span className="font-mono text-xs text-purple-400/60">{last.responseMs}ms</span>}
        </div>
        <span className={`font-mono text-xs ${getUptimeColorClass(uptimePct)}`}>{uptimePct}% up</span>
      </div>

      {pts.length > 0 ? (
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="rounded overflow-hidden block">
          <rect width={W} height={H} rx="2" fill="rgba(10,15,30,0.7)" />
          {pts.map((p, i) => {
            if (p.status === "ok") return null
            const x = pts.length <= 1 ? W / 2 : (i / (pts.length - 1)) * W
            return (
              <rect
                key={i}
                x={Math.max(0, x - 1.5)}
                y={0}
                width={3}
                height={H}
                fill={p.status === "timeout" ? "rgba(234,179,8,0.4)" : "rgba(239,68,68,0.45)"}
              />
            )
          })}
          {path && <path d={path.trim()} fill="none" stroke="rgba(168,85,247,0.9)" strokeWidth="2" />}
        </svg>
      ) : (
        <div className="h-9 rounded border border-purple-500/20 bg-black/40 flex items-center justify-center font-mono text-xs text-purple-400/60">No data</div>
      )}
    </div>
  )
}

export default function WingsStatusPage() {
  const t = useTranslations("wingsPage")
  const [status, setStatus] = useState<PublicWingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await fetch('/public/wings?window=7d')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (mounted) setStatus(data)
      } catch (e: any) {
        if (mounted) setError(e?.message || t('errors.fetchFailed'))
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchData()
    const iv = setInterval(fetchData, 60_000)
    return () => { mounted = false; clearInterval(iv) }
  }, [t])

  return (
    <main className="relative min-h-screen bg-[#0a0a0a] text-white">
      {/* Background effects - exactly like landing */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.1)_0px,rgba(0,0,0,0.1)_1px,transparent_1px,transparent_2px)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(168,85,247,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.15),transparent_50%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(147,51,234,0.1),transparent_50%)]" />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10">
        {/* Header - exactly like landing */}
        <header className="mb-8 flex items-center justify-between border-b border-purple-500/20 pb-4 flex-wrap sm:flex-nowrap gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center">
              <img src="/assets/icons/logo.png" alt="Eclipse Systems" className="h-6 w-6 sm:h-8 sm:w-8 object-contain" />
            </div>
            <span className="font-mono text-sm sm:text-xl font-bold tracking-tight text-purple-400">
              {t("brand")}
            </span>
          </div>
          <nav className="hidden gap-6 font-mono text-xs sm:text-sm text-purple-400/70 md:flex">
            <Link href="/" className="transition-colors hover:text-purple-300">{t("nav.home")}</Link>
            <Link href="/#features" className="transition-colors hover:text-purple-300">{t("nav.features")}</Link>
            <Link href="/#pricing" className="transition-colors hover:text-purple-300">{t("nav.pricing")}</Link>
            <Link href="/dashboard" className="transition-colors hover:text-purple-300">{t("nav.dashboard")}</Link>
          </nav>
        </header>

        {/* Page Title */}
        <section className="mb-8 text-center">
          <h1 className="mb-4 font-mono text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter">
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              {t("hero.title")}
            </span>
          </h1>
          <p className="mx-auto mb-6 max-w-xl font-mono text-sm sm:text-base text-purple-400/80 px-4">
            {t("hero.prefix")} <span className="text-pink-400">{t("hero.highlight")}</span> {t("hero.suffix")}
          </p>
        </section>

        {/* Terminal Block with status */}
        <section className="mb-8">
          <TerminalBlock>
            <div className="text-purple-400">
              <p className="text-gray-500">eclipse@systems ~ % ./status --nodes</p>
              <p className="mt-2">
                <span className="text-pink-400">{t("terminal.window")}</span> {status?.window ?? '7d'}
              </p>
              <p>
                <span className="text-pink-400">{t("terminal.nodes")}</span>{' '}
                <span className="text-purple-400">{status?.summary.total_nodes ?? '...'}</span>
              </p>
              <p>
                <span className="text-pink-400">{t("terminal.avgUptime")}</span>{' '}
                <span className={getUptimeColorClass(status?.summary.average_uptime_pct ?? 0)}>
                  {status?.summary.average_uptime_pct?.toFixed(1) ?? '...'}%
                </span>
              </p>
              <p>
                <span className="text-pink-400">{t("terminal.totalChecks")}</span>{' '}
                <span className="text-purple-400">{status?.summary.total_checks ? new Intl.NumberFormat().format(status.summary.total_checks) : '...'}</span>
              </p>
              <p className="mt-1 text-xs text-purple-400/60">
                {loading ? t('states.loading') : error ? `${t('states.error')}: ${error}` : `${t('states.updated')}: ${new Date(status?.generatedAt || '').toLocaleString()}`}
              </p>
            </div>
          </TerminalBlock>
        </section>

        <BinaryStrip />

        {/* Stats Grid */}
        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400">{t("overview.title")}</h2>
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-3 sm:p-4 text-center backdrop-blur-sm">
              <p className="font-mono text-xs text-purple-400/60">{t("overview.window")}</p>
              <p className="mt-1 font-mono text-xl sm:text-2xl font-bold text-white">{status?.window ?? '7d'}</p>
            </div>
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-3 sm:p-4 text-center backdrop-blur-sm">
              <p className="font-mono text-xs text-purple-400/60">{t("overview.nodes")}</p>
              <p className="mt-1 font-mono text-xl sm:text-2xl font-bold text-white">{status?.summary.total_nodes ?? '-'}</p>
            </div>
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-3 sm:p-4 text-center backdrop-blur-sm">
              <p className="font-mono text-xs text-purple-400/60">{t("overview.avgUptime")}</p>
              <p className={`mt-1 font-mono text-xl sm:text-2xl font-bold ${getUptimeColorClass(status?.summary.average_uptime_pct ?? 0)}`}>
                {status?.summary.average_uptime_pct?.toFixed(1) ?? '-'}%
              </p>
            </div>
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-3 sm:p-4 text-center backdrop-blur-sm">
              <p className="font-mono text-xs text-purple-400/60">{t("overview.totalChecks")}</p>
              <p className="mt-1 font-mono text-xl sm:text-2xl font-bold text-white">{status?.summary.total_checks ? new Intl.NumberFormat().format(status.summary.total_checks) : '-'}</p>
            </div>
          </div>
        </section>

        <BinaryStrip />

        {/* Refresh Button */}
        <div className="mb-4 flex items-center gap-2 font-mono text-xs text-purple-400/60">
          <Activity className="h-4 w-4" />
          <span>{loading ? t('states.loading') : error ? `${t('states.error')}: ${error}` : `${t('states.lastUpdated')}: ${new Date(status?.generatedAt || '').toLocaleString()}`}</span>
          <button
            onClick={() => window.location.reload()}
            className="ml-auto rounded border border-purple-500/30 px-3 py-1.5 font-mono text-xs text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400 hover:bg-purple-500/10"
          >
            <RefreshCw className="inline h-3 w-3 mr-1" /> {t("actions.refresh")}
          </button>
        </div>

        {/* Node Cards */}
        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400">{t("nodes.title")}</h2>

          {status?.nodes?.length === 0 && !loading && !error && (
            <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 text-center font-mono text-sm text-purple-400/60 backdrop-blur-sm">
              {t("nodes.empty")}
            </div>
          )}

          <div className="space-y-4">
            {status?.nodes?.map((node) => (
              <div key={node.id} className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm transition-all hover:border-purple-500/40">
                <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                  <div>
                    <div className="flex items-center gap-2 font-mono text-base sm:text-lg font-bold text-purple-400">
                      <Server className="h-4 w-4 sm:h-5 sm:w-5 text-pink-400" />
                      {node.name || `Node ${node.id}`}
                    </div>
                    <p className="font-mono text-xs text-purple-400/60">{node.url}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs text-purple-400/60">{t("nodes.uptime")}</p>
                    <p className={`font-mono text-xl sm:text-2xl font-bold ${getUptimeColorClass(node.summary.uptime_pct)}`}>
                      {node.summary.uptime_pct}%
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <NodeSparkline data={node.points} compact={false} />
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                  <div className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-purple-400/80">
                    <span className="text-emerald-400">{t("nodes.ok")}</span> {node.summary.okCount}
                  </div>
                  <div className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-purple-400/80">
                    <span className="text-yellow-400">{t("nodes.timeout")}</span> {node.summary.timeoutCount}
                  </div>
                  <div className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-purple-400/80">
                    <span className="text-red-400">{t("nodes.error")}</span> {node.summary.errorCount}
                  </div>
                  <div className="rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-purple-400/80">
                    <span className="text-pink-400">{t("nodes.avgMs")}</span> {node.summary.avg_ms ?? '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <BinaryStrip />

        {/* Public Export Info */}
        <section className="mb-8">
          <h2 className="mb-4 sm:mb-6 font-mono text-xl sm:text-2xl md:text-3xl font-bold text-purple-400">{t("api.title")}</h2>
          <div className="rounded-lg border border-purple-500/20 bg-black/40 p-4 sm:p-6 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3 font-mono text-sm text-pink-400">
              <Globe className="h-4 w-4" /> {t("api.export")}
            </div>
            <p className="font-mono text-xs sm:text-sm text-purple-400/60 leading-relaxed">
              {t("api.prefix")}{' '}
              <code className="rounded border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-pink-400">
                /public/wings?window=7d
              </code>
            </p>
            <p className="mt-2 font-mono text-xs text-purple-400/60">
              {t("api.note")}
            </p>
          </div>
        </section>

        <BinaryStrip />

        {/* CTA */}
        <section className="mb-8 text-center">
          <h2 className="mb-3 sm:mb-4 font-mono text-lg sm:text-xl md:text-2xl font-bold text-purple-400">{t("cta.title")}</h2>
          <p className="mb-4 sm:mb-6 font-mono text-xs sm:text-sm text-purple-400/60 px-2">
            {t("cta.subtitle")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/register"
              className="rounded border border-purple-500 bg-purple-500/10 px-6 py-2.5 font-mono font-semibold text-purple-400 transition-all hover:bg-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
            >
              {t("cta.register")}
            </Link>
            <Link
              href="/dashboard"
              className="rounded border border-purple-500/30 px-6 py-2.5 font-mono font-semibold text-purple-400/70 transition-all hover:border-purple-500/50 hover:text-purple-400"
            >
              {t("cta.dashboard")}
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="rounded-lg border border-purple-500/20 bg-black/40 p-6 backdrop-blur-sm">
          <p className="font-mono text-xs text-purple-400/50">
            {t("footer.needHelp")} {" "}
            <a href="mailto:contact@ecli.app" className="text-pink-400 hover:underline">
              contact@ecli.app
            </a>{" "}
            {t("footer.orGoTo")} {" "}
            <Link href="/dashboard" className="text-pink-400 hover:underline">
              {t("footer.dashboard")}
            </Link>.
          </p>
        </footer>
      </div>
    </main>
  )
}