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

const severityColors: Record<string, string> = {
  critical: "border-red-500/50 bg-red-500/10 text-red-600",
  high: "border-orange-500/50 bg-orange-500/10 text-orange-600",
  medium: "border-yellow-500/50 bg-yellow-500/10 text-yellow-600",
  low: "border-blue-500/50 bg-blue-500/10 text-blue-600",
  info: "border-gray-500/50 bg-gray-500/10 text-gray-600",
}

const severityIcons: Record<string, typeof Shield> = {
  critical: ShieldAlert, high: AlertTriangle, medium: AlertCircle,
  low: Bug, info: Shield,
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

  // ─── Fetch findings ───────────────────────────────────────────────────────

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

  // ─── Fetch SOC event log ──────────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      const data = await apiFetch(`${API_ENDPOINTS.socSecurityFindings}?status=all&perPage=200`)
      // Build event log from all findings
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

  // ─── Trigger scan ──────────────────────────────────────────────────────────

  const handleScan = async () => {
    setScanRunning(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.socSecurityScan, { method: "POST" })
      setLastScan({ ...data, timestamp: new Date().toISOString() })
      fetchFindings(findingsPage)
    } catch (e) { console.error("scan failed", e) }
    finally { setScanRunning(false) }
  }

  // ─── Update finding ────────────────────────────────────────────────────────

  const handleUpdate = async (id: number, status: string) => {
    setFindings(prev => {
      if (statusFilter === 'open' && status !== 'open') {
        return prev.filter(f => f.id !== id)
      }
      return prev.map(f => f.id === id ? { ...f, status } : f)
    })
    try {
      await apiFetch(API_ENDPOINTS.socSecurityFindingDetail.replace(":id", String(id)), {
        method: "PATCH", body: JSON.stringify({ status }),
      })
    } catch { /* revert on next explicit refresh */ }
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

  // ─── Render ────────────────────────────────────────────────────────────────

  const renderActions = (f: Finding) => (
    <>
      <button onClick={(e) => { e.preventDefault(); handleUpdate(f.id, "acknowledged") }} title="Acknowledge"
        className="p-2.5 md:p-0.5 hover:bg-secondary/50 rounded min-w-[44px] min-h-[44px] flex items-center justify-center"><Check className="h-5 w-5 md:h-3 md:w-3" /></button>
      <button onClick={(e) => { e.preventDefault(); handleUpdate(f.id, "resolved") }} title="Resolve"
        className="p-2.5 md:p-0.5 hover:bg-secondary/50 rounded min-w-[44px] min-h-[44px] flex items-center justify-center"><CheckCircle className="h-5 w-5 md:h-3 md:w-3 text-green-600" /></button>
      <button onClick={(e) => { e.preventDefault(); handleUpdate(f.id, "false_positive") }} title="False Positive"
        className="p-2.5 md:p-0.5 hover:bg-secondary/50 rounded min-w-[44px] min-h-[44px] flex items-center justify-center"><Flag className="h-5 w-5 md:h-3 md:w-3 text-orange-600" /></button>
      <button onClick={(e) => { e.preventDefault(); handleUpdate(f.id, "internal_resolved") }} title="Internal Resolve (hide from list)"
        className="p-2.5 md:p-0.5 hover:bg-secondary/50 rounded min-w-[44px] min-h-[44px] flex items-center justify-center"><EyeOff className="h-5 w-5 md:h-3 md:w-3 text-gray-500" /></button>
      <button onClick={(e) => { e.preventDefault(); handleEscalate(f.id) }} title="Escalate"
        className="p-2.5 md:p-0.5 hover:bg-secondary/50 rounded min-w-[44px] min-h-[44px] flex items-center justify-center"><Send className="h-5 w-5 md:h-3 md:w-3 text-blue-600" /></button>
      <button onClick={(e) => { e.preventDefault(); handleDelete(f.id, f.title) }} title="Force Delete (admin only)"
        className="p-2.5 md:p-0.5 hover:bg-red-500/10 rounded min-w-[44px] min-h-[44px] flex items-center justify-center"><Trash2 className="h-5 w-5 md:h-3 md:w-3 text-red-600" /></button>
    </>
  )

  // Summary badges stay global for admin overview
  const summaryTotal = Object.values(summary).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Security Operations Center
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {findingsTotal} findings • {lastScan?.timestamp
              ? `Last scan: ${formatTimeAgo(lastScan.timestamp)}`
              : lastScan ? `${lastScan.created} new, ${lastScan.resolved} resolved` : "Run a scan to start"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleScan} disabled={scanRunning}>
            <ScanLine className="h-4 w-4 mr-1" />
            {scanRunning ? "Scanning..." : "Run Scan"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => fetchFindings(findingsPage)} disabled={findingsLoading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border pb-0 overflow-x-auto">
        {(["findings", "events", "rules", "incidents", "settings", "audit"] as const).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-3 md:px-4 py-2 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === tb ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tb === "findings" ? "Findings" : tb === "events" ? "Event Log" : tb === "rules" ? "Rules" : tb === "incidents" ? "Incidents" : tb === "audit" ? "Admin Audit" : "Settings"}
          </button>
        ))}
      </div>

      {/* ── Findings Tab ─────────────────────────────────────────────────── */}
      {tab === "findings" && (
        <div className="flex flex-col gap-4">
          {/* Severity summary */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary).map(([sev, count]) => {
              const Icon = severityIcons[sev] || Shield
              return (
                <div key={sev} className={`flex items-center gap-1 border px-2 py-0.5 text-xs font-medium ${severityColors[sev]}`}>
                  <Icon className="h-3 w-3" />
                  <span>{count}</span>
                  <span className="opacity-70">{sev}</span>
                </div>
              )
            })}
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setFindingsPage(1) }}
              className="border border-border bg-card text-xs px-2 py-1">
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
              <option value="false_positive">False Positive</option>
              <option value="all">All</option>
            </select>
            <select value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setFindingsPage(1) }}
              className="border border-border bg-card text-xs px-2 py-1">
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Table — desktop (md+) */}
          <div className="hidden md:block border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-secondary/30">
                <tr>
                  <th className="p-2 text-left w-8"></th>
                  <th className="p-2 text-left">Title</th>
                  <th className="p-2 text-left">Server</th>
                  <th className="p-2 text-left">Category</th>
                  <th className="p-2 text-left">Detected</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {findingsLoading ? (
                  <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading...</td></tr>
                ) : findings.length === 0 ? (
                  <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No findings</td></tr>
                ) : findings.map(f => {
                  const Icon = severityIcons[f.severity] || Shield
                  const color = severityColors[f.severity] || ""
                  return (
                    <tr key={f.id} className="hover:bg-secondary/10">
                      <td className="p-2"><Icon className={`h-4 w-4 ${color.split(" ")[2] || ""}`} /></td>
                      <td className="p-2 max-w-xs truncate font-medium">{f.title}</td>
                      <td className="p-2 text-muted-foreground">{f.serverId?.slice(0, 8) || f.userId ? `User #${f.userId}` : "-"}</td>
                      <td className="p-2"><span className="border border-border px-1 py-0.5">{f.category}</span></td>
                      <td className="p-2 text-muted-foreground">{f.detectedAt ? formatTimeAgo(f.detectedAt) : "-"}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-0.5">
                          {renderActions(f)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Cards — mobile (below md) */}
          <div className="md:hidden flex flex-col gap-2">
            {findingsLoading ? (
              <div className="border border-border bg-secondary/10 p-4 text-center text-xs text-muted-foreground">Loading...</div>
            ) : findings.length === 0 ? (
              <div className="border border-border bg-secondary/10 p-4 text-center text-xs text-muted-foreground">No findings</div>
            ) : findings.map(f => {
              const Icon = severityIcons[f.severity] || Shield
              const color = severityColors[f.severity] || ""
              return (
                <div key={f.id} className={`border border-border bg-card p-3 flex flex-col gap-1.5 border-l-2 ${color.split(" ")[0] || ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon className={`h-4 w-4 shrink-0 ${color.split(" ")[2] || ""}`} />
                      <span className="text-sm font-medium truncate">{f.title}</span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {renderActions(f)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                    <span className="border border-border px-1 py-0.5">{f.category}</span>
                    <span>{f.serverId?.slice(0, 8) || f.userId ? `User #${f.userId}` : "-"}</span>
                    <span>{f.detectedAt ? formatTimeAgo(f.detectedAt) : "-"}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {findingsPage} • {findingsTotal} total</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={findingsPage <= 1}
                onClick={() => fetchFindings(findingsPage - 1)}><ChevronLeft className="h-3 w-3" /></Button>
              <Button size="sm" variant="outline" disabled={findings.length < 50}
                onClick={() => fetchFindings(findingsPage + 1)}><ChevronRight className="h-3 w-3" /></Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Event Log Tab ───────────────────────────────────────────────── */}
      {tab === "events" && (
        <div className="flex flex-col gap-4">
          {eventsLoading ? (
            <p className="text-sm text-muted-foreground">Loading event log...</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SOC events recorded yet.</p>
          ) : (
            <div className="border border-border divide-y divide-border">
              {events.slice(0, 100).map(ev => (
                <div key={`${ev.id}-${ev.action}`} className="flex items-start gap-3 p-3 text-sm hover:bg-secondary/10">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground font-medium">{ev.metadata?.title || ev.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {ev.metadata?.severity && <span className={`mr-2 ${severityColors[ev.metadata.severity]?.split(" ")[2] || ""}`}>{ev.metadata.severity}</span>}
                      {ev.targetType}: {ev.targetId?.slice(0, 12)} • {formatTimeAgo(ev.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* ── Rules Tab ─────────────────────────────────────────────────── */}
      {tab === "rules" && <RulesTab />}
      {tab === "incidents" && <IncidentsEmbed />}


      {/* ── Admin Audit Tab ─────────────────────────────────────────────── */}
      {tab === "audit" && <AdminAuditTab />}

      {/* ── Settings Tab ─────────────────────────────────────────────────── */}
      {tab === "settings" && <SocSettingsTab totalOpen={summaryTotal} lastScan={lastScan} onSettingsSaved={() => fetchFindings(findingsPage)} />}
    </div>
  )
}

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
      <div className="flex items-center gap-2 flex-wrap">
        <input type="text" placeholder="Admin user ID" value={adminFilter}
          onChange={e => { setAdminFilter(e.target.value); setPage(1) }}
          className="border border-border bg-card px-2 py-1 text-xs w-28" />
        <input type="text" placeholder="Action filter" value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1) }}
          className="border border-border bg-card px-2 py-1 text-xs w-40" />
        <Button size="sm" variant="outline" onClick={() => fetchAudit(page)} disabled={loading}>
          <RefreshCw className="h-3 w-3 mr-1" />Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={fetchReport}>
          <BarChart3 className="h-3 w-3 mr-1" />Time Report
        </Button>
      </div>

      {showReport && report.length > 0 && (
        <div className="border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />Time Spent by Admin
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/30">
                <tr>
                  <th className="p-2 text-left">Admin</th>
                  <th className="p-2 text-left">Action</th>
                  <th className="p-2 text-right">Count</th>
                  <th className="p-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-secondary/10">
                    <td className="p-2 font-medium">{r.adminName}</td>
                    <td className="p-2 font-mono text-muted-foreground">{r.action}</td>
                    <td className="p-2 text-right">{r.count}</td>
                    <td className="p-2 text-right font-mono">
                      {r.totalMinutes >= 60 ? `${(r.totalMinutes / 60).toFixed(1)}h` : `${r.totalMinutes}m`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="hidden md:block border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-secondary/30">
            <tr>
              <th className="p-2 text-left">Time</th>
              <th className="p-2 text-left">Admin</th>
              <th className="p-2 text-left">Action</th>
              <th className="p-2 text-left">Target</th>
              <th className="p-2 text-right">Spent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Loading...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No audit entries yet. Admin actions will appear here automatically.</td></tr>
            ) : entries.map(e => (
              <tr key={e.id} className="hover:bg-secondary/10">
                <td className="p-2 text-muted-foreground whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                <td className="p-2 font-medium">{e.adminName}</td>
                <td className="p-2 font-mono max-w-xs truncate">{e.action}</td>
                <td className="p-2 text-muted-foreground">{e.targetId || "-"}</td>
                <td className="p-2 text-right text-muted-foreground">
                  {e.durationMs ? `${(e.durationMs / 1000).toFixed(0)}s` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-2">
        {loading ? (
          <p className="text-xs text-muted-foreground p-4">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4">No audit entries yet.</p>
        ) : entries.map(e => (
          <div key={e.id} className="border border-border bg-card p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{e.adminName}</span>
              <span className="text-[10px] text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground truncate">{e.action}</span>
            {e.durationMs ? <span className="text-[10px] text-muted-foreground">{(e.durationMs / 1000).toFixed(0)}s</span> : null}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Page {page} • {total} total</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => fetchAudit(page - 1)}>
            <ChevronLeft className="h-3 w-3" /></Button>
          <Button size="sm" variant="outline" disabled={entries.length < 50} onClick={() => fetchAudit(page + 1)}>
            <ChevronRight className="h-3 w-3" /></Button>
        </div>
      </div>
    </div>
  )
}

// ─── Editable Settings Sub-Component ────────────────────────────────────────

function SocSettingsTab({ totalOpen, lastScan, onSettingsSaved }: {
  totalOpen: number; lastScan: ScanResult | null; onSettingsSaved: () => void
}) {
  const [settings, setSettings] = useState({
    abuseipdbKey: '', threatIpList: '', threatIpCidrList: '', threatImageList: '',
    alertEmail: '', alertWebhookUrl: '', alertSeverities: 'critical,high', scanScheduleMinutes: '30',
    abCpuThreshold: '80', abNetworkThresholdMbps: '100', abCooldownSeconds: '300', abStrikesSuspend: '3', abEnabled: true,
    vpnDpiEnabled: true,
    vpnDpiProtocolActions: 'Tor=suspend\nWireGuard=alert\nOpenVPN=alert\nIPsec/IKEv2=alert\nSoftEther=alert\nTailscale=alert',
    vpnDpiSampleInterval: '300',
    vpnDpiSampleDuration: '10000',
    vpnDpiBandwidthThreshold: '1',
    vpnDpiPortScanThreshold: '15',
    vpnDpiPortScanAction: 'alert',
    vpnDpiRules: '[]',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiFetch('/api/soc/admin-settings').then(d => {
      setSettings({
        abuseipdbKey: d.abuseipdbKey || '',
        threatIpList: d.threatIpList || '',
        threatIpCidrList: d.threatIpCidrList || '',
        threatImageList: d.threatImageList || '',
        alertEmail: d.alertEmail || '',
        alertWebhookUrl: d.alertWebhookUrl || '',
        alertSeverities: (d.alertSeverities || ['critical','high']).join(','),
        scanScheduleMinutes: String(d.scanScheduleMinutes || '30'),
        abCpuThreshold: String(d.abCpuThreshold || '80'),
        abNetworkThresholdMbps: String(d.abNetworkThresholdMbps || '100'),
        abCooldownSeconds: String(d.abCooldownSeconds || '300'),
        abStrikesSuspend: String(d.abStrikesForSuspend || '3'),
        abEnabled: d.abEnabled !== false,
        vpnDpiEnabled: d.vpnDpiEnabled !== false,
        vpnDpiProtocolActions: (() => {
          const map = d.vpnDpiProtocolActions || {};
          return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n');
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
          const map: Record<string, string> = {};
          settings.vpnDpiProtocolActions.split('\n').forEach(line => {
            const [k, ...rest] = line.split('=');
            if (k && rest.length) map[k.trim()] = rest.join('=').trim();
          });
          return map;
        })(),
        vpnDpiSampleInterval: Number(settings.vpnDpiSampleInterval) || 300,
        vpnDpiSampleDuration: Number(settings.vpnDpiSampleDuration) || 10000,
        vpnDpiBandwidthThreshold: Number(settings.vpnDpiBandwidthThreshold) || 1,
        vpnDpiPortScanThreshold: Number(settings.vpnDpiPortScanThreshold) || 15,
        vpnDpiPortScanAction: settings.vpnDpiPortScanAction || 'alert',
        vpnDpiRules: (() => { try { return JSON.parse(settings.vpnDpiRules || '[]'); } catch { return []; } })(),
      }),
    })
    setSaved(true); setSaving(false); onSettingsSaved()
  }

  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading settings...</p>

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Brain className="h-4 w-4" /> Threat Intelligence</h3>
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <label className="text-xs text-muted-foreground">AbuseIPDB API Key (register at abuseipdb.com)</label>
            <input type="password" value={settings.abuseipdbKey} onChange={e => setSettings(s => ({...s, abuseipdbKey: e.target.value}))}
              placeholder="your-api-key" className="w-full border border-border bg-card px-3 py-2 text-xs mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">IP Blocklist (comma-separated)</label>
            <input type="text" value={settings.threatIpList} onChange={e => setSettings(s => ({...s, threatIpList: e.target.value}))}
              placeholder="1.2.3.4, 5.6.7.8" className="w-full border border-border bg-card px-3 py-2 text-xs mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">CIDR Blocklist (comma-separated)</label>
            <input type="text" value={settings.threatIpCidrList} onChange={e => setSettings(s => ({...s, threatIpCidrList: e.target.value}))}
              placeholder="10.0.0.0/8" className="w-full border border-border bg-card px-3 py-2 text-xs mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Docker Image Blocklist</label>
            <input type="text" value={settings.threatImageList} onChange={e => setSettings(s => ({...s, threatImageList: e.target.value}))}
              placeholder="bad/image:tag" className="w-full border border-border bg-card px-3 py-2 text-xs mt-1" />
          </div>
        </div>
      </div>

      <div className="border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Zap className="h-4 w-4" /> Alerting</h3>
        <p className="text-xs text-muted-foreground mb-3">Fallback for unowned findings. Per-user alerts configure in Settings → Notifications.</p>
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <label className="text-xs text-muted-foreground">Admin Fallback Emails</label>
            <input type="text" value={settings.alertEmail} onChange={e => setSettings(s => ({...s, alertEmail: e.target.value}))}
              placeholder="admin@example.com" className="w-full border border-border bg-card px-3 py-2 text-xs mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Webhook URL (Discord/Slack — embed on admin alerts)</label>
            <input type="text" value={settings.alertWebhookUrl} onChange={e => setSettings(s => ({...s, alertWebhookUrl: e.target.value}))}
              placeholder="https://discord.com/api/webhooks/..." className="w-full border border-border bg-card px-3 py-2 text-xs mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Severities (comma-separated)</label>
            <input type="text" value={settings.alertSeverities} onChange={e => setSettings(s => ({...s, alertSeverities: e.target.value}))}
              placeholder="critical,high" className="w-full border border-border bg-card px-3 py-2 text-xs mt-1" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Settings"}</Button>
        {saved && <span className="text-xs text-green-600">✓ Saved</span>}
      </div>

      <div className="border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Shield className="h-4 w-4" /> Anti-Abuse Engine (Wings)</h3>
        <p className="text-xs text-muted-foreground mb-3">Wings nodes fetch these settings every 2 minutes via /api/wings/config.</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className="text-xs text-muted-foreground">Enabled</label>
            <select value={settings.abEnabled ? 'true' : 'false'} onChange={e => setSettings(s => ({...s, abEnabled: e.target.value === 'true'}))}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">CPU Threshold (%)</label>
            <input type="number" value={settings.abCpuThreshold} onChange={e => setSettings(s => ({...s, abCpuThreshold: e.target.value}))}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Network Threshold (Mbps)</label>
            <input type="number" value={settings.abNetworkThresholdMbps} onChange={e => setSettings(s => ({...s, abNetworkThresholdMbps: e.target.value}))}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Cooldown (seconds)</label>
            <input type="number" value={settings.abCooldownSeconds} onChange={e => setSettings(s => ({...s, abCooldownSeconds: e.target.value}))}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Strikes for Suspend</label>
            <input type="number" value={settings.abStrikesSuspend} onChange={e => setSettings(s => ({...s, abStrikesSuspend: e.target.value}))}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
          </div>
        </div>
      </div>

      <div className="border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Zap className="h-4 w-4" /> VPN Protocol Detection (Wings DPI)</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className="text-xs text-muted-foreground">Enabled</label>
            <select value={settings.vpnDpiEnabled ? 'true' : 'false'} onChange={e => setSettings(s => ({...s, vpnDpiEnabled: e.target.value === 'true'}))}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Protocol actions (one per line: Protocol=action)</label>
            <textarea value={settings.vpnDpiProtocolActions} onChange={e => setSettings(s => ({...s, vpnDpiProtocolActions: e.target.value}))}
              rows={6}
              placeholder={"Tor=suspend\nWireGuard=alert\nOpenVPN=alert\nTailscale=alert"}
              className="w-full border border-border bg-card px-3 py-1.5 text-xs mt-1 font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Sample Interval (seconds)</label>
            <input type="number" value={settings.vpnDpiSampleInterval} onChange={e => setSettings(s => ({...s, vpnDpiSampleInterval: e.target.value}))}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Sample Duration (ms)</label>
            <input type="number" value={settings.vpnDpiSampleDuration} onChange={e => setSettings(s => ({...s, vpnDpiSampleDuration: e.target.value}))}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Min traffic delta (KB) — skip idle containers</label>
            <input type="number" value={settings.vpnDpiBandwidthThreshold} onChange={e => setSettings(s => ({...s, vpnDpiBandwidthThreshold: e.target.value}))}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Port scan threshold (unique ports to same IP)</label>
            <input type="number" value={settings.vpnDpiPortScanThreshold} onChange={e => setSettings(s => ({...s, vpnDpiPortScanThreshold: e.target.value}))}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Port scan enforcement</label>
            <select value={settings.vpnDpiPortScanAction} onChange={e => setSettings(s => ({...s, vpnDpiPortScanAction: e.target.value}))}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5">
              <option value="alert">Alert only</option>
              <option value="suspend">Suspend server</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="text-xs text-muted-foreground">Custom DPI Rules (JSON array) — packet payload/protocol name matching</label>
          <textarea value={settings.vpnDpiRules} onChange={e => setSettings(s => ({...s, vpnDpiRules: e.target.value}))}
            rows={5}
            placeholder='[{"pattern":"BitTorrent","protocol":"bittorrent","action":"alert"}]'
            className="w-full border border-border bg-card px-3 py-1.5 text-xs mt-1 font-mono" />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Each rule: pattern (substring to match in packet payload), protocol (label), action (alert|suspend|log).
            Applied at runtime — no Wings redeploy needed. Wings nodes pick this up within 2 minutes.
          </p>
        </div>
      </div>

      <div className="border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Activity className="h-4 w-4" /> Scan Status</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="border border-border bg-secondary/10 p-3"><p className="text-xs text-muted-foreground">Schedule</p><p className="font-mono text-foreground">Every {settings.scanScheduleMinutes} min</p></div>
          <div className="border border-border bg-secondary/10 p-3"><p className="text-xs text-muted-foreground">Total Open</p><p className="font-mono text-foreground">{totalOpen}</p></div>
          <div className="border border-border bg-secondary/10 p-3"><p className="text-xs text-muted-foreground">Checks</p><p className="font-mono text-foreground">17 active</p></div>
          <div className="border border-border bg-secondary/10 p-3"><p className="text-xs text-muted-foreground">Last Scan</p><p className="font-mono text-foreground">{lastScan ? `${lastScan.created} new` : "N/A"}</p></div>
        </div>
      </div>
    </div>
  )
}

// ─── Rules Tab Component ─────────────────────────────────────────────────────

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

  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading rules...</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{rules.length} rule(s) defined.</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => { fetchNodeStatus() }} title="Refresh node status" className="text-[11px] px-2 py-0.5 h-auto">
            <RefreshCw className="h-3 w-3 mr-1" />Nodes
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowHandbook(!showHandbook)} className="text-[11px] px-2 py-0.5 h-auto">
            {showHandbook ? 'Hide Handbook' : 'Handbook'}
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true) }} className="text-[11px] px-2 py-0.5 h-auto">+ Add Rule</Button>
        </div>
      </div>

      {/* Node config sync status */}
      {nodeStatus.length > 0 && (
        <div className="border border-border bg-card p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-foreground">Node Config Sync</p>
            <span className="text-[10px] text-muted-foreground font-mono">v{currentVersion}</span>
          </div>
          {nodeStatus.map((n: any) => (
            <div key={n.id} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${n.active ? (n.synced ? 'bg-green-500' : 'bg-yellow-500') : 'bg-red-500'}`} />
                <span className="text-foreground font-medium">{n.name}</span>
                {n.active ? (
                  n.synced ? (
                    <span className="text-green-600 text-[10px]">synced</span>
                  ) : (
                    <span className="text-yellow-600 text-[10px]">stale (node: {n.nodeConfigVersion || 'none'})</span>
                  )
                ) : (
                  <span className="text-red-600 text-[10px]">offline {Math.round(n.lastSeenMs / 1000)}s</span>
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
                  className="text-[10px] px-2 py-0.5 border border-orange-500/30 text-orange-600 hover:bg-orange-500/10"
                  title="Queue reapply command — delivered on next heartbeat">
                  Reapply
                </button>
              )}
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">Nodes fetch config every 2 min. Press Reapply to force immediate refresh.</p>
        </div>
      )}

      {nodeStatus.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-1 border border-border bg-secondary/5">
          No Wings nodes connected. Rules only apply when nodes are online and synced.
        </p>
      )}

      {showHandbook && <RuleHandbook />}

      {rules.length === 0 ? (
        <div className="border border-border bg-secondary/10 p-8 text-center">
          <p className="text-sm text-muted-foreground">No custom detection rules defined.</p>
          <p className="text-xs text-muted-foreground mt-1">Create rules to detect patterns in logs, server metrics, and more.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((r: any) => (
            <div key={r.id} className="border border-border bg-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{r.name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 border ${r.severity === 'critical' ? 'border-red-500/30 text-red-600' : r.severity === 'high' ? 'border-orange-500/30 text-orange-600' : 'border-yellow-500/30 text-yellow-600'}`}>{r.severity}</span>
                  <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5">{r.category}</span>
                  {r.visibility === 'staff_only' && <span className="text-[10px] px-1.5 py-0.5 border border-purple-500/30 text-purple-600 flex items-center gap-1" title="Only visible to staff"><EyeOff className="h-3 w-3" />staff only</span>}
                  {r.createsIncident && <span className="text-[10px] px-1.5 py-0.5 border border-orange-500/30 text-orange-600 flex items-center gap-1" title="Creates incident in Incidents tab"><Siren className="h-3 w-3" />incident</span>}
                  <span className="text-[10px] text-muted-foreground">{r.triggerCount || 0} hits</span>
                </div>
                {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                <p className="text-[10px] text-muted-foreground mt-1 break-all">
                  Sources: {(r.sources || []).join(', ')} | Scope: {r.scope} | Conditions: {JSON.stringify(r.conditions).slice(0, 80)}...
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 self-end sm:self-start">
                <button onClick={() => toggleRule(r.id, !r.enabled)}
                  className={`text-[10px] px-2 py-0.5 border ${r.enabled ? 'border-green-500/30 text-green-600' : 'border-gray-500/30 text-gray-500'}`}>
                  {r.enabled ? 'ON' : 'OFF'}
                </button>
                <button onClick={() => { setEditing(r); setShowForm(true) }}
                  className="text-[10px] px-2 py-0.5 border border-border text-muted-foreground hover:text-foreground">Edit</button>
                <button onClick={() => deleteRule(r.id)}
                  className="text-[10px] px-2 py-0.5 border border-red-500/20 text-red-600 hover:bg-red-500/10">Del</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <RuleForm initial={editing} onSaved={() => { setShowForm(false); fetchRules() }} onCancel={() => setShowForm(false)} />}
    </div>
  )
}

function RuleHandbook() {
  return (
    <div className="border border-border bg-card p-3 sm:p-5 text-xs leading-relaxed flex flex-col gap-3 sm:gap-4 max-h-[60vh] overflow-y-auto">
      <h3 className="text-sm font-semibold text-foreground">Detection Rule Handbook</h3>

      <section>
        <h4 className="font-medium text-foreground mb-1">Condition Structure</h4>
        <p className="text-muted-foreground">Rules use a <b>Wazuh-style JSON condition tree</b>. Each rule has a top-level <code className="bg-secondary/30 px-1 text-[11px]">operator</code> (<code className="bg-secondary/30 px-1 text-[11px]">and</code> / <code className="bg-secondary/30 px-1 text-[11px]">or</code>) and a <code className="bg-secondary/30 px-1 text-[11px]">rules</code> array of conditions (which can themselves be nested groups).</p>
        <pre className="bg-secondary/10 border border-border p-2 mt-1 text-[11px] overflow-x-auto">{`{
  "operator": "or",
  "rules": [
    { "field": "file.name", "operator": "regex", "value": "(xmrig|miner|cryptonight)" },
    { "field": "process.name", "operator": "contains", "value": "xmrig" }
  ]
}`}</pre>
      </section>

      <section>
        <h4 className="font-medium text-foreground mb-1">Condition Operators</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
          {[
            ['equals', 'Field value matches exactly (case-insensitive)'],
            ['not_equals', 'Field value does not match'],
            ['contains', 'Field value contains substring (case-insensitive)'],
            ['not_contains', 'Field value does not contain substring'],
            ['regex', 'Field value matches regex pattern (case-insensitive, e.g. "(xmrig|xmr-stak)")'],
            ['not_regex', 'Field value does NOT match regex'],
            ['gt / gte', 'Numeric greater-than / greater-or-equal'],
            ['lt / lte', 'Numeric less-than / less-or-equal'],
            ['exists', 'Field is present (not null/undefined) — no value needed'],
            ['not_exists', 'Field is absent or null — no value needed'],
          ].map(([op, desc]) => (
            <div key={op} className="border border-border p-1.5">
              <code className="bg-secondary/30 px-0.5 text-[11px] font-medium">{op}</code>
              <span className="text-muted-foreground ml-1">{desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h4 className="font-medium text-foreground mb-1">Available Source Fields</h4>
        <p className="text-muted-foreground mb-1">Each data source exposes different fields. All support dot-notation for nested access (e.g. <code className="bg-secondary/30 px-1 text-[11px]">metadata.command</code>).</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
          {[
            ['user_log', 'action, userId, targetId, targetType, ipAddress, userAgent, metadata.*, timestamp'],
            ['soc_data', 'eventType, serverId, nodeName, source, severity, metadata.*, timestamp'],
            ['server_config', 'uuid, name, nodeId, userId, suspended, cpu, memory, disk, state, createdAt'],
            ['wings_processes', 'process.name, process.pid, process.cpu, process.memory (from Wings process scan)'],
            ['wings_connections', 'connection.remoteAddr, connection.localPort, connection.protocol, connection.state'],
          ].map(([src, fields]) => (
            <div key={src} className="border border-border p-1.5">
              <code className="bg-secondary/30 px-0.5 text-[11px] font-medium">{src}</code>
              <span className="text-muted-foreground ml-1">{fields}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h4 className="font-medium text-foreground mb-1">File Scanning Rules</h4>
        <p className="text-muted-foreground">Rules with field <code className="bg-secondary/30 px-1 text-[11px]">file.name</code> are used by Wings nodes during server file scans. These replace the old hardcoded suspicious-patterns list — define exactly what you want flagged.</p>
        <p className="text-muted-foreground mt-0.5">Supported operators for file scanning: <b>regex</b>, <b>contains</b>, <b>equals</b>. Each match reports the rule name as the reason and the rule severity as the finding severity.</p>
        <pre className="bg-secondary/10 border border-border p-2 mt-1 text-[11px] overflow-x-auto">{`// Example: flag crypto miners and exposed secrets
{
  "operator": "or",
  "rules": [
    { "field": "file.name", "operator": "regex", "value": "(xmrig|minerd|cpuminer|t-rex|phoenix|lolminer|nbminer|gminer)" },
    { "field": "file.name", "operator": "contains", "value": "miner" },
    { "field": "file.name", "operator": "regex", "value": "(id_rsa|id_ed25519|credentials|password|\\\\.env$)" },
    { "field": "file.name", "operator": "contains", "value": "backdoor" }
  ]
}`}</pre>
      </section>

      <section>
        <h4 className="font-medium text-foreground mb-1">Frequency Thresholds</h4>
        <p className="text-muted-foreground">Optional. Fire only when conditions match <b>at least <code className="bg-secondary/30 px-1 text-[11px]">count</code> times</b> within a sliding <code className="bg-secondary/30 px-1 text-[11px]">windowSeconds</code> window. Prevents flapping on one-off events.</p>
        <pre className="bg-secondary/10 border border-border p-2 mt-1 text-[11px]">{`{ "count": 5, "windowSeconds": 300 }`}</pre>
      </section>

      <section>
        <h4 className="font-medium text-foreground mb-1">Correlation</h4>
        <p className="text-muted-foreground">Optional. Trigger only when a field has <b>N distinct values</b> across matched events. E.g. flag when the same action targets multiple servers.</p>
        <pre className="bg-secondary/10 border border-border p-2 mt-1 text-[11px]">{`{ "field": "targetId", "minSources": 3 }`}</pre>
      </section>

      <section>
        <h4 className="font-medium text-foreground mb-1">Combining Operators</h4>
        <p className="text-muted-foreground">Nest groups freely. An <code className="bg-secondary/30 px-1 text-[11px]">and</code> group ensures ALL sub-conditions match; <code className="bg-secondary/30 px-1 text-[11px]">or</code> fires if ANY match.</p>
        <pre className="bg-secondary/10 border border-border p-2 mt-1 text-[11px] overflow-x-auto">{`{
  "operator": "and",
  "rules": [
    { "field": "action", "operator": "contains", "value": "login" },
    { "field": "action", "operator": "contains", "value": "fail" },
    {
      "operator": "or",
      "rules": [
        { "field": "ipAddress", "operator": "regex", "value": "^(10\\\\.|172\\\\.(1[6-9]|2[0-9]|3[0-1])|192\\\\.168\\\\.)" },
        { "field": "metadata.country", "operator": "not_equals", "value": "US" }
      ]
    }
  ]
}`}</pre>
      </section>

      <section>
        <h4 className="font-medium text-foreground mb-1">Visibility — Staff-Only Findings</h4>
        <p className="text-muted-foreground">Rules set to <b>Staff Only</b> visibility generate findings hidden from end-users (server owners). Use this for abuse/malware detections where you don&apos;t want the abuser to know they were caught. Staff-only findings appear with an <EyeOff className="h-3 w-3 inline text-purple-600" /> <span className="text-purple-600">staff only</span> badge and are only visible to admins with <code className="bg-secondary/30 px-1 text-[11px]">soc:read</code> permission.</p>
      </section>

      <section>
        <h4 className="font-medium text-foreground mb-1">Testing Rules</h4>
        <p className="text-muted-foreground">Use the <b>Test Rule</b> endpoint (<code className="bg-secondary/30 px-1 text-[11px]">POST /api/soc/detection-rules/test</code>) with a sample event to verify your conditions before saving:</p>
        <pre className="bg-secondary/10 border border-border p-2 mt-1 text-[11px] overflow-x-auto">{`curl -X POST /api/soc/detection-rules/test \\
  -H "Content-Type: application/json" \\
  -d '{
    "conditions": {"operator":"or","rules":[{"field":"file.name","operator":"regex","value":"xmrig"}]},
    "event": {"file": {"name": "xmrig-v6.22.0"}}
  }'
// → { "matched": true }`}</pre>
      </section>
    </div>
  )
}

function RuleForm({ initial, onSaved, onCancel }: { initial?: any; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name || '')
  const [desc, setDesc] = useState(initial?.description || '')
  const [severity, setSeverity] = useState(initial?.severity || 'medium')
  const [category, setCategory] = useState(initial?.category || 'other')
  const [sources, setSources] = useState((initial?.sources || ['user_log']).join(', '))
  const [scope, setScope] = useState(initial?.scope || 'global')
  const [scopeId, setScopeId] = useState(initial?.scopeId || '')
  const [conditionsJson, setConditionsJson] = useState(JSON.stringify(initial?.conditions || {operator:'and',rules:[{field:'action',operator:'contains',value:'fail'}]}, null, 2))
  const [frequencyJson, setFrequencyJson] = useState(initial?.frequency ? JSON.stringify(initial.frequency, null, 2) : '')
  const [visibility, setVisibility] = useState(initial?.visibility || 'public')
  const [createsIncident, setCreatesIncident] = useState(initial?.createsIncident || false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      let conditions; try { conditions = JSON.parse(conditionsJson) } catch { alert('Invalid conditions JSON'); setSaving(false); return }
      const body: any = { name, description: desc, severity, category, sources: sources.split(',').map((s: string) => s.trim()).filter(Boolean), scope, visibility, createsIncident, conditions }
      if (scope !== 'global') body.scopeId = scopeId
      if (frequencyJson) { try { body.frequency = JSON.parse(frequencyJson) } catch {} }

      const url = initial?.id ? `/api/soc/detection-rules/${initial.id}` : '/api/soc/detection-rules'
      await apiFetch(url, { method: initial?.id ? 'PUT' : 'POST', body: JSON.stringify(body) })
      onSaved()
    } catch (e) { console.error('save rule failed', e) }
    finally { setSaving(false) }
  }

  return (
    <div className="border-2 border-primary/30 bg-card p-3 sm:p-5 flex flex-col gap-3 sm:gap-4">
      <h3 className="text-sm font-semibold">{initial?.id ? 'Edit Rule' : 'New Rule'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="SSH brute force detection"
            className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Severity</label>
            <select value={severity} onChange={e => setSeverity(e.target.value)} className="w-full border border-border bg-card px-1 sm:px-2 py-1.5 text-xs mt-0.5">
              {['critical','high','medium','low','info'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-border bg-card px-1 sm:px-2 py-1.5 text-xs mt-0.5">
              {['intrusion_detection','resource_anomaly','server_posture','login_anomaly','access_control','malware','configuration','other'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Visibility</label>
            <select value={visibility} onChange={e => setVisibility(e.target.value)} className="w-full border border-border bg-card px-1 sm:px-2 py-1.5 text-xs mt-0.5">
              <option value="public">Public</option>
              <option value="staff_only">Staff Only</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <input type="checkbox" id="createsIncident" checked={createsIncident}
            onChange={e => setCreatesIncident(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary" />
          <label htmlFor="createsIncident" className="text-[10px] text-muted-foreground cursor-pointer">
            Create incident in Incidents tab (for abuse enforcement tracking)
          </label>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">Description</label>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Detects pattern..."
          className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Sources (comma-sep)</label>
          <input value={sources} onChange={e => setSources(e.target.value)} placeholder="user_log"
            className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Scope</label>
          <select value={scope} onChange={e => setScope(e.target.value)} className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5">
            <option value="global">Global</option><option value="server">Server</option><option value="user">User</option>
          </select>
        </div>
        {scope !== 'global' && (
          <div>
            <label className="text-[10px] text-muted-foreground">Scope ID</label>
            <input value={scopeId} onChange={e => setScopeId(e.target.value)}
              className="w-full border border-border bg-card px-2 py-1.5 text-xs mt-0.5" />
          </div>
        )}
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">Conditions (JSON — Wazuh-style)</label>
        <div className="border border-border mt-0.5 overflow-hidden" style={{ height: 200 }}>
          <Suspense fallback={<div className="h-full bg-secondary/10 flex items-center justify-center text-xs text-muted-foreground">Loading editor...</div>}>
            <MonacoEditor
              language="json"
              theme="vs-dark"
              value={conditionsJson}
              onChange={(v) => setConditionsJson(v || '')}
              options={{ ...DEFAULT_EDITOR_SETTINGS, fontSize: 12, lineNumbers: 'off', folding: false, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on' }}
            />
          </Suspense>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {'{"operator":"and","rules":[{"field":"action","operator":"contains","value":"fail"}]}'}
        </p>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">Frequency (JSON, optional)</label>
        <div className="border border-border mt-0.5 overflow-hidden" style={{ height: 80 }}>
          <Suspense fallback={<div className="h-full bg-secondary/10 flex items-center justify-center text-xs text-muted-foreground">Loading editor...</div>}>
            <MonacoEditor
              language="json"
              theme="vs-dark"
              value={frequencyJson || ' '}
              onChange={(v) => setFrequencyJson((v || '').trim() === '' ? '' : (v || ''))}
              options={{ ...DEFAULT_EDITOR_SETTINGS, fontSize: 12, lineNumbers: 'off', folding: false, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on' }}
            />
          </Suspense>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving || !name}>{saving ? 'Saving...' : 'Save Rule'}</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function IncidentsEmbed() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">Abuse incidents detected by Wings nodes. </p>
      <AntiAbuseTab />
    </div>
  )
}
