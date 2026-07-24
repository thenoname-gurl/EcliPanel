"use client"

import { useCallback, useEffect, useState } from "react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import {
  Shield, ShieldAlert, AlertTriangle, AlertCircle,
  Bug, RefreshCw, ScanLine, ChevronLeft, ChevronRight,
  Check, CheckCircle, Flag, Send, Clock, EyeOff, Trash2, Siren,
  Activity, BarChart3, Settings2, X, Lightbulb,
} from "lucide-react"
import AntiAbuseTab from "./AntiAbuseTab"
import RulesTab from "@/components/soc/RulesTab"
import {
  type Finding, type ScanResult, type EventLogEntry, type AuditEntry,
  severityConfig, severityIcons, formatTimeAgo,
  StatCard, ActionBtn, SeverityBadge, FindingActions,
  SectionHeader, Field, inputCls, selectCls,
} from "@/components/soc/shared"

// ─── Tab config ─────────────────────────────────────────────────────────────────

const TAB_CONFIG = [
  { id: "findings", label: "Findings", icon: ShieldAlert },
  { id: "events", label: "Event Log", icon: Activity },
  { id: "rules", label: "Rules", icon: ShieldAlert },
  { id: "incidents", label: "Incidents", icon: Siren },
  { id: "audit", label: "Admin Audit", icon: Clock },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const

type TabId = (typeof TAB_CONFIG)[number]["id"]

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function SocTab() {
  const [tab, setTab] = useState<TabId>("findings")
  const [findings, setFindings] = useState<Finding[]>([])
  const [findingsTotal, setFindingsTotal] = useState(0)
  const [findingsPage, setFindingsPage] = useState(1)
  const [findingsLoading, setFindingsLoading] = useState(true)
  const [scanRunning, setScanRunning] = useState(false)
  const [lastScan, setLastScan] = useState<ScanResult | null>(null)
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [statusFilter, setStatusFilter] = useState("open")
  const [severityFilter, setSeverityFilter] = useState("")
  // ponytail: isAdmin drives whether admin-only actions are visible
  const [isAdmin, setIsAdmin] = useState(false)

  const fetchFindings = useCallback(async (page = 1) => {
    setFindingsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), perPage: "50" })
      if (statusFilter) params.set("status", statusFilter)
      if (severityFilter) params.set("severity", severityFilter)
      const data = await apiFetch(`${API_ENDPOINTS.socSecurityFindings}?${params}`)
      const items: Finding[] = data?.findings || []
      setFindings(items)
      setFindingsTotal(data?.total || 0)
      setFindingsPage(data?.page || page)
      setSummary(data?.summary || {})
      // Detect admin: if total across all statuses is large, likely admin view
      if (data?.total > 0 && !lastScan) {
        const newest = items.reduce((a, b) =>
          new Date(a.detectedAt) > new Date(b.detectedAt) ? a : b, items[0])
        setLastScan({ created: 0, resolved: 0, totalOpen: data?.total || 0, timestamp: newest?.detectedAt })
      }
      // Heuristic: if we got staff_only findings, user is admin
      if (items.some(f => f.metadata?.visibility === 'staff_only')) setIsAdmin(true)
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
    } catch { }
  }, [statusFilter, severityFilter, findingsPage])

  useEffect(() => { fetchFindings(1) }, [fetchFindings])

  // Check admin status on mount
  useEffect(() => {
    apiFetch('/api/soc/admin-settings').then(() => setIsAdmin(true)).catch(() => setIsAdmin(false))
  }, [])

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
      await apiFetch(`${API_ENDPOINTS.socSecurityFindingDetail.replace(":id", String(id))}/${status}`, { method: "PUT" })
    } catch { }
    silentFetch()
  }

  const handleEscalate = async (id: number) => {
    setFindings(prev => prev.map(f => f.id === id ? { ...f, status: 'internal_resolved' as any } : f))
    try {
      await apiFetch(`${API_ENDPOINTS.socSecurityFindingDetail.replace(":id", String(id))}/escalate`, {
        method: "POST", body: JSON.stringify({ action: "reviewed", note: "Staff reviewed" }),
      })
    } catch { }
    silentFetch()
  }

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Force delete finding #${id}: "${title}"?\n\nThis permanently removes the record. Only use for corrupted/stuck items.`)) return
    setFindings(prev => prev.filter(f => f.id !== id))
    try {
      await apiFetch(API_ENDPOINTS.socSecurityFindingDetail.replace(":id", String(id)), { method: "DELETE" })
    } catch { fetchFindings(findingsPage) }
  }

  const summaryTotal = Object.values(summary).reduce((a, b) => a + b, 0)
  const criticalCount = summary.critical || 0
  const highCount = summary.high || 0

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-primary/10 border border-primary/20">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Security Operations Center</h2>
              <p className="text-xs text-muted-foreground">
                {lastScan?.timestamp ? `Last scan ${formatTimeAgo(lastScan.timestamp)}` : "No scan data — run a scan to start"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => fetchFindings(findingsPage)} disabled={findingsLoading}
            className="h-8 w-8 p-0"><RefreshCw className={`h-3.5 w-3.5 ${findingsLoading ? "animate-spin" : ""}`} /></Button>
          {isAdmin && (
            <Button size="sm" onClick={handleScan} disabled={scanRunning} className="h-8 gap-1.5 text-xs">
              <ScanLine className="h-3.5 w-3.5" />{scanRunning ? "Scanning…" : "Run Scan"}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Stats (findings tab only) */}
      {tab === "findings" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pb-5">
          <StatCard label="Total Open" value={findingsTotal} color="default" />
          <StatCard label="Critical" value={criticalCount} color={criticalCount > 0 ? "red" : "default"}
            sub={criticalCount > 0 ? "Needs attention" : "All clear"} />
          <StatCard label="High" value={highCount} color={highCount > 0 ? "orange" : "default"} />
          <StatCard label="Other" value={Math.max(0, summaryTotal - criticalCount - highCount)}
            color="default" sub="Med / Low / Info" />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-border mb-5 overflow-x-auto gap-0 -mx-0">
        {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}>
            <Icon className="h-3.5 w-3.5" />{label}
            {id === "findings" && findingsTotal > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none ${criticalCount > 0 ? "bg-red-500 text-white" : "bg-secondary text-muted-foreground"}`}>{findingsTotal}</span>
            )}
          </button>
        ))}
      </div>

      {/* Findings Tab */}
      {tab === "findings" && (
        <FindingsTabContent
          findings={findings} findingsTotal={findingsTotal} findingsPage={findingsPage}
          findingsLoading={findingsLoading} summary={summary}
          statusFilter={statusFilter} severityFilter={severityFilter}
          isAdmin={isAdmin}
          onStatusFilterChange={v => { setStatusFilter(v); setFindingsPage(1) }}
          onSeverityFilterChange={v => { setSeverityFilter(v); setFindingsPage(1) }}
          onPageChange={fetchFindings}
          onUpdate={handleUpdate} onEscalate={handleEscalate} onDelete={handleDelete}
        />
      )}

      {/* Events Tab */}
      {tab === "events" && <EventsTab />}

      {/* Rules, Incidents, Audit, Settings */}
      {tab === "rules" && <RulesTab />}
      {tab === "incidents" && <IncidentsEmbed />}
      {tab === "audit" && <AdminAuditTab />}
      {tab === "settings" && (
        <SocSettingsTab totalOpen={summaryTotal} lastScan={lastScan}
          onSettingsSaved={() => fetchFindings(findingsPage)} />
      )}
    </div>
  )
}

// ─── Findings Tab Content ───────────────────────────────────────────────────────

function FindingsTabContent({
  findings, findingsTotal, findingsPage, findingsLoading, summary,
  statusFilter, severityFilter, isAdmin,
  onStatusFilterChange, onSeverityFilterChange, onPageChange,
  onUpdate, onEscalate, onDelete,
}: {
  findings: Finding[]; findingsTotal: number; findingsPage: number
  findingsLoading: boolean; summary: Record<string, number>
  statusFilter: string; severityFilter: string; isAdmin: boolean
  onStatusFilterChange: (v: string) => void
  onSeverityFilterChange: (v: string) => void
  onPageChange: (page: number) => void
  onUpdate: (id: number, status: string) => void
  onEscalate: (id: number) => void
  onDelete: (id: number, title: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <select value={statusFilter} onChange={e => onStatusFilterChange(e.target.value)}
            className="border border-border bg-card text-xs px-2.5 py-1.5 rounded text-foreground min-w-[120px]">
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="false_positive">False Positive</option>
            <option value="all">All Statuses</option>
          </select>
          <select value={severityFilter} onChange={e => onSeverityFilterChange(e.target.value)}
            className="border border-border bg-card text-xs px-2.5 py-1.5 rounded text-foreground min-w-[130px]">
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {Object.entries(summary).map(([sev, count]) => {
            const cfg = severityConfig[sev]
            if (!cfg || count === 0) return null
            return (
              <button key={sev} onClick={() => onSeverityFilterChange(severityFilter === sev ? "" : sev)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all cursor-pointer ${severityFilter === sev ? cfg.badge + " ring-1 ring-current" : cfg.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{count} {sev}
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
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                <div className="flex items-center justify-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /><span>Loading findings…</span></div>
              </td></tr>
            ) : findings.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-12 text-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 text-green-500/50" />
                  <p className="font-medium text-sm">No findings</p><p className="text-xs">All clear for the selected filters</p>
                </div>
              </td></tr>
            ) : findings.map(f => {
              const cfg = severityConfig[f.severity]
              return (
                <tr key={f.id} className={`hover:bg-secondary/20 transition-colors border-l-2 ${cfg?.row || "border-l-transparent"}`}>
                  <td className="px-3 py-2.5"><SeverityBadge severity={f.severity} /></td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-foreground truncate max-w-xs">{f.title}</p>
                    {f.description && <p className="text-[10px] text-muted-foreground truncate max-w-xs mt-0.5">{f.description}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground font-mono text-[10px]">{f.serverId?.slice(0, 8) || (f.userId ? `User #${f.userId}` : "—")}</td>
                  <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary/60 text-muted-foreground border border-border/60">{f.category}</span></td>
                  <td className="px-3 py-2.5 text-muted-foreground text-[10px] whitespace-nowrap">{f.detectedAt ? formatTimeAgo(f.detectedAt) : "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end">
                      <FindingActions finding={f} onUpdate={onUpdate} onEscalate={onEscalate} onDelete={onDelete} showAdminActions={isAdmin} />
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
          <div className="rounded border border-border bg-card p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : findings.length === 0 ? (
          <div className="rounded border border-border bg-card p-8 text-center flex flex-col items-center gap-2 text-muted-foreground"><CheckCircle className="h-8 w-8 text-green-500/50" /><p className="text-sm font-medium">No findings</p></div>
        ) : findings.map(f => {
          const cfg = severityConfig[f.severity]
          return (
            <div key={f.id} className={`rounded border bg-card p-3 flex flex-col gap-2 border-l-[3px] ${cfg?.border || "border-border"} ${cfg?.row || ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{f.title}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <SeverityBadge severity={f.severity} />
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary/60 text-muted-foreground border border-border/60">{f.category}</span>
                    <span className="text-[10px] text-muted-foreground">{f.detectedAt ? formatTimeAgo(f.detectedAt) : "—"}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border/40 pt-2">
                <span className="text-[10px] text-muted-foreground font-mono">{f.serverId?.slice(0, 8) || (f.userId ? `User #${f.userId}` : "—")}</span>
                <FindingActions finding={f} onUpdate={onUpdate} onEscalate={onEscalate} onDelete={onDelete} showAdminActions={isAdmin} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page <span className="font-medium text-foreground">{findingsPage}</span> • <span className="font-medium text-foreground">{findingsTotal}</span> total findings</p>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={findingsPage <= 1} onClick={() => onPageChange(findingsPage - 1)} className="h-7 w-7 p-0"><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" disabled={findings.length < 50} onClick={() => onPageChange(findingsPage + 1)} className="h-7 w-7 p-0"><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  )
}

// ─── Events Tab ─────────────────────────────────────────────────────────────────

function EventsTab() {
  const [events, setEvents] = useState<EventLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
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
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading event log…</span></div>
  )

  if (events.length === 0) return (
    <div className="rounded border border-border bg-card p-12 text-center flex flex-col items-center gap-2 text-muted-foreground"><Activity className="h-8 w-8 opacity-30" /><p className="text-sm font-medium">No SOC events recorded yet</p></div>
  )

  return (
    <div className="rounded border border-border overflow-hidden">
      {events.slice(0, 100).map((ev, idx) => {
        const cfg = ev.metadata?.severity ? severityConfig[ev.metadata.severity] : null
        return (
          <div key={`${ev.id}-${ev.action}`} className={`flex items-start gap-3 px-4 py-3 text-xs hover:bg-secondary/20 transition-colors ${idx !== 0 ? "border-t border-border/60" : ""}`}>
            <div className="mt-0.5 shrink-0">{cfg ? <span className={`w-2 h-2 rounded-full block mt-1 ${cfg.dot}`} /> : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}</div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">{ev.metadata?.title || ev.action}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {ev.metadata?.severity && <SeverityBadge severity={ev.metadata.severity} />}
                <span className="text-[10px] text-muted-foreground">{ev.targetType}: <span className="font-mono">{ev.targetId?.slice(0, 12)}</span></span>
                <span className="text-[10px] text-muted-foreground">{formatTimeAgo(ev.timestamp)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Admin Audit Tab ────────────────────────────────────────────────────────────

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
          onChange={e => { setAdminFilter(e.target.value); setPage(1) }} className={`${inputCls} w-32`} />
        <input type="text" placeholder="Filter by action…" value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1) }} className={`${inputCls} w-44`} />
        <Button size="sm" variant="outline" onClick={() => fetchAudit(page)} disabled={loading} className="h-8 gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        <Button size="sm" variant="outline" onClick={fetchReport} className="h-8 gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />Time Report</Button>
      </div>

      {showReport && report.length > 0 && (
        <div className="rounded border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Time Spent by Admin</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead><tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Admin</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Count</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Time</th>
              </tr></thead>
              <tbody className="divide-y divide-border/60">
                {report.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-secondary/20">
                    <td className="px-4 py-2.5 font-medium">{r.adminName}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{r.action}</td>
                    <td className="px-4 py-2.5 text-right">{r.count}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                      {r.totalMinutes >= 60 ? `${(r.totalMinutes / 60).toFixed(1)}h` : `${r.totalMinutes}m`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-xs hidden md:table">
          <thead><tr className="bg-secondary/40 border-b border-border">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Timestamp</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Admin</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Action</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Target</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Duration</th>
          </tr></thead>
          <tbody className="divide-y divide-border/60">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground"><div className="flex items-center justify-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div></td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground"><p className="font-medium text-sm mb-1">No audit entries yet</p><p className="text-xs">Admin actions will appear here automatically.</p></td></tr>
            ) : entries.map(e => (
              <tr key={e.id} className="hover:bg-secondary/20 transition-colors">
                <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap font-mono text-[10px]">{new Date(e.timestamp).toLocaleString()}</td>
                <td className="px-4 py-2.5 font-medium">{e.adminName}</td>
                <td className="px-4 py-2.5 font-mono text-muted-foreground max-w-[200px] truncate">{e.action}</td>
                <td className="px-4 py-2.5 text-muted-foreground font-mono text-[10px]">{e.targetId || "—"}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{e.durationMs ? `${(e.durationMs / 1000).toFixed(0)}s` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="md:hidden divide-y divide-border/60">
          {loading ? <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
            : entries.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">No audit entries yet.</p>
              : entries.map(e => (
                <div key={e.id} className="p-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between"><span className="text-sm font-medium">{e.adminName}</span><span className="text-[10px] text-muted-foreground font-mono">{new Date(e.timestamp).toLocaleDateString()}</span></div>
                  <span className="font-mono text-xs text-muted-foreground truncate">{e.action}</span>
                  {e.durationMs && <span className="text-[10px] text-muted-foreground">{(e.durationMs / 1000).toFixed(0)}s</span>}
                </div>
              ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page <span className="font-medium text-foreground">{page}</span> • <span className="font-medium text-foreground">{total}</span> total</p>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => fetchAudit(page - 1)} className="h-7 w-7 p-0"><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" disabled={entries.length < 50} onClick={() => fetchAudit(page + 1)} className="h-7 w-7 p-0"><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  )
}

// ─── Settings Tab ───────────────────────────────────────────────────────────────

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
        abuseipdbKey: d.abuseipdbKey || '', threatIpList: d.threatIpList || '',
        threatIpCidrList: d.threatIpCidrList || '', threatImageList: d.threatImageList || '',
        alertEmail: d.alertEmail || '', alertWebhookUrl: d.alertWebhookUrl || '',
        alertSeverities: (d.alertSeverities || ['critical', 'high']).join(','),
        scanScheduleMinutes: String(d.scanScheduleMinutes || '30'),
        abCpuThreshold: String(d.abCpuThreshold || '80'),
        abNetworkThresholdMbps: String(d.abNetworkThresholdMbps || '100'),
        abCooldownSeconds: String(d.abCooldownSeconds || '300'),
        abStrikesSuspend: String(d.abStrikesForSuspend || '3'),
        abEnabled: d.abEnabled !== false,
        vpnDpiEnabled: d.vpnDpiEnabled !== false,
        vpnDpiProtocolActions: (() => { const map = d.vpnDpiProtocolActions || {}; return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n') })(),
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
            const [k, ...rest] = line.split('='); if (k && rest.length) map[k.trim()] = rest.join('=').trim()
          }); return map
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
    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading settings…</span></div>
  )

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard label="Schedule" value={`${settings.scanScheduleMinutes}m`} sub="Scan interval" />
        <StatCard label="Total Open" value={totalOpen} color={totalOpen > 0 ? "orange" : "default"} />
        <StatCard label="Active Checks" value="17" sub="Detection rules" />
        <StatCard label="Last Scan" value={lastScan ? `${lastScan.created} new` : "N/A"} color="default" />
      </div>

      <SettingsSection icon={Shield} title="Threat Intelligence">
        <Field label="AbuseIPDB API Key" hint="Register at abuseipdb.com for threat intelligence lookups">
          <input type="password" value={settings.abuseipdbKey} onChange={set('abuseipdbKey')} placeholder="your-api-key" className={inputCls} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="IP Blocklist" hint="Comma-separated IPs"><input type="text" value={settings.threatIpList} onChange={set('threatIpList')} placeholder="1.2.3.4, 5.6.7.8" className={inputCls} /></Field>
          <Field label="CIDR Blocklist" hint="Comma-separated ranges"><input type="text" value={settings.threatIpCidrList} onChange={set('threatIpCidrList')} placeholder="10.0.0.0/8" className={inputCls} /></Field>
        </div>
        <Field label="Docker Image Blocklist"><input type="text" value={settings.threatImageList} onChange={set('threatImageList')} placeholder="bad/image:tag" className={inputCls} /></Field>
      </SettingsSection>

      <SettingsSection icon={Shield} title="Alerting" description="Fallback for unowned findings. Per-user alerts configure in Settings → Notifications.">
        <Field label="Admin Fallback Emails"><input type="text" value={settings.alertEmail} onChange={set('alertEmail')} placeholder="admin@example.com" className={inputCls} /></Field>
        <Field label="Webhook URL" hint="Discord or Slack incoming webhook"><input type="text" value={settings.alertWebhookUrl} onChange={set('alertWebhookUrl')} placeholder="https://discord.com/api/webhooks/…" className={inputCls} /></Field>
        <Field label="Alert Severities" hint="Comma-separated: critical,high,medium"><input type="text" value={settings.alertSeverities} onChange={set('alertSeverities')} placeholder="critical,high" className={inputCls} /></Field>
      </SettingsSection>

      <SettingsSection icon={Shield} title="Anti-Abuse Engine (Wings)" description="Wings nodes fetch these settings every 2 minutes via /api/wings/config">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Status"><select value={settings.abEnabled ? 'true' : 'false'} onChange={e => setSettings(s => ({ ...s, abEnabled: e.target.value === 'true' }))} className={selectCls}><option value="true">Enabled</option><option value="false">Disabled</option></select></Field>
          <Field label="CPU Threshold (%)" hint="Strike threshold"><input type="number" value={settings.abCpuThreshold} onChange={set('abCpuThreshold')} className={inputCls} /></Field>
          <Field label="Network (Mbps)"><input type="number" value={settings.abNetworkThresholdMbps} onChange={set('abNetworkThresholdMbps')} className={inputCls} /></Field>
          <Field label="Cooldown (s)"><input type="number" value={settings.abCooldownSeconds} onChange={set('abCooldownSeconds')} className={inputCls} /></Field>
          <Field label="Strikes → Suspend"><input type="number" value={settings.abStrikesSuspend} onChange={set('abStrikesSuspend')} className={inputCls} /></Field>
        </div>
      </SettingsSection>

      <SettingsSection icon={Shield} title="VPN Protocol Detection (Wings DPI)">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Status"><select value={settings.vpnDpiEnabled ? 'true' : 'false'} onChange={e => setSettings(s => ({ ...s, vpnDpiEnabled: e.target.value === 'true' }))} className={selectCls}><option value="true">Enabled</option><option value="false">Disabled</option></select></Field>
          <Field label="Sample Interval (s)"><input type="number" value={settings.vpnDpiSampleInterval} onChange={set('vpnDpiSampleInterval')} className={inputCls} /></Field>
          <Field label="Sample Duration (ms)"><input type="number" value={settings.vpnDpiSampleDuration} onChange={set('vpnDpiSampleDuration')} className={inputCls} /></Field>
          <Field label="Min Traffic Delta (KB)" hint="Skip idle containers"><input type="number" value={settings.vpnDpiBandwidthThreshold} onChange={set('vpnDpiBandwidthThreshold')} className={inputCls} /></Field>
          <Field label="Port Scan Threshold"><input type="number" value={settings.vpnDpiPortScanThreshold} onChange={set('vpnDpiPortScanThreshold')} className={inputCls} /></Field>
          <Field label="Port Scan Action"><select value={settings.vpnDpiPortScanAction} onChange={set('vpnDpiPortScanAction')} className={selectCls}><option value="alert">Alert only</option><option value="suspend">Suspend server</option></select></Field>
        </div>
        <Field label="Protocol Actions" hint="One per line: Protocol=action (alert|suspend)">
          <textarea value={settings.vpnDpiProtocolActions} onChange={set('vpnDpiProtocolActions')} rows={6} placeholder={"Tor=suspend\nWireGuard=alert\nOpenVPN=alert"} className={`${inputCls} font-mono resize-none`} /></Field>
        <Field label="Custom DPI Rules (JSON array)" hint="Each rule: { pattern, protocol, action }. Wings picks up within 2 minutes — no redeploy needed.">
          <textarea value={settings.vpnDpiRules} onChange={set('vpnDpiRules')} rows={4} placeholder='[{"pattern":"BitTorrent","protocol":"bittorrent","action":"alert"}]' className={`${inputCls} font-mono resize-none`} /></Field>
      </SettingsSection>

      <div className="flex items-center gap-3 pb-2">
        <Button onClick={save} disabled={saving} className="gap-1.5">{saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{saving ? "Saving…" : "Save Settings"}</Button>
        {saved && <span className="flex items-center gap-1.5 text-xs text-green-500 font-medium"><CheckCircle className="h-3.5 w-3.5" /> Settings saved</span>}
      </div>
    </div>
  )
}

function SettingsSection({ icon: Icon, title, description, children }: {
  icon: typeof Shield; title: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="rounded border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/30"><SectionHeader icon={Icon} title={title} description={description} /></div>
      <div className="p-4 grid gap-3">{children}</div>
    </div>
  )
}

// ─── Incidents Embed ────────────────────────────────────────────────────────────

function IncidentsEmbed() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 p-3 rounded border border-border bg-secondary/20 text-xs text-muted-foreground">
        <Siren className="h-4 w-4 text-orange-500 shrink-0" />Abuse incidents detected by Wings nodes and enforcement rules appear here.
      </div>
      <AntiAbuseTab />
    </div>
  )
}
