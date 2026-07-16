"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"
import { BarChart3, RefreshCw, TrendingUp, Users, Building2, MessageSquare, Receipt, Server, MousePointerClick, Eye, Trash2 } from "lucide-react"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts"

type WindowDays = 7 | 30 | 90 | 180

// ─── Metrics types ───────────────────────────────────────────────────────────

interface MetricsPoint {
  date: string
  registrations: number
  cumulativeRegistrations: number
  organisations: number
  tickets: number
  orders: number
  serverActions: number
  verifications: number
  deletions: number
  abuseReports: number
}

interface MetricsSummary {
  totalUsers: number; totalOrganisations: number; totalServers: number
  totalTickets: number; totalOrders: number
  serversOnline: number; serversTransitioning: number; serversOffline: number
  registrationsCurrent: number; registrationsPrevious: number; registrationGrowthPercent: number
  organisationsCurrent: number; organisationsPrevious: number; organisationGrowthPercent: number
  ticketsCurrent: number; ordersCurrent: number; serverActions: number; abuseReports: number
  totalVerifications: number; totalDeletions: number
}

interface MetricsResponse {
  window: { days: number; start: string; end: string }
  summary: MetricsSummary
  series: MetricsPoint[]
}

// ─── Telemetry types ─────────────────────────────────────────────────────────

interface TelemetryPoint { date: string; events: number }
interface TopItem { event: string; category: string | null; count: number }
interface TopPage { path: string; count: number }

interface TelemetryResponse {
  window: { days: number; start: string; end: string }
  summary: { totalEvents: number; uniqueUsers: number }
  topEvents: TopItem[]
  topPages: TopPage[]
  series: TelemetryPoint[]
}

const WINDOW_OPTIONS: WindowDays[] = [7, 30, 90, 180]

const CHART_COLORS = {
  registrations: "#2563eb", organisations: "#7c3aed", tickets: "#f97316",
  orders: "#14b8a6", serverOnline: "#22c55e", serverTransitioning: "#f59e0b",
  serverOffline: "#ef4444", serverActions: "#8b5cf6", abuseReports: "#ef4444",
  verifications: "#06b6d4", deletions: "#f43f5e",
}

const TELEMETRY_BAR_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#2563eb", "#7c3aed", "#c026d3",
]

function formatDayLabel(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function formatDelta(value: number) {
  if (!Number.isFinite(value)) return "0%"
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
}

function SharedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1.5">{formatDayLabel(String(label))}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="text-xs flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="font-mono text-foreground">{Number(entry.value || 0).toLocaleString()}</span>
        </p>
      ))}
    </div>
  )
}

export default function MetricsTab() {
  const t = useTranslations("adminMetricsTab")
  const [windowDays, setWindowDays] = useState<WindowDays>(30)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [clearing, setClearing] = useState(false)

  // ─── Telemetry state ───
  const [telemetryLoading, setTelemetryLoading] = useState(true)
  const [telemetryData, setTelemetryData] = useState<TelemetryResponse | null>(null)
  const [clearingTelemetry, setClearingTelemetry] = useState(false)

  const load = useCallback(async (days: WindowDays, initial = false) => {
    if (initial) { setLoading(true); setTelemetryLoading(true) }
    else setRefreshing(true)
    setError("")
    try {
      const [metrics, telemetry] = await Promise.all([
        apiFetch(`${API_ENDPOINTS.adminMetrics}?days=${days}`),
        apiFetch(`${API_ENDPOINTS.adminTelemetry}?days=${days}`),
      ])
      setData(metrics)
      setTelemetryData(telemetry)
    } catch (e: any) {
      setError(e?.message || t("errors.loadFailed"))
    } finally {
      setLoading(false)
      setTelemetryLoading(false)
      setRefreshing(false)
    }
  }, [t])

  useEffect(() => { load(windowDays, true) }, [windowDays, load])

  const clearCollectedMetrics = useCallback(async () => {
    if (!confirm(t("actions.confirmClear"))) return
    setClearing(true)
    setError("")
    try {
      await apiFetch(API_ENDPOINTS.adminMetricsClear, { method: "POST" })
      await load(windowDays, false)
    } catch (e: any) {
      setError(e?.message || t("errors.clearFailed"))
    } finally { setClearing(false) }
  }, [load, t, windowDays])

  const clearTelemetry = useCallback(async () => {
    if (!confirm("Delete all telemetry data? This cannot be undone.")) return
    setClearingTelemetry(true)
    setError("")
    try {
      await apiFetch(API_ENDPOINTS.adminTelemetryClear, { method: "POST" })
      await load(windowDays, false)
    } catch (e: any) {
      setError(e?.message || "Failed to clear telemetry data")
    } finally { setClearingTelemetry(false) }
  }, [load, windowDays])

  const summary = data?.summary
  const series = useMemo(() => data?.series || [], [data])
  const tSummary = telemetryData?.summary
  const tSeries = useMemo(() => telemetryData?.series || [], [telemetryData])

  const serverStatusData = useMemo(() => [
    { name: t("serverStatus.online"), value: summary?.serversOnline || 0, fill: CHART_COLORS.serverOnline },
    { name: t("serverStatus.transitioning"), value: summary?.serversTransitioning || 0, fill: CHART_COLORS.serverTransitioning },
    { name: t("serverStatus.offline"), value: summary?.serversOffline || 0, fill: CHART_COLORS.serverOffline },
  ], [summary, t])

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div className="border border-border bg-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">{t("header.title")}</p>
            <span className="text-xs text-muted-foreground">{t("header.lastDays", { days: windowDays })}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 border border-border bg-secondary/40 p-1">
              {WINDOW_OPTIONS.map((d) => (
                <button key={d} onClick={() => setWindowDays(d)}
                  className={`px-2.5 py-1 text-xs transition-colors ${windowDays === d ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >{d}d</button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="border-border" onClick={() => load(windowDays, false)} disabled={loading || refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "rounded-full animate-spin" : ""}`} />
              {t("actions.refresh")}
            </Button>
            <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={clearCollectedMetrics} disabled={loading || refreshing || clearing}>
              {clearing ? t("actions.clearing") : t("actions.clearCollectedMetrics")}
            </Button>
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">{t("cards.users.title")}</span><Users className="h-3.5 w-3.5 text-muted-foreground" /></div>
          <p className="text-xl font-mono font-semibold text-foreground">{summary ? summary.totalUsers.toLocaleString() : t("common.dash")}</p>
          <p className="text-xs text-muted-foreground mt-1">{summary ? t("cards.users.new", { count: summary.registrationsCurrent }) : ""}</p>
        </div>
        <div className="border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">{t("cards.registrationGrowth.title")}</span><TrendingUp className="h-3.5 w-3.5 text-muted-foreground" /></div>
          <p className={`text-xl font-mono font-semibold ${summary && summary.registrationGrowthPercent < 0 ? "text-destructive" : "text-foreground"}`}>{summary ? formatDelta(summary.registrationGrowthPercent) : t("common.dash")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("cards.registrationGrowth.vsPrevious", { days: windowDays })}</p>
        </div>
        <div className="border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">{t("cards.organisations.title")}</span><Building2 className="h-3.5 w-3.5 text-muted-foreground" /></div>
          <p className="text-xl font-mono font-semibold text-foreground">{summary ? summary.totalOrganisations.toLocaleString() : t("common.dash")}</p>
          <p className="text-xs text-muted-foreground mt-1">{summary ? t("cards.organisations.new", { count: summary.organisationsCurrent }) : ""}</p>
        </div>
        <div className="border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">{t("cards.supportOrders.title")}</span><MessageSquare className="h-3.5 w-3.5 text-muted-foreground" /></div>
          <p className="text-xl font-mono font-semibold text-foreground">{summary ? `${summary.ticketsCurrent.toLocaleString()} / ${summary.ordersCurrent.toLocaleString()}` : t("common.dash")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("cards.supportOrders.subtitle")}</p>
        </div>
        <div className="border border-border bg-card p-3 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">{t("cards.servers.title")}</span><Server className="h-3.5 w-3.5 text-muted-foreground" /></div>
          <p className="text-xl font-mono font-semibold text-foreground">{summary ? summary.totalServers.toLocaleString() : t("common.dash")}</p>
          <p className="text-xs text-muted-foreground mt-1">{summary ? t("cards.servers.subtitle", { online: summary.serversOnline, moving: summary.serversTransitioning, offline: summary.serversOffline }) : ""}</p>
        </div>
      </div>

      {/* ── Telemetry cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">UI Events</span><MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" /></div>
          <p className="text-xl font-mono font-semibold text-foreground">{tSummary ? tSummary.totalEvents.toLocaleString() : "—"}</p>
        </div>
        <div className="border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">Tracked Users</span><Users className="h-3.5 w-3.5 text-muted-foreground" /></div>
          <p className="text-xl font-mono font-semibold text-foreground">{tSummary ? tSummary.uniqueUsers.toLocaleString() : "—"}</p>
        </div>
        <div className="border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">Avg Events / User</span><TrendingUp className="h-3.5 w-3.5 text-muted-foreground" /></div>
          <p className="text-xl font-mono font-semibold text-foreground">{tSummary && tSummary.uniqueUsers > 0 ? (tSummary.totalEvents / tSummary.uniqueUsers).toFixed(1) : "—"}</p>
        </div>
      </div>

      {/* ── User registrations chart ── */}
      <div className="border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3"><Users className="h-4 w-4 text-muted-foreground" /><p className="text-sm font-semibold text-foreground">{t("charts.userRegistrations")}</p></div>
        {loading ? <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">{t("charts.loading")}</div> : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <defs><linearGradient id="registrationsGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS.registrations} stopOpacity={0.36} /><stop offset="95%" stopColor={CHART_COLORS.registrations} stopOpacity={0.03} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDayLabel} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={38} />
                <Tooltip content={<SharedTooltip />} />
                <Area type="monotone" dataKey="registrations" name={t("charts.legend.registrations")} stroke={CHART_COLORS.registrations} fill="url(#registrationsGrad)" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Platform activity chart ── */}
      <div className="border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3"><Receipt className="h-4 w-4 text-muted-foreground" /><p className="text-sm font-semibold text-foreground">{t("charts.platformActivity")}</p></div>
        {loading ? <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">{t("charts.loading")}</div> : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 50, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDayLabel} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis yAxisId="left" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={38} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: CHART_COLORS.serverActions, fontSize: 11 }} tickLine={false} axisLine={false} width={42} />
                <Tooltip content={<SharedTooltip />} /><Legend />
                <Line yAxisId="left" type="monotone" dataKey="organisations" name={t("charts.legend.organisations")} stroke={CHART_COLORS.organisations} strokeWidth={2.5} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="tickets" name={t("charts.legend.tickets")} stroke={CHART_COLORS.tickets} strokeWidth={2.5} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="orders" name={t("charts.legend.orders")} stroke={CHART_COLORS.orders} strokeWidth={2.5} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="verifications" name="KYC" stroke={CHART_COLORS.verifications} strokeWidth={2.5} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="deletions" name="Deletions" stroke={CHART_COLORS.deletions} strokeWidth={2.5} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="serverActions" name="Server Actions" stroke={CHART_COLORS.serverActions} strokeWidth={2.5} dot={false} strokeDasharray="6 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Server status chart ── */}
      <div className="border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3"><Server className="h-4 w-4 text-muted-foreground" /><p className="text-sm font-semibold text-foreground">{t("charts.serverStatusLive")}</p></div>
        {loading ? <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">{t("charts.loading")}</div> : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serverStatusData} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={38} />
                <Tooltip content={<SharedTooltip />} />
                <Bar dataKey="value" name={t("cards.servers.title")} radius={[6, 6, 0, 0]}>
                  {serverStatusData.map((entry) => (<Cell key={entry.name} fill={entry.fill} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ═══════════ TELEMETRY SECTION ═══════════ */}

      <div className="border-t-2 border-border/50 pt-2 mt-2">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">User Interaction Telemetry</p>
          </div>
          <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={clearTelemetry} disabled={loading || refreshing || clearingTelemetry}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {clearingTelemetry ? "Clearing..." : "Clear Telemetry"}
          </Button>
        </div>
      </div>

      {/* ── Telemetry daily volume ── */}
      <div className="border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3"><BarChart3 className="h-4 w-4 text-muted-foreground" /><p className="text-sm font-semibold text-foreground">Daily UI Event Volume</p></div>
        {telemetryLoading ? <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Loading...</div> : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tSeries} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <defs><linearGradient id="telemetryGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.36} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0.03} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDayLabel} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={38} />
                <Tooltip content={<SharedTooltip />} />
                <Area type="monotone" dataKey="events" name="Events" stroke="#6366f1" fill="url(#telemetryGrad)" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Top events + Top pages ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3"><MousePointerClick className="h-4 w-4 text-muted-foreground" /><p className="text-sm font-semibold text-foreground">Top Events</p></div>
          {telemetryLoading ? <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">Loading...</div>
          : !telemetryData?.topEvents?.length ? <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
          : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={telemetryData.topEvents.slice(0, 15)} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="event" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} width={120} />
                  <Tooltip content={<SharedTooltip />} />
                  <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                    {telemetryData.topEvents.slice(0, 15).map((_, i) => (<Cell key={i} fill={TELEMETRY_BAR_COLORS[i % TELEMETRY_BAR_COLORS.length]} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3"><Eye className="h-4 w-4 text-muted-foreground" /><p className="text-sm font-semibold text-foreground">Top Pages</p></div>
          {telemetryLoading ? <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">Loading...</div>
          : !telemetryData?.topPages?.length ? <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
          : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={telemetryData.topPages.slice(0, 15)} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="path" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} width={140} />
                  <Tooltip content={<SharedTooltip />} />
                  <Bar dataKey="count" name="Page Views" radius={[0, 4, 4, 0]}>
                    {telemetryData.topPages.slice(0, 15).map((_, i) => (<Cell key={i} fill={TELEMETRY_BAR_COLORS[i % TELEMETRY_BAR_COLORS.length]} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
