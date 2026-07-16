"use client"

import { useCallback, useEffect, useState, lazy, Suspense } from "react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { DEFAULT_EDITOR_SETTINGS } from "@/lib/editor-settings"

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })))
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  Shield, ShieldAlert, AlertTriangle, AlertCircle,
  Bug, RefreshCw, ScanLine, Search, ChevronLeft, ChevronRight,
  Check, CheckCircle, Flag, Send, Clock, Server, User, Globe,
  Activity, BarChart3, Zap, Brain, EyeOff, Trash2, Siren,
  TrendingUp, Settings2, FileSearch, Network, ChevronDown,
  X, Lightbulb,
} from "lucide-react"
import AntiAbuseTab from "./AntiAbuseTab"

type Finding = {
  id: number; title: string; description: string; severity: string
  category: string; source: string; sourceName?: string
  serverId?: string; nodeId?: number; userId?: number
  status: string; metadata?: any; detectedAt: string
  resolvedAt?: string; resolvedByUserId?: number
}

type ScanResult = {
  created: number; resolved: number; totalOpen: number
  timestamp?: string
}

type EventLogEntry = {
  id: number; action: string; targetId?: string; targetType?: string
  userId?: number; timestamp: string; metadata?: any
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const severityConfig: Record<string, {
  border: string; bg: string; text: string; badge: string; dot: string; row: string
}> = {
  critical: {
    border: "border-red-500/40", bg: "bg-red-500/8", text: "text-red-500",
    badge: "bg-red-500/15 text-red-500 border-red-500/30",
    dot: "bg-red-500", row: "border-l-red-500"
  },
  high: {
    border: "border-orange-500/40", bg: "bg-orange-500/8", text: "text-orange-500",
    badge: "bg-orange-500/15 text-orange-500 border-orange-500/30",
    dot: "bg-orange-500", row: "border-l-orange-500"
  },
  medium: {
    border: "border-yellow-500/40", bg: "bg-yellow-500/8", text: "text-yellow-500",
    badge: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
    dot: "bg-yellow-500", row: "border-l-yellow-500"
  },
  low: {
    border: "border-blue-500/40", bg: "bg-blue-500/8", text: "text-blue-500",
    badge: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    dot: "bg-blue-500", row: "border-l-blue-500"
  },
  info: {
    border: "border-slate-500/40", bg: "bg-slate-500/8", text: "text-slate-400",
    badge: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    dot: "bg-slate-400", row: "border-l-slate-400"
  },
}

const severityIcons: Record<string, typeof Shield> = {
  critical: ShieldAlert, high: AlertTriangle, medium: AlertCircle,
  low: Bug, info: Shield,
}

const TAB_CONFIG = [
  { id: "findings", label: "Findings", icon: ShieldAlert },
  { id: "events", label: "Event Log", icon: Activity },
  { id: "rules", label: "Rules", icon: FileSearch },
  { id: "incidents", label: "Incidents", icon: Siren },
  { id: "audit", label: "Admin Audit", icon: Clock },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "default" }: {
  label: string; value: string | number; sub?: string; color?: "red" | "orange" | "green" | "blue" | "default"
}) {
  const colors = {
    red: "border-red-500/20 bg-red-500/5",
    orange: "border-orange-500/20 bg-orange-500/5",
    green: "border-green-500/20 bg-green-500/5",
    blue: "border-blue-500/20 bg-blue-500/5",
    default: "border-border bg-card",
  }
  const textColors = {
    red: "text-red-500", orange: "text-orange-500",
    green: "text-green-500", blue: "text-blue-500", default: "text-foreground",
  }
  return (
    <div className={`border rounded p-3 flex flex-col gap-0.5 ${colors[color]}`}>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold font-mono ${textColors[color]}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ─── Action Button ─────────────────────────────────────────────────────────────

function ActionBtn({ onClick, title, icon: Icon, variant = "default" }: {
  onClick: (e: React.MouseEvent) => void; title: string
  icon: typeof Check; variant?: "default" | "success" | "warning" | "danger" | "muted"
}) {
  const styles = {
    default: "hover:bg-secondary/60 text-muted-foreground hover:text-foreground",
    success: "hover:bg-green-500/15 text-muted-foreground hover:text-green-500",
    warning: "hover:bg-orange-500/15 text-muted-foreground hover:text-orange-500",
    danger: "hover:bg-red-500/15 text-muted-foreground hover:text-red-500",
    muted: "hover:bg-secondary/60 text-muted-foreground/50 hover:text-muted-foreground",
  }
  return (
    <button
      onClick={(e) => { e.preventDefault(); onClick(e) }}
      title={title}
      className={`p-1.5 rounded transition-colors ${styles[variant]} min-w-[32px] min-h-[32px] flex items-center justify-center`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

// ─── Severity Badge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = severityConfig[severity]
  const Icon = severityIcons[severity] || Shield
  if (!cfg) return null
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cfg.badge}`}>
      <Icon className="h-2.5 w-2.5" />
      {severity}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SocTab() {
  const t = useTranslations("adminPage")
  const [tab, setTab] = useState<"findings" | "events" | "rules" | "incidents" | "settings" | "audit">("findings")
  const [findings, setFindings] = useState<Finding[]>([])
  const [findingsTotal, setFindingsTotal] = useState(0)
  const [findingsPage, setFindingsPage] = useState(1)
  const [findingsLoading, setFindingsLoading] = useState(true)
  const [events, setEvents] = useState<EventLogEntry[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [scanRunning, setScanRunning] = useState(false)
  const [lastScan, setLastScan] = useState<ScanResult | null>(null)
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [statusFilter, setStatusFilter] = useState("open")
  const [severityFilter, setSeverityFilter] = useState("")

  const fetchFindings = useCallback(async (page = 1) => {
    setFindingsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), perPage: "50" })
      if (statusFilter) params.set("status", statusFilter)
      if (severityFilter) params.set("severity", severityFilter)
      const data = await apiFetch(`${API_ENDPOINTS.socSecurityFindings}?${params}`)
      const items = data?.findings || []
      setFindings(items)
      setFindingsTotal(data?.total || 0)
      setFindingsPage(data?.page || page)
      setSummary(data?.summary || {})
      if (!lastScan && items.length > 0) {
        const newest = items.reduce((a: any, b: any) => new Date(a.detectedAt) > new Date(b.detectedAt) ? a : b)
        setLastScan({ created: 0, resolved: 0, totalOpen: data?.total || 0, timestamp: newest.detectedAt })
      }
    } catch { setFindings([]) }
    finally { setFindingsLoading(false) }
  }, [statusFilter, severityFilter])

  const silentFetch = useCallback(async (page = findingsPage) => {
    try {
      const params = new URLSearchParams({ page: String(page), perPage: "50" })
      if (statusFilter) params.set("status", statusFilter)
      if (severityFilter) params.set("severity", severityFilter)
      const data = await apiFetch(`${API_ENDPOINTS.socSecurityFindings}?${params}`)
      setFindings(data?.findings || [])
      setFindingsTotal(data?.total || 0)
      setSummary(data?.summary || {})
    } catch {}
  }, [statusFilter, severityFilter, findingsPage])

  useEffect(() => { fetchFindings(1) }, [fetchFindings])

  const fetchEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      const data = await apiFetch(`${API_ENDPOINTS.socSecurityFindings}?status=all&perPage=200`)
      const log: EventLogEntry[] = (data?.findings || []).map((f: Finding) => ({
        id: f.id,
        action: f.status === 'open' ? 'finding:detected' : `finding:${f.status}`,
        targetId: f.serverId || `finding-${f.id}`,
        targetType: f.serverId ? 'server' : 'finding',
        userId: f.userId,
        timestamp: f.detectedAt,
        metadata: { title: f.title, severity: f.severity, category: f.category, status: f.status },
      }))
      setEvents(log)
    } catch { setEvents([]) }
    finally { setEventsLoading(false) }
  }, [])

  useEffect(() => {
    if (tab === "events") fetchEvents()
  }, [tab, fetchEvents])

  const handleScan = async () => {
    setScanRunning(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.socSecurityScan, { method: "POST" })
      setLastScan({ ...data, timestamp: new Date().toISOString() })
      fetchFindings(findingsPage)
    } catch (e) { console.error("scan failed", e) }
    finally { setScanRunning(false) }
  }

  const handleUpdate = async (id: number, status: string) => {
    setFindings(prev => {
      if (statusFilter === 'open' && status !== 'open') return prev.filter(f => f.id !== id)
      return prev.map(f => f.id === id ? { ...f, status } : f)
    })
    try {
      await apiFetch(API_ENDPOINTS.socSecurityFindingDetail.replace(":id", String(id)), {
        method: "PATCH", body: JSON.stringify({ status }),
      })
    } catch {}
    silentFetch()
  }

  const handleEscalate = async (id: number) => {
    setFindings(prev => prev.map(f => f.id === id ? { ...f, status: 'internal_resolved' as any } : f))
    try {
      await apiFetch(`${API_ENDPOINTS.socSecurityFindingDetail.replace(":id", String(id))}/escalate`, {
        method: "POST", body: JSON.stringify({ action: "reviewed", note: "Staff reviewed" }),
      })
    } catch {}
    silentFetch()
  }

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Force delete finding #${id}: "${title}"?\n\nThis permanently removes the record. Only use for corrupted/stuck items.`)) return
    setFindings(prev => prev.filter(f => f.id !== id))
    try {
      await apiFetch(API_ENDPOINTS.socSecurityFindingDetail.replace(":id", String(id)), { method: "DELETE" })
    } catch { fetchFindings(findingsPage) }
  }

  const renderActions = (f: Finding) => (
    <div className="flex items-center gap-0.5">
      <ActionBtn onClick={() => handleUpdate(f.id, "acknowledged")} title="Acknowledge" icon={Check} />
      <ActionBtn onClick={() => handleUpdate(f.id, "resolved")} title="Resolve" icon={CheckCircle} variant="success" />
      <ActionBtn onClick={() => handleUpdate(f.id, "false_positive")} title="Mark False Positive" icon={Flag} variant="warning" />
      <ActionBtn onClick={() => handleUpdate(f.id, "internal_resolved")} title="Internal Resolve (hide)" icon={EyeOff} variant="muted" />
      <ActionBtn onClick={() => handleEscalate(f.id)} title="Escalate" icon={Send} variant="default" />
      <ActionBtn onClick={() => handleDelete(f.id, f.title)} title="Force Delete (admin only)" icon={Trash2} variant="danger" />
    </div>
  )

  const summaryTotal = Object.values(summary).reduce((a, b) => a + b, 0)
  const criticalCount = summary.critical || 0
  const highCount = summary.high || 0

  return (
    <div className="flex flex-col gap-0">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-primary/10 border border-primary/20">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Security Operations Center</h2>
              <p className="text-xs text-muted-foreground">
                {lastScan?.timestamp
                  ? `Last scan ${formatTimeAgo(lastScan.timestamp)}`
                  : "No scan data — run a scan to start"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchFindings(findingsPage)}
            disabled={findingsLoading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${findingsLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            onClick={handleScan}
            disabled={scanRunning}
            className="h-8 gap-1.5 text-xs"
          >
            <ScanLine className="h-3.5 w-3.5" />
            {scanRunning ? "Scanning…" : "Run Scan"}
          </Button>
        </div>
      </div>

      {/* ── Summary Stats ───────────────────────────────────────────────── */}
      {tab === "findings" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pb-5">
          <StatCard label="Total Open" value={findingsTotal} color="default" />
          <StatCard
            label="Critical"
            value={criticalCount}
            color={criticalCount > 0 ? "red" : "default"}
            sub={criticalCount > 0 ? "Needs attention" : "All clear"}
          />
          <StatCard
            label="High"
            value={highCount}
            color={highCount > 0 ? "orange" : "default"}
          />
          <StatCard
            label="Other"
            value={Math.max(0, summaryTotal - criticalCount - highCount)}
            color="default"
            sub="Med / Low / Info"
          />
        </div>
      )}

      {/* ── Tab Navigation ──────────────────────────────────────────────── */}
      <div className="flex border-b border-border mb-5 overflow-x-auto gap-0 -mx-0">
        {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as any)}
            className={`
              relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium
              whitespace-nowrap transition-colors border-b-2 -mb-px
              ${tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }
            `}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {id === "findings" && findingsTotal > 0 && (
              <span className={`
                ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none
                ${criticalCount > 0 ? "bg-red-500 text-white" : "bg-secondary text-muted-foreground"}
              `}>
                {findingsTotal}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Findings Tab ──────────────────────────────────────────────── */}
      {tab === "findings" && (
        <div className="flex flex-col gap-4">
          {/* Filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setFindingsPage(1) }}
                className="border border-border bg-card text-xs px-2.5 py-1.5 rounded text-foreground min-w-[120px]"
              >
                <option value="open">Open</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
                <option value="false_positive">False Positive</option>
                <option value="all">All Statuses</option>
              </select>
              <select
                value={severityFilter}
                onChange={e => { setSeverityFilter(e.target.value); setFindingsPage(1) }}
                className="border border-border bg-card text-xs px-2.5 py-1.5 rounded text-foreground min-w-[130px]"
              >
                <option value="">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </select>
            </div>
            {/* Severity pill summary */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {Object.entries(summary).map(([sev, count]) => {
                const cfg = severityConfig[sev]
                if (!cfg || count === 0) return null
                return (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(severityFilter === sev ? "" : sev)}
                    className={`
                      flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold
                      border transition-all cursor-pointer
                      ${severityFilter === sev ? cfg.badge + " ring-1 ring-current" : cfg.badge}
                    `}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {count} {sev}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary/40 border-b border-border">
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-24">Severity</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Finding</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-28">Source</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-28">Category</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-24">Detected</th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-44">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {findingsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Loading findings…</span>
                      </div>
                    </td>
                  </tr>
                ) : findings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <CheckCircle className="h-8 w-8 text-green-500/50" />
                        <p className="font-medium text-sm">No findings</p>
                        <p className="text-xs">All clear for the selected filters</p>
                      </div>
                    </td>
                  </tr>
                ) : findings.map(f => {
                  const cfg = severityConfig[f.severity]
                  const Icon = severityIcons[f.severity] || Shield
                  return (
                    <tr key={f.id} className={`hover:bg-secondary/20 transition-colors border-l-2 ${cfg?.row || "border-l-transparent"}`}>
                      <td className="px-3 py-2.5">
                        <SeverityBadge severity={f.severity} />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-foreground truncate max-w-xs">{f.title}</p>
                        {f.description && (
                          <p className="text-[10px] text-muted-foreground truncate max-w-xs mt-0.5">{f.description}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-[10px]">
                        {f.serverId?.slice(0, 8) || (f.userId ? `User #${f.userId}` : "—")}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary/60 text-muted-foreground border border-border/60">
                          {f.category}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-[10px] whitespace-nowrap">
                        {f.detectedAt ? formatTimeAgo(f.detectedAt) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end">
                          {renderActions(f)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-2">
            {findingsLoading ? (
              <div className="rounded border border-border bg-card p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : findings.length === 0 ? (
              <div className="rounded border border-border bg-card p-8 text-center flex flex-col items-center gap-2 text-muted-foreground">
                <CheckCircle className="h-8 w-8 text-green-500/50" />
                <p className="text-sm font-medium">No findings</p>
              </div>
            ) : findings.map(f => {
              const cfg = severityConfig[f.severity]
              return (
                <div key={f.id} className={`rounded border bg-card p-3 flex flex-col gap-2 border-l-[3px] ${cfg?.border || "border-border"} ${cfg?.row || ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{f.title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <SeverityBadge severity={f.severity} />
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary/60 text-muted-foreground border border-border/60">
                          {f.category}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {f.detectedAt ? formatTimeAgo(f.detectedAt) : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/40 pt-2">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {f.serverId?.slice(0, 8) || (f.userId ? `User #${f.userId}` : "—")}
                    </span>
                    {renderActions(f)}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page <span className="font-medium text-foreground">{findingsPage}</span> • <span className="font-medium text-foreground">{findingsTotal}</span> total findings
            </p>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={findingsPage <= 1}
                onClick={() => fetchFindings(findingsPage - 1)}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={findings.length < 50}
                onClick={() => fetchFindings(findingsPage + 1)}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Event Log Tab ───────────────────────────────────────────────── */}
      {tab === "events" && (
        <div className="flex flex-col gap-4">
          {eventsLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading event log…</span>
            </div>
          ) : events.length === 0 ? (
            <div className="rounded border border-border bg-card p-12 text-center flex flex-col items-center gap-2 text-muted-foreground">
              <Activity className="h-8 w-8 opacity-30" />
              <p className="text-sm font-medium">No SOC events recorded yet</p>
            </div>
          ) : (
            <div className="rounded border border-border overflow-hidden">
              {events.slice(0, 100).map((ev, idx) => {
                const cfg = ev.metadata?.severity ? severityConfig[ev.metadata.severity] : null
                return (
                  <div
                    key={`${ev.id}-${ev.action}`}
                    className={`flex items-start gap-3 px-4 py-3 text-xs hover:bg-secondary/20 transition-colors ${idx !== 0 ? "border-t border-border/60" : ""}`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {cfg ? (
                        <span className={`w-2 h-2 rounded-full block mt-1 ${cfg.dot}`} />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{ev.metadata?.title || ev.action}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {ev.metadata?.severity && <SeverityBadge severity={ev.metadata.severity} />}
                        <span className="text-[10px] text-muted-foreground">
                          {ev.targetType}: <span className="font-mono">{ev.targetId?.slice(0, 12)}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatTimeAgo(ev.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === "rules" && <RulesTab />}
      {tab === "incidents" && <IncidentsEmbed />}
      {tab === "audit" && <AdminAuditTab />}
      {tab === "settings" && (
        <SocSettingsTab
          totalOpen={summaryTotal}
          lastScan={lastScan}
          onSettingsSaved={() => fetchFindings(findingsPage)}
        />
      )}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description }: {
  icon: typeof Shield; title: string; description?: string
}) {
  return (
    <div className="flex items-start gap-3 pb-1">
      <div className="p-1.5 rounded bg-secondary/60 border border-border/60 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  )
}

// ─── Form Field ───────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-foreground/80">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

const inputCls = "w-full border border-border bg-card px-3 py-2 text-xs rounded text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-shadow"
const selectCls = "w-full border border-border bg-card px-2.5 py-2 text-xs rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"

// ─── Admin Audit Tab ──────────────────────────────────────────────────────────

type AuditEntry = {
  id: number; adminUserId: number; adminName: string; adminEmail?: string; adminAvatarUrl?: string
  action: string; targetId?: string; targetType?: string; metadata?: any
  sessionId?: string; durationMs?: number; ipAddress?: string; timestamp: string
}

function AdminAuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [adminFilter, setAdminFilter] = useState("")
  const [actionFilter, setActionFilter] = useState("")
  const [report, setReport] = useState<any[]>([])
  const [showReport, setShowReport] = useState(false)

  const fetchAudit = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), perPage: "50" })
      if (adminFilter) params.set("adminUserId", adminFilter)
      if (actionFilter) params.set("action", actionFilter)
      const data = await apiFetch(`/api/soc/admin-audit?${params}`)
      setEntries(data?.entries || [])
      setTotal(data?.total || 0)
      setPage(p)
    } catch { setEntries([]) }
    finally { setLoading(false) }
  }, [adminFilter, actionFilter])

  const fetchReport = async () => {
    try {
      const params = new URLSearchParams()
      if (adminFilter) params.set("adminUserId", adminFilter)
      const data = await apiFetch(`/api/soc/admin-audit/report?${params}`)
      setReport(data?.report || [])
      setShowReport(true)
    } catch { setReport([]) }
  }

  useEffect(() => { fetchAudit(1) }, [fetchAudit])

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Admin user ID"
          value={adminFilter}
          onChange={e => { setAdminFilter(e.target.value); setPage(1) }}
          className={`${inputCls} w-32`}
        />
        <input
          type="text"
          placeholder="Filter by action…"
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1) }}
          className={`${inputCls} w-44`}
        />
        <Button size="sm" variant="outline" onClick={() => fetchAudit(page)} disabled={loading} className="h-8 gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={fetchReport} className="h-8 gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          Time Report
        </Button>
      </div>

      {/* Report */}
      {showReport && report.length > 0 && (
        <div className="rounded border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Time Spent by Admin</h3>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[500px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Admin</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Count</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {report.map((r: any, i: number) => (
                <tr key={i} className="hover:bg-secondary/20">
                  <td className="px-4 py-2.5 font-medium">{r.adminName}</td>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">{r.action}</td>
                  <td className="px-4 py-2.5 text-right">{r.count}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                    {r.totalMinutes >= 60 ? `${(r.totalMinutes / 60).toFixed(1)}h` : `${r.totalMinutes}m`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs hidden md:table">
          <thead>
            <tr className="bg-secondary/40 border-b border-border">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Timestamp</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Admin</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Action</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Target</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                <div className="flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
                </div>
              </td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                <p className="font-medium text-sm mb-1">No audit entries yet</p>
                <p className="text-xs">Admin actions will appear here automatically.</p>
              </td></tr>
            ) : entries.map(e => (
              <tr key={e.id} className="hover:bg-secondary/20 transition-colors">
                <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap font-mono text-[10px]">
                  {new Date(e.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 font-medium">{e.adminName}</td>
                <td className="px-4 py-2.5 font-mono text-muted-foreground max-w-[200px] truncate">{e.action}</td>
                <td className="px-4 py-2.5 text-muted-foreground font-mono text-[10px]">{e.targetId || "—"}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {e.durationMs ? `${(e.durationMs / 1000).toFixed(0)}s` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-border/60">
          {loading ? (
            <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">No audit entries yet.</p>
          ) : entries.map(e => (
            <div key={e.id} className="p-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{e.adminName}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {new Date(e.timestamp).toLocaleDateString()}
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground truncate">{e.action}</span>
              {e.durationMs && (
                <span className="text-[10px] text-muted-foreground">{(e.durationMs / 1000).toFixed(0)}s</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page <span className="font-medium text-foreground">{page}</span> • <span className="font-medium text-foreground">{total}</span> total
        </p>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => fetchAudit(page - 1)} className="h-7 w-7 p-0">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" disabled={entries.length < 50} onClick={() => fetchAudit(page + 1)} className="h-7 w-7 p-0">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SocSettingsTab({ totalOpen, lastScan, onSettingsSaved }: {
  totalOpen: number; lastScan: ScanResult | null; onSettingsSaved: () => void
}) {
  const [settings, setSettings] = useState({
    abuseipdbKey: '', threatIpList: '', threatIpCidrList: '', threatImageList: '',
    alertEmail: '', alertWebhookUrl: '', alertSeverities: 'critical,high', scanScheduleMinutes: '30',
    abCpuThreshold: '80', abNetworkThresholdMbps: '100', abCooldownSeconds: '300', abStrikesSuspend: '3', abEnabled: true,
    vpnDpiEnabled: true,
    vpnDpiProtocolActions: 'Tor=suspend\nWireGuard=alert\nOpenVPN=alert\nIPsec/IKEv2=alert\nSoftEther=alert\nTailscale=alert',
    vpnDpiSampleInterval: '300', vpnDpiSampleDuration: '10000',
    vpnDpiBandwidthThreshold: '1', vpnDpiPortScanThreshold: '15',
    vpnDpiPortScanAction: 'alert', vpnDpiRules: '[]',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setSettings(s => ({ ...s, [key]: e.target.value }))

  useEffect(() => {
    apiFetch('/api/soc/admin-settings').then(d => {
      setSettings({
        abuseipdbKey: d.abuseipdbKey || '',
        threatIpList: d.threatIpList || '',
        threatIpCidrList: d.threatIpCidrList || '',
        threatImageList: d.threatImageList || '',
        alertEmail: d.alertEmail || '',
        alertWebhookUrl: d.alertWebhookUrl || '',
        alertSeverities: (d.alertSeverities || ['critical', 'high']).join(','),
        scanScheduleMinutes: String(d.scanScheduleMinutes || '30'),
        abCpuThreshold: String(d.abCpuThreshold || '80'),
        abNetworkThresholdMbps: String(d.abNetworkThresholdMbps || '100'),
        abCooldownSeconds: String(d.abCooldownSeconds || '300'),
        abStrikesSuspend: String(d.abStrikesForSuspend || '3'),
        abEnabled: d.abEnabled !== false,
        vpnDpiEnabled: d.vpnDpiEnabled !== false,
        vpnDpiProtocolActions: (() => {
          const map = d.vpnDpiProtocolActions || {}
          return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n')
        })(),
        vpnDpiSampleInterval: String(d.vpnDpiSampleInterval || '300'),
        vpnDpiSampleDuration: String(d.vpnDpiSampleDuration || '10000'),
        vpnDpiBandwidthThreshold: String(d.vpnDpiBandwidthThreshold || '1'),
        vpnDpiPortScanThreshold: String(d.vpnDpiPortScanThreshold || '15'),
        vpnDpiPortScanAction: d.vpnDpiPortScanAction || 'alert',
        vpnDpiRules: JSON.stringify(d.vpnDpiRules || [], null, 2),
      })
    }).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true); setSaved(false)
    await apiFetch('/api/soc/admin-settings', {
      method: 'PUT',
      body: JSON.stringify({
        ...settings,
        alertSeverities: settings.alertSeverities.split(',').map(s => s.trim()).filter(Boolean),
        scanScheduleMinutes: Number(settings.scanScheduleMinutes) || 30,
        abCpuThreshold: Number(settings.abCpuThreshold) || 80,
        abNetworkThresholdMbps: Number(settings.abNetworkThresholdMbps) || 100,
        abCooldownSeconds: Number(settings.abCooldownSeconds) || 300,
        abStrikesSuspend: Number(settings.abStrikesSuspend) || 3,
        vpnDpiEnabled: settings.vpnDpiEnabled !== false,
        vpnDpiProtocolActions: (() => {
          const map: Record<string, string> = {}
          settings.vpnDpiProtocolActions.split('\n').forEach(line => {
            const [k, ...rest] = line.split('=')
            if (k && rest.length) map[k.trim()] = rest.join('=').trim()
          })
          return map
        })(),
        vpnDpiSampleInterval: Number(settings.vpnDpiSampleInterval) || 300,
        vpnDpiSampleDuration: Number(settings.vpnDpiSampleDuration) || 10000,
        vpnDpiBandwidthThreshold: Number(settings.vpnDpiBandwidthThreshold) || 1,
        vpnDpiPortScanThreshold: Number(settings.vpnDpiPortScanThreshold) || 15,
        vpnDpiPortScanAction: settings.vpnDpiPortScanAction || 'alert',
        vpnDpiRules: (() => { try { return JSON.parse(settings.vpnDpiRules || '[]') } catch { return [] } })(),
      }),
    })
    setSaved(true); setSaving(false); onSettingsSaved()
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" />
      <span className="text-sm">Loading settings…</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-5 max-w-2xl">

      {/* Scan Status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard label="Schedule" value={`${settings.scanScheduleMinutes}m`} sub="Scan interval" />
        <StatCard label="Total Open" value={totalOpen} color={totalOpen > 0 ? "orange" : "default"} />
        <StatCard label="Active Checks" value="17" sub="Detection rules" />
        <StatCard label="Last Scan" value={lastScan ? `${lastScan.created} new` : "N/A"} color="default" />
      </div>

      {/* Threat Intelligence */}
      <div className="rounded border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <SectionHeader icon={Brain} title="Threat Intelligence" />
        </div>
        <div className="p-4 grid gap-3">
          <Field label="AbuseIPDB API Key" hint="Register at abuseipdb.com for threat intelligence lookups">
            <input type="password" value={settings.abuseipdbKey} onChange={set('abuseipdbKey')}
              placeholder="your-api-key" className={inputCls} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="IP Blocklist" hint="Comma-separated IPs">
              <input type="text" value={settings.threatIpList} onChange={set('threatIpList')}
                placeholder="1.2.3.4, 5.6.7.8" className={inputCls} />
            </Field>
            <Field label="CIDR Blocklist" hint="Comma-separated ranges">
              <input type="text" value={settings.threatIpCidrList} onChange={set('threatIpCidrList')}
                placeholder="10.0.0.0/8" className={inputCls} />
            </Field>
          </div>
          <Field label="Docker Image Blocklist">
            <input type="text" value={settings.threatImageList} onChange={set('threatImageList')}
              placeholder="bad/image:tag" className={inputCls} />
          </Field>
        </div>
      </div>

      {/* Alerting */}
      <div className="rounded border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <SectionHeader icon={Zap} title="Alerting" description="Fallback for unowned findings. Per-user alerts configure in Settings → Notifications." />
        </div>
        <div className="p-4 grid gap-3">
          <Field label="Admin Fallback Emails">
            <input type="text" value={settings.alertEmail} onChange={set('alertEmail')}
              placeholder="admin@example.com" className={inputCls} />
          </Field>
          <Field label="Webhook URL" hint="Discord or Slack incoming webhook">
            <input type="text" value={settings.alertWebhookUrl} onChange={set('alertWebhookUrl')}
              placeholder="https://discord.com/api/webhooks/…" className={inputCls} />
          </Field>
          <Field label="Alert Severities" hint="Comma-separated: critical,high,medium">
            <input type="text" value={settings.alertSeverities} onChange={set('alertSeverities')}
              placeholder="critical,high" className={inputCls} />
          </Field>
        </div>
      </div>

      {/* Anti-Abuse Engine */}
      <div className="rounded border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <SectionHeader icon={Shield} title="Anti-Abuse Engine (Wings)" description="Wings nodes fetch these settings every 2 minutes via /api/wings/config" />
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Status">
            <select value={settings.abEnabled ? 'true' : 'false'}
              onChange={e => setSettings(s => ({ ...s, abEnabled: e.target.value === 'true' }))}
              className={selectCls}>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </Field>
          <Field label="CPU Threshold (%)" hint="Strike threshold">
            <input type="number" value={settings.abCpuThreshold} onChange={set('abCpuThreshold')} className={inputCls} />
          </Field>
          <Field label="Network (Mbps)">
            <input type="number" value={settings.abNetworkThresholdMbps} onChange={set('abNetworkThresholdMbps')} className={inputCls} />
          </Field>
          <Field label="Cooldown (s)">
            <input type="number" value={settings.abCooldownSeconds} onChange={set('abCooldownSeconds')} className={inputCls} />
          </Field>
          <Field label="Strikes → Suspend">
            <input type="number" value={settings.abStrikesSuspend} onChange={set('abStrikesSuspend')} className={inputCls} />
          </Field>
        </div>
      </div>

      {/* VPN DPI */}
      <div className="rounded border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <SectionHeader icon={Network} title="VPN Protocol Detection (Wings DPI)" />
        </div>
        <div className="p-4 grid gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Status">
              <select value={settings.vpnDpiEnabled ? 'true' : 'false'}
                onChange={e => setSettings(s => ({ ...s, vpnDpiEnabled: e.target.value === 'true' }))}
                className={selectCls}>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </Field>
            <Field label="Sample Interval (s)">
              <input type="number" value={settings.vpnDpiSampleInterval} onChange={set('vpnDpiSampleInterval')} className={inputCls} />
            </Field>
            <Field label="Sample Duration (ms)">
              <input type="number" value={settings.vpnDpiSampleDuration} onChange={set('vpnDpiSampleDuration')} className={inputCls} />
            </Field>
            <Field label="Min Traffic Delta (KB)" hint="Skip idle containers">
              <input type="number" value={settings.vpnDpiBandwidthThreshold} onChange={set('vpnDpiBandwidthThreshold')} className={inputCls} />
            </Field>
            <Field label="Port Scan Threshold">
              <input type="number" value={settings.vpnDpiPortScanThreshold} onChange={set('vpnDpiPortScanThreshold')} className={inputCls} />
            </Field>
            <Field label="Port Scan Action">
              <select value={settings.vpnDpiPortScanAction} onChange={set('vpnDpiPortScanAction')} className={selectCls}>
                <option value="alert">Alert only</option>
                <option value="suspend">Suspend server</option>
              </select>
            </Field>
          </div>
          <Field label="Protocol Actions" hint="One per line: Protocol=action (alert|suspend)">
            <textarea
              value={settings.vpnDpiProtocolActions}
              onChange={set('vpnDpiProtocolActions')}
              rows={6}
              placeholder={"Tor=suspend\nWireGuard=alert\nOpenVPN=alert"}
              className={`${inputCls} font-mono resize-none`}
            />
          </Field>
          <Field label="Custom DPI Rules (JSON array)" hint="Each rule: { pattern, protocol, action }. Wings picks up within 2 minutes — no redeploy needed.">
            <textarea
              value={settings.vpnDpiRules}
              onChange={set('vpnDpiRules')}
              rows={4}
              placeholder='[{"pattern":"BitTorrent","protocol":"bittorrent","action":"alert"}]'
              className={`${inputCls} font-mono resize-none`}
            />
          </Field>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pb-2">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save Settings"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-green-500 font-medium">
            <CheckCircle className="h-3.5 w-3.5" /> Settings saved
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Rules Tab ────────────────────────────────────────────────────────────────

function RulesTab() {
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [showHandbook, setShowHandbook] = useState(false)
  const [nodeStatus, setNodeStatus] = useState<any[]>([])
  const [currentVersion, setCurrentVersion] = useState('')

  const fetchRules = async () => {
    setLoading(true)
    try { const d = await apiFetch('/api/soc/detection-rules'); setRules(d?.rules || []) }
    catch { setRules([]) }
    finally { setLoading(false) }
  }

  const fetchNodeStatus = async () => {
    try {
      const d = await apiFetch('/api/soc/node-status')
      setNodeStatus(d?.nodes || [])
      setCurrentVersion(d?.currentConfigVersion || '')
    } catch { setNodeStatus([]) }
  }

  useEffect(() => { fetchRules(); fetchNodeStatus() }, [])

  const toggleRule = async (id: number, enabled: boolean) => {
    await apiFetch(`/api/soc/detection-rules/${id}`, { method: 'PUT', body: JSON.stringify({ enabled }) })
    fetchRules()
  }

  const deleteRule = async (id: number) => {
    if (!confirm('Delete this rule?')) return
    await apiFetch(`/api/soc/detection-rules/${id}`, { method: 'DELETE' })
    fetchRules()
  }

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" />
      <span className="text-sm">Loading rules…</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{rules.length}</span> detection rule{rules.length !== 1 ? "s" : ""} defined
        </p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={fetchNodeStatus} className="h-8 gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Nodes
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowHandbook(!showHandbook)} className="h-8 text-xs">
            {showHandbook ? 'Hide Handbook' : 'Handbook'}
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true) }} className="h-8 gap-1.5 text-xs">
            + Add Rule
          </Button>
        </div>
      </div>

      {/* Node sync status */}
      {nodeStatus.length > 0 && (
        <div className="rounded border border-border bg-card p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              Node Config Sync
            </p>
            <span className="text-[10px] text-muted-foreground font-mono bg-secondary/60 px-1.5 py-0.5 rounded">
              v{currentVersion}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {nodeStatus.map((n: any) => (
              <div key={n.id} className="flex items-center justify-between gap-2 p-2 rounded bg-secondary/30">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    n.active ? (n.synced ? 'bg-green-500' : 'bg-yellow-500') : 'bg-red-500'
                  }`} />
                  <span className="text-xs font-medium text-foreground">{n.name}</span>
                  {n.active ? (
                    n.synced ? (
                      <span className="text-[10px] text-green-500 font-medium">synced</span>
                    ) : (
                      <span className="text-[10px] text-yellow-500">stale (node: {n.nodeConfigVersion || 'none'})</span>
                    )
                  ) : (
                    <span className="text-[10px] text-red-500">offline {Math.round(n.lastSeenMs / 1000)}s ago</span>
                  )}
                </div>
                {n.active && !n.synced && (
                  <button
                    onClick={async () => {
                      await apiFetch('/api/wings/command', {
                        method: 'POST',
                        body: JSON.stringify({ nodeId: n.id, action: 'reapply_config' }),
                      })
                      setTimeout(fetchNodeStatus, 5000)
                    }}
                    className="text-[10px] px-2 py-1 rounded border border-orange-500/40 text-orange-500 hover:bg-orange-500/10 transition-colors font-medium"
                  >
                    Reapply
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Nodes fetch config every 2 min. Press Reapply to force immediate refresh.</p>
        </div>
      )}

      {nodeStatus.length === 0 && !loading && (
        <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No Wings nodes connected. Rules only apply when nodes are online and synced.
        </div>
      )}

      {showHandbook && <RuleHandbook />}

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-secondary/10 p-10 text-center flex flex-col items-center gap-2">
          <FileSearch className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No custom detection rules</p>
          <p className="text-xs text-muted-foreground">Create rules to detect patterns in logs, server metrics, and more.</p>
          <Button size="sm" className="mt-2 gap-1.5" onClick={() => { setEditing(null); setShowForm(true) }}>
            + Create first rule
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((r: any) => {
            const sevCfg = severityConfig[r.severity]
            return (
              <div
                key={r.id}
                className={`rounded border bg-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-l-[3px] ${sevCfg?.row || "border-l-transparent"} ${sevCfg?.border || "border-border"}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{r.name}</span>
                    <SeverityBadge severity={r.severity} />
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary/60 text-muted-foreground border border-border/60">
                      {r.category}
                    </span>
                    {r.visibility === 'staff_only' && (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-500">
                        <EyeOff className="h-2.5 w-2.5" /> staff only
                      </span>
                    )}
                    {r.createsIncident && (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-500">
                        <Siren className="h-2.5 w-2.5" /> incident
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-1">{r.triggerCount || 0} hits</span>
                  </div>
                  {r.description && (
                    <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                    {(r.sources || []).join(', ')} • {r.scope}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => toggleRule(r.id, !r.enabled)}
                    className={`text-[10px] px-2.5 py-1 rounded-full font-semibold border transition-colors ${
                      r.enabled
                        ? 'bg-green-500/15 border-green-500/30 text-green-500'
                        : 'bg-secondary border-border text-muted-foreground'
                    }`}
                  >
                    {r.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => { setEditing(r); setShowForm(true) }}
                    className="text-[10px] px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteRule(r.id)}
                    className="text-[10px] px-2.5 py-1 rounded border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <RuleForm
          initial={editing}
          onSaved={() => { setShowForm(false); fetchRules() }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

// ─── Rule Handbook ────────────────────────────────────────────────────────────

function RuleHandbook() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setExpanded(e => ({ ...e, [k]: !e[k] }))

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border border-border rounded overflow-hidden">
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded[id] ? "rotate-180" : ""}`} />
      </button>
      {expanded[id] && (
        <div className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-2 max-h-[65vh] overflow-y-auto rounded border border-border bg-card p-3">
      <p className="text-xs font-semibold text-foreground px-1 pb-1">Detection Rule Handbook</p>

      <Section id="structure" title="Condition Structure">
        <p className="mb-2">Rules use a <b>Wazuh-style JSON condition tree</b> with a top-level <code className="bg-secondary/40 px-1 rounded">operator</code> (and/or) and a <code className="bg-secondary/40 px-1 rounded">rules</code> array.</p>
        <pre className="bg-secondary/20 border border-border rounded p-2 text-[10px] overflow-x-auto">{`{
  "operator": "or",
  "rules": [
    { "field": "file.name", "operator": "regex", "value": "(xmrig|miner)" },
    { "field": "process.name", "operator": "contains", "value": "xmrig" }
  ]
}`}</pre>
      </Section>

      <Section id="operators" title="Condition Operators">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {[
            ['equals', 'Exact match (case-insensitive)'],
            ['not_equals', 'Does not match'],
            ['contains', 'Field contains substring'],
            ['not_contains', 'Does not contain substring'],
            ['regex', 'Matches regex pattern'],
            ['not_regex', 'Does NOT match regex'],
            ['gt / gte', 'Greater than / or equal (numeric)'],
            ['lt / lte', 'Less than / or equal (numeric)'],
            ['exists', 'Field is present — no value needed'],
            ['not_exists', 'Field is absent — no value needed'],
          ].map(([op, desc]) => (
            <div key={op} className="flex gap-2 p-1.5 rounded border border-border/60 bg-secondary/10">
              <code className="shrink-0 bg-secondary/40 px-1 rounded text-[10px] text-foreground font-medium">{op}</code>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="fields" title="Field Reference">
        <div className="flex flex-col gap-2">
          {[
            {
              src: "user_log", desc: "User & agent actions",
              fields: ["action", "userId", "targetId", "targetType", "ipAddress", "timestamp", "metadata.*"]
            },
            {
              src: "soc_data", desc: "Wings telemetry, DPI results, anti-abuse samples",
              fields: ["serverId", "metrics.cpu", "metrics.networkRx", "metrics.networkTx", "metrics.dpiHits", "metrics.strikeCount"]
            },
            {
              src: "server_config", desc: "Server provisioning data",
              fields: ["uuid", "name", "nodeId", "userId", "suspended", "cpu", "memory", "disk", "state", "image"]
            },
            {
              src: "file_scan", desc: "Wings file scan — each file is a separate event",
              fields: ["file.name"]
            },
            {
              src: "wings_processes", desc: "Running processes on servers",
              fields: ["process.name", "process.pid", "process.cpu", "process.memory"]
            },
          ].map(({ src, desc, fields }) => (
            <div key={src} className="border border-border/60 rounded p-2 bg-secondary/10">
              <p className="font-semibold text-foreground text-[11px] mb-0.5">{src}</p>
              <p className="mb-1">{desc}</p>
              <div className="flex flex-wrap gap-1">
                {fields.map(f => (
                  <code key={f} className="bg-secondary/40 px-1 rounded text-[10px] text-foreground">{f}</code>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="frequency" title="Frequency Thresholds">
        <p className="mb-2">Fire only when conditions match at least <code className="bg-secondary/40 px-1 rounded">count</code> times within a sliding <code className="bg-secondary/40 px-1 rounded">windowSeconds</code> window.</p>
        <pre className="bg-secondary/20 border border-border rounded p-2 text-[10px]">{`{ "count": 5, "windowSeconds": 300 }`}</pre>
      </Section>

      <Section id="correlation" title="Cross-Source Correlation">
        <p className="mb-2">Trigger when N distinct values of a field appear across matched events within the frequency window.</p>
        <pre className="bg-secondary/20 border border-border rounded p-2 text-[10px]">{`{ "field": "targetId", "minSources": 3 }`}</pre>
      </Section>

      <Section id="recipes" title="Common Rule Recipes">
        <div className="flex flex-col gap-1.5">
          {[
            ['Brute force detection', 'user_log | action contains "fail" + frequency {count:5, windowSeconds:300}'],
            ['Crypto miner file scan', 'file_scan | file.name regex "(xmrig|minerd|cpuminer|t-rex)"'],
            ['Miner process detection', 'wings_processes | process.name regex "(xmrig|xmr-stak)"'],
            ['Foreign IP login alert', 'user_log | action contains "login" + metadata.country not_equals "US"'],
            ['High CPU abuse', 'soc_data | metrics.cpu gte 90 + frequency {count:3, windowSeconds:600}'],
            ['Multi-target attack', 'user_log | action contains "fail" + correlation {field:"targetId", minSources:3}'],
          ].map(([title, recipe]) => (
            <div key={title} className="flex flex-col gap-0.5 p-2 rounded border border-border/60 bg-secondary/10">
              <span className="font-semibold text-foreground text-[11px]">{title}</span>
              <span className="text-[10px]">{recipe}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="nodesync" title="Node Config Sync">
        <p className="mb-1.5">Wings nodes poll <code className="bg-secondary/40 px-1 rounded">/api/wings/config</code> every 2 minutes.</p>
        <ul className="space-y-1">
          <li><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5" /><b className="text-foreground">Synced</b> — node has latest config</li>
          <li><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1.5" /><b className="text-foreground">Stale</b> — click Reapply to force refresh</li>
          <li><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" /><b className="text-foreground">Offline</b> — no heartbeat in 2+ minutes</li>
        </ul>
      </Section>
    </div>
  )
}

// ─── Rule Form ────────────────────────────────────────────────────────────────

const VALID_OPERATORS = ['equals', 'not_equals', 'contains', 'not_contains', 'regex', 'not_regex', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists']

const FIELD_OPTIONS = [
  { v: 'action', l: 'action', src: 'user_log' },
  { v: 'userId', l: 'userId', src: 'user_log' },
  { v: 'targetId', l: 'targetId (server UUID)', src: 'user_log' },
  { v: 'targetType', l: 'targetType', src: 'user_log' },
  { v: 'ipAddress', l: 'ipAddress', src: 'user_log' },
  { v: 'file.name', l: 'file.name', src: 'file_scan' },
  { v: 'process.name', l: 'process.name', src: 'wings_processes' },
  { v: 'process.cpu', l: 'process.cpu', src: 'wings_processes' },
  { v: 'process.memory', l: 'process.memory', src: 'wings_processes' },
  { v: 'metadata.country', l: 'metadata.country', src: 'user_log' },
  { v: 'metadata.command', l: 'metadata.command', src: 'user_log' },
  { v: 'metadata.serverName', l: 'metadata.serverName', src: 'user_log' },
  { v: 'metadata.reason', l: 'metadata.reason', src: 'user_log' },
  { v: 'metadata.powerAction', l: 'metadata.powerAction', src: 'user_log' },
  { v: 'suspended', l: 'suspended (bool)', src: 'server_config' },
  { v: 'cpu', l: 'cpu', src: 'server_config' },
  { v: 'memory', l: 'memory', src: 'server_config' },
  { v: 'state', l: 'state', src: 'server_config' },
  { v: 'image', l: 'image', src: 'server_config' },
  { v: 'serverId', l: 'serverId', src: 'soc_data' },
]

const FIELD_SOURCES: Record<string, string[]> = {
  action: ['user_log'], userId: ['user_log', 'server_config'],
  targetId: ['user_log'], targetType: ['user_log'], ipAddress: ['user_log'],
  serverId: ['soc_data'], uuid: ['server_config'], name: ['server_config'],
  nodeId: ['server_config'], suspended: ['server_config'], cpu: ['server_config'],
  memory: ['server_config'], disk: ['server_config'], state: ['server_config'],
  image: ['server_config'], 'file.name': ['file_scan'],
  'process.name': ['wings_processes'], 'process.pid': ['wings_processes'],
  'process.cpu': ['wings_processes'], 'process.memory': ['wings_processes'],
  metadata: ['user_log', 'soc_data', 'server_config'],
}

function getSourcesForField(field: string): string[] {
  const root = field.split('.')[0]
  return FIELD_SOURCES[root] || FIELD_SOURCES[field] || []
}

function RuleForm({ initial, onSaved, onCancel }: { initial?: any; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name || '')
  const [desc, setDesc] = useState(initial?.description || '')
  const [severity, setSeverity] = useState(initial?.severity || 'medium')
  const [category, setCategory] = useState(initial?.category || 'other')
  const [sources, setSources] = useState((initial?.sources || ['user_log']).join(', '))
  const [scope, setScope] = useState(initial?.scope || 'global')
  const [scopeId, setScopeId] = useState(initial?.scopeId || '')
  const [conditionsJson, setConditionsJson] = useState(
    JSON.stringify(initial?.conditions || { operator: 'and', rules: [{ field: 'action', operator: 'contains', value: 'fail' }] }, null, 2)
  )
  const [frequencyJson, setFrequencyJson] = useState(initial?.frequency ? JSON.stringify(initial.frequency, null, 2) : '')
  const [correlationJson, setCorrelationJson] = useState(initial?.correlation ? JSON.stringify(initial.correlation, null, 2) : '')
  const [visibility, setVisibility] = useState(initial?.visibility || 'public')
  const [createsIncident, setCreatesIncident] = useState(initial?.createsIncident || false)
  const [saving, setSaving] = useState(false)
  const [validation, setValidation] = useState<{ ok: boolean; messages: string[] } | null>(null)
  const [visualMode, setVisualMode] = useState(false)
  const [visualRoot, setVisualRoot] = useState<any>(() => {
    try {
      return JSON.parse(initial?.conditions
        ? JSON.stringify(initial.conditions)
        : '{"operator":"and","rules":[{"field":"action","operator":"contains","value":"fail"}]}'
      )
    } catch { return { operator: 'and', rules: [{ field: 'action', operator: 'contains', value: 'fail' }] } }
  })

  useEffect(() => { if (visualMode) setConditionsJson(JSON.stringify(visualRoot, null, 2)) }, [visualRoot, visualMode])

  const renderVisualGroup = (group: any, setGroup: (g: any) => void): React.ReactNode => (
    <div className="border border-border/60 rounded p-2.5 flex flex-col gap-2 bg-secondary/10">
      <div className="flex items-center gap-2">
        <select
          value={group.operator}
          onChange={e => setGroup({ ...group, operator: e.target.value })}
          className="border border-border bg-card px-2 py-1 text-xs rounded"
        >
          <option value="and">AND — all must match</option>
          <option value="or">OR — any can match</option>
        </select>
        <span className="text-[10px] text-muted-foreground">{group.rules.length} condition(s)</span>
        <div className="flex-1" />
        <button
          onClick={() => setGroup({ ...group, rules: [...group.rules, { field: 'action', operator: 'contains', value: '' }] })}
          className="text-[10px] px-2 py-1 rounded border border-border hover:bg-secondary/60"
        >+ Condition</button>
        <button
          onClick={() => setGroup({ ...group, rules: [...group.rules, { operator: 'and', rules: [{ field: 'action', operator: 'contains', value: '' }] }] })}
          className="text-[10px] px-2 py-1 rounded border border-border hover:bg-secondary/60"
        >+ Group</button>
      </div>
      {group.rules.map((r: any, i: number) => (
        <div key={i} className="pl-3 border-l-2 border-primary/20">
          {r.operator && r.rules ? (
            renderVisualGroup(r, (g) => {
              const newRules = [...group.rules]; newRules[i] = g
              setGroup({ ...group, rules: newRules })
            })
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <select
                value={r.field || ''}
                onChange={e => { const newRules = [...group.rules]; newRules[i] = { ...r, field: e.target.value }; setGroup({ ...group, rules: newRules }) }}
                className="border border-border bg-card px-1.5 py-1 text-[10px] rounded min-w-[140px]"
              >
                <option value="">— select field —</option>
                {FIELD_OPTIONS.map(f => {
                  const selectedSrcs = sources.split(',').map((s: string) => s.trim()).filter(Boolean)
                  const srcOk = !f.src || selectedSrcs.includes(f.src)
                  return <option key={f.v} value={f.v}>{f.l}{!srcOk ? ` (needs ${f.src})` : ''}</option>
                })}
              </select>
              <select
                value={r.operator || 'contains'}
                onChange={e => { const newRules = [...group.rules]; newRules[i] = { ...r, operator: e.target.value }; setGroup({ ...group, rules: newRules }) }}
                className="border border-border bg-card px-1.5 py-1 text-[10px] rounded"
              >
                {VALID_OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              {!['exists', 'not_exists'].includes(r.operator) && (
                <input
                  value={r.value || ''}
                  onChange={e => { const newRules = [...group.rules]; newRules[i] = { ...r, value: e.target.value }; setGroup({ ...group, rules: newRules }) }}
                  placeholder="value"
                  className="border border-border bg-card px-2 py-1 text-[10px] rounded flex-1 min-w-[80px]"
                />
              )}
              <button
                onClick={() => { const newRules = group.rules.filter((_: any, idx: number) => idx !== i); setGroup({ ...group, rules: newRules }) }}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/15 text-red-500 font-bold"
              >×</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )

  const validateRule = () => {
    const msgs: string[] = []
    const selectedSources = sources.split(',').map((s: string) => s.trim()).filter(Boolean)
    const fieldSourceProblems: string[] = []

    try {
      const c = JSON.parse(conditionsJson)
      if (!c.operator || !['and', 'or'].includes(c.operator)) msgs.push('Conditions: missing or invalid "operator"')
      if (!Array.isArray(c.rules) || c.rules.length === 0) msgs.push('Conditions: "rules" must be a non-empty array')

      const checkRules = (rules: any[]) => {
        for (const r of rules) {
          if (r.operator && r.rules) { checkRules(r.rules); continue }
          if (!r.field) msgs.push(`Missing "field" in a condition`)
          if (!r.operator) msgs.push(`Missing "operator" in a condition`)
          else if (!VALID_OPERATORS.includes(r.operator)) msgs.push(`Unknown operator: "${r.operator}"`)
          if (r.operator && !['exists', 'not_exists'].includes(r.operator) && r.value === undefined) {
            msgs.push(`Operator "${r.operator}" requires a "value"`)
          }
          if (r.field) {
            const supported = getSourcesForField(r.field)
            if (supported.length > 0 && !supported.some(s => selectedSources.includes(s))) {
              fieldSourceProblems.push(`"${r.field}" needs source: ${supported.join(' or ')}`)
            }
          }
        }
      }
      checkRules(c.rules)
      msgs.push(...fieldSourceProblems)
      if (msgs.length === 0) msgs.push('✓ Conditions: valid')
    } catch { msgs.push('✗ Conditions: invalid JSON') }

    if (frequencyJson.trim()) {
      try {
        const f = JSON.parse(frequencyJson)
        if (typeof f.count !== 'number' || f.count < 1) msgs.push('Frequency: "count" must be ≥ 1')
        else if (typeof f.windowSeconds !== 'number' || f.windowSeconds < 1) msgs.push('Frequency: "windowSeconds" must be ≥ 1')
        else msgs.push('✓ Frequency: valid')
      } catch { msgs.push('✗ Frequency: invalid JSON') }
    }

    if (correlationJson.trim()) {
      try {
        const cr = JSON.parse(correlationJson)
        if (typeof cr.field !== 'string' || !cr.field) msgs.push('Correlation: "field" required')
        else if (typeof cr.minSources !== 'number' || cr.minSources < 2) msgs.push('Correlation: "minSources" must be ≥ 2')
        else msgs.push('✓ Correlation: valid')
        if (!frequencyJson.trim()) msgs.push('⚠ Correlation requires a frequency window')
      } catch { msgs.push('✗ Correlation: invalid JSON') }
    }

    const ok = msgs.every(m => m.startsWith('✓') || m.startsWith('⚠'))
    setValidation({ ok, messages: msgs })
  }

  const save = async () => {
    setSaving(true)
    try {
      let conditions
      try { conditions = JSON.parse(conditionsJson) } catch { alert('Invalid conditions JSON'); setSaving(false); return }
      const body: any = {
        name, description: desc, severity, category,
        sources: sources.split(',').map((s: string) => s.trim()).filter(Boolean),
        scope, visibility, createsIncident, conditions,
      }
      if (scope !== 'global') body.scopeId = scopeId
      if (frequencyJson) { try { body.frequency = JSON.parse(frequencyJson) } catch {} }
      if (correlationJson) { try { body.correlation = JSON.parse(correlationJson) } catch {} }

      const url = initial?.id ? `/api/soc/detection-rules/${initial.id}` : '/api/soc/detection-rules'
      await apiFetch(url, { method: initial?.id ? 'PUT' : 'POST', body: JSON.stringify(body) })
      onSaved()
    } catch (e) { console.error('save rule failed', e) }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded border-2 border-primary/20 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{initial?.id ? 'Edit Rule' : 'New Detection Rule'}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary/60">✕</button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Basic info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Rule Name">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SSH brute force detection"
              className={inputCls} />
          </Field>
          <Field label="Description">
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What this rule detects…"
              className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Severity">
            <select value={severity} onChange={e => setSeverity(e.target.value)} className={selectCls}>
              {['critical', 'high', 'medium', 'low', 'info'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select value={category} onChange={e => setCategory(e.target.value)} className={selectCls}>
              {['intrusion_detection', 'resource_anomaly', 'server_posture', 'login_anomaly', 'access_control', 'malware', 'configuration', 'other'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Visibility">
            <select value={visibility} onChange={e => setVisibility(e.target.value)} className={selectCls}>
              <option value="public">Public</option>
              <option value="staff_only">Staff Only</option>
            </select>
          </Field>
          <Field label="Scope">
            <select value={scope} onChange={e => setScope(e.target.value)} className={selectCls}>
              <option value="global">Global</option>
              <option value="server">Server</option>
              <option value="user">User</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Sources (comma-separated)" hint="user_log, soc_data, server_config, file_scan, wings_processes">
            <input value={sources} onChange={e => setSources(e.target.value)} placeholder="user_log"
              className={`${inputCls} font-mono`} />
          </Field>
          {scope !== 'global' && (
            <Field label="Scope ID">
              <input value={scopeId} onChange={e => setScopeId(e.target.value)} className={inputCls} />
            </Field>
          )}
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-2 p-3 rounded bg-secondary/30 border border-border/60">
          <input type="checkbox" id="createsIncident" checked={createsIncident}
            onChange={e => setCreatesIncident(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary" />
          <label htmlFor="createsIncident" className="text-xs text-foreground/80 cursor-pointer">
            Create incident in Incidents tab (for abuse enforcement tracking)
          </label>
        </div>

        {/* Conditions */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-foreground/80">Conditions</label>
            <button
              onClick={() => {
                if (!visualMode) { try { setVisualRoot(JSON.parse(conditionsJson)) } catch {} }
                else setConditionsJson(JSON.stringify(visualRoot, null, 2))
                setVisualMode(!visualMode)
              }}
              className="text-[10px] px-2.5 py-1 rounded border border-border hover:bg-secondary/60 text-muted-foreground transition-colors"
            >
              {visualMode ? '{ } Code' : '⬡ Visual'}
            </button>
          </div>

          {visualMode ? (
            <div className="max-h-[350px] overflow-y-auto rounded border border-border bg-secondary/5 p-2">
              {renderVisualGroup(visualRoot, (g) => setVisualRoot({ ...g }))}
            </div>
          ) : (
            <div className="rounded border border-border overflow-hidden" style={{ height: 200 }}>
              <Suspense fallback={
                <div className="h-full bg-secondary/10 flex items-center justify-center text-xs text-muted-foreground gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading editor…
                </div>
              }>
                <MonacoEditor
                  language="json" theme="vs-dark" value={conditionsJson}
                  onChange={(v) => setConditionsJson(v || '')}
                  options={{ ...DEFAULT_EDITOR_SETTINGS, fontSize: 12, lineNumbers: 'off', folding: false, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on' }}
                />
              </Suspense>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1 font-mono opacity-60">
            {'{"operator":"and","rules":[{"field":"action","operator":"contains","value":"fail"}]}'}
          </p>
        </div>

        {/* Frequency & Correlation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground/80 mb-1.5 block">
              Frequency <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <div className="rounded border border-border overflow-hidden" style={{ height: 80 }}>
              <Suspense fallback={<div className="h-full bg-secondary/10 flex items-center justify-center text-xs text-muted-foreground">Loading…</div>}>
                <MonacoEditor language="json" theme="vs-dark" value={frequencyJson || ' '}
                  onChange={(v) => setFrequencyJson((v || '').trim() === '' ? '' : (v || ''))}
                  options={{ ...DEFAULT_EDITOR_SETTINGS, fontSize: 11, lineNumbers: 'off', folding: false, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on' }}
                />
              </Suspense>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-mono opacity-60">{"{ count: 5, windowSeconds: 300 }"}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/80 mb-1.5 block">
              Correlation <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <div className="rounded border border-border overflow-hidden" style={{ height: 80 }}>
              <Suspense fallback={<div className="h-full bg-secondary/10 flex items-center justify-center text-xs text-muted-foreground">Loading…</div>}>
                <MonacoEditor language="json" theme="vs-dark" value={correlationJson || ' '}
                  onChange={(v) => setCorrelationJson((v || '').trim() === '' ? '' : (v || ''))}
                  options={{ ...DEFAULT_EDITOR_SETTINGS, fontSize: 11, lineNumbers: 'off', folding: false, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on' }}
                />
              </Suspense>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-mono opacity-60">{"{ field: 'targetId', minSources: 3 }"}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/60">
          <Button size="sm" variant="outline" onClick={validateRule} className="gap-1.5 h-8">
            <Search className="h-3.5 w-3.5" /> Validate
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !name} className="gap-1.5 h-8">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : initial?.id ? 'Update Rule' : 'Create Rule'}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} className="h-8">Cancel</Button>
        </div>

        {/* Validation results */}
        {validation && (
          <div className={`rounded border p-3 flex flex-col gap-1 ${validation.ok ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
            {validation.messages.map((m, i) => {
              const isOk = m.startsWith('✓')
              const isWarn = m.startsWith('⚠')
              const isHint = m.startsWith('💡')
              const colorCls = isOk ? 'text-green-500' : isWarn ? 'text-yellow-500' : isHint ? 'text-blue-400' : 'text-red-500'
              const Icon = isOk ? CheckCircle : isWarn ? AlertTriangle : isHint ? Lightbulb : X
              return (
                <p key={i} className={`text-xs flex items-start gap-1.5 ${colorCls}`}>
                  <Icon className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{m.replace(/^[✓✗⚠💡]\s?/, '')}</span>
                </p>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Incidents Embed ──────────────────────────────────────────────────────────

function IncidentsEmbed() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 p-3 rounded border border-border bg-secondary/20 text-xs text-muted-foreground">
        <Siren className="h-4 w-4 text-orange-500 shrink-0" />
        Abuse incidents detected by Wings nodes and enforcement rules appear here.
      </div>
      <AntiAbuseTab />
    </div>
  )
}