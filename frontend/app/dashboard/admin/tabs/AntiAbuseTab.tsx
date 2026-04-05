"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { useLocale, useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  Archive,
  Ban,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Incident = {
  id: number
  createdAt?: string
  status?: string
  reviewedAt?: string | null
  serverId?: string | null
  serverName?: string | null
  suspectedServerIds?: string[]
  suspectedServerNames?: string[]
  detectionType?: string
  enforcementAction?: string
  strikeCount?: number | null
  reason?: string
  nodeName?: string | null
  sourceIp?: string | null
  targetIp?: string | null
  targetPort?: number | null
  suspendAttempted?: boolean
  suspendSuccess?: boolean
  aiRiskScore?: number | null
  aiCategory?: string | null
  aiSummary?: string | null
  aiRecommendedAction?: string | null
  aiConfidence?: number | null
}

type AntiAbuseAgent = {
  agentId: string
  detectorName: string
  nodeName: string
  lastSeenAt: string
  ageMs: number
  active: boolean
  pid?: number | null
  version?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRiskLevel(score?: number | null): "critical" | "high" | "medium" | "low" | "none" {
  if (score == null) return "none"
  if (score >= 90) return "critical"
  if (score >= 70) return "high"
  if (score >= 40) return "medium"
  return "low"
}

const RISK_CONFIG = {
  critical: { bar: "bg-red-500",     text: "text-red-400",     badge: "border-red-500/30 bg-red-500/10 text-red-400" },
  high:     { bar: "bg-orange-500",  text: "text-orange-400",  badge: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
  medium:   { bar: "bg-yellow-500",  text: "text-yellow-400",  badge: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400" },
  low:      { bar: "bg-emerald-500", text: "text-emerald-400", badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  none:     { bar: "bg-muted",       text: "text-muted-foreground", badge: "border-border bg-secondary/50 text-muted-foreground" },
} as const

const STATUS_CONFIG: Record<string, { badge: string }> = {
  pending:  { badge: "border-blue-500/30 bg-blue-500/10 text-blue-400"       },
  resolved: { badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  dismissed:{ badge: "border-border bg-secondary/50 text-muted-foreground"   },
  archived: { badge: "border-border bg-secondary/50 text-muted-foreground"   },
}

function getStatusBadge(status?: string) {
  return STATUS_CONFIG[status ?? "pending"] ?? STATUS_CONFIG.pending
}

function formatAgentAge(ms: number, t: ReturnType<typeof useTranslations>) {
  if (!Number.isFinite(ms) || ms <= 0) return t("agents.justNow")
  const s = Math.floor(ms / 1000)
  if (s < 60) return t("agents.secondsAgo", { count: s })
  if (s < 3600) return t("agents.minutesAgo", { count: Math.floor(s / 60) })
  return t("agents.hoursAgo", { count: Math.floor(s / 3600) })
}

function formatDate(d?: string, locale?: string, fallback = "—") {
  if (!d) return fallback
  return new Date(d).toLocaleDateString(locale, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function RiskBar({ score, naLabel }: { score?: number | null; naLabel: string }) {
  const level = getRiskLevel(score)
  const cfg = RISK_CONFIG[level]
  return (
    <div className="flex items-center gap-2 min-w-[72px]">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${score ?? 0}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums shrink-0 ${cfg.text}`}>
        {score ?? naLabel}
      </span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AntiAbuseTab() {
  const t = useTranslations("adminAntiAbuseTab")
  const locale = useLocale()

  const [items, setItems]     = useState<Incident[]>([])
  const [agents, setAgents]   = useState<AntiAbuseAgent[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [sort, setSort]       = useState<"aiRisk" | "createdAt">("aiRisk")
  const [order, setOrder]     = useState<"asc" | "desc">("desc")
  const [minRisk, setMinRisk] = useState("0")
  const [search, setSearch]   = useState("")

  const [updatingId, setUpdatingId]       = useState<number | null>(null)
  const [selectedIds, setSelectedIds]     = useState<number[]>([])
  const [expandedIds, setExpandedIds]     = useState<Set<number>>(new Set())

  const PAGE_SIZE = 25

  // ── Data ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (targetPage?: number) => {
    const nextPage = Math.max(1, targetPage ?? page)
    setLoading(true)
    try {
      const query = new URLSearchParams()
      query.set("page", String(nextPage))
      query.set("limit", String(PAGE_SIZE))
      query.set("sort", sort)
      query.set("order", order)
      const min = Number(minRisk)
      if (Number.isFinite(min) && min > 0) query.set("minRisk", String(min))
      if (search.trim()) query.set("search", search.trim())

      const res: any = await apiFetch(`${API_ENDPOINTS.adminAntiAbuseIncidents}?${query}`)
      setItems(Array.isArray(res?.items) ? res.items : [])
      setAgents(Array.isArray(res?.agents) ? res.agents : [])
      setTotal(Number.isFinite(Number(res?.total)) ? Number(res.total) : 0)
      const sp = Number(res?.page)
      setPage(Number.isFinite(sp) && sp > 0 ? Math.floor(sp) : nextPage)
    } catch {
      setItems([]); setAgents([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, sort, order, minRisk, search])

  useEffect(() => { load() }, [load])

  // ── Actions ───────────────────────────────────────────────────────────────

  const updateStatus = useCallback(async (id: number, action: "resolve" | "dismiss") => {
    setUpdatingId(id)
    try {
      await apiFetch(
        API_ENDPOINTS.adminAntiAbuseIncidentStatus.replace(":id", String(id)),
        { method: "POST", body: JSON.stringify({ action }) }
      )
      await load(page)
    } finally { setUpdatingId(null) }
  }, [load, page])

  const bulkUpdate = useCallback(async (action: "resolve" | "dismiss" | "archive") => {
    if (!selectedIds.length) return
    setUpdatingId(-1)
    try {
      await apiFetch(API_ENDPOINTS.adminAntiAbuseIncidentsBulkStatus, {
        method: "POST", body: JSON.stringify({ ids: selectedIds, action }),
      })
      setSelectedIds([])
      await load(page)
    } finally { setUpdatingId(null) }
  }, [selectedIds, load, page])

  const deleteOne = useCallback(async (id: number) => {
    if (!window.confirm(t("confirm.deleteOne"))) return
    setUpdatingId(id)
    try {
      await apiFetch(
        API_ENDPOINTS.adminAntiAbuseIncidentDelete.replace(":id", String(id)),
        { method: "DELETE" }
      )
      setSelectedIds((p) => p.filter((v) => v !== id))
      await load(page)
    } finally { setUpdatingId(null) }
  }, [load, page, t])

  const bulkDelete = useCallback(async () => {
    if (!selectedIds.length) return
    if (!window.confirm(t("confirm.bulkDelete", { count: selectedIds.length }))) return
    setUpdatingId(-1)
    try {
      await apiFetch(API_ENDPOINTS.adminAntiAbuseIncidentsBulkDelete, {
        method: "POST", body: JSON.stringify({ ids: selectedIds }),
      })
      setSelectedIds([])
      await load(page)
    } finally { setUpdatingId(null) }
  }, [selectedIds, load, page, t])

  // ── Selection ─────────────────────────────────────────────────────────────

  const allSelected = items.length > 0 && items.every((i) => selectedIds.includes(i.id))

  const toggleAll = useCallback(() => {
    if (allSelected) {
      const s = new Set(items.map((i) => i.id))
      setSelectedIds((p) => p.filter((id) => !s.has(id)))
    } else {
      setSelectedIds((p) => Array.from(new Set([...p, ...items.map((i) => i.id)])))
    }
  }, [allSelected, items])

  const toggleOne = useCallback((id: number) =>
    setSelectedIds((p) => p.includes(id) ? p.filter((v) => v !== id) : [...p, id])
  , [])

  const toggleExpand = useCallback((id: number) =>
    setExpandedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  , [])

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalPages   = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const activeAgents = useMemo(() => agents.filter((a) => a.active), [agents])

  const getStatusLabel = useCallback((status?: string) => {
    switch (status) {
      case "resolved":
        return t("status.resolved")
      case "dismissed":
        return t("status.dismissed")
      case "archived":
        return t("status.archived")
      case "pending":
      case undefined:
        return t("status.pending")
      default:
        return status
    }
  }, [t])

  const summary = useMemo(() => ({
    high:      items.filter((x) => (x.aiRiskScore ?? 0) >= 80).length,
    suspended: items.filter((x) => !!x.suspendSuccess).length,
  }), [items])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* ── Search / header bar ── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4">

          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder={t("search.placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); load(1) } }}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setPage(1); load(1) }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filters + refresh */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value as any); setPage(1) }}
              className="h-8 rounded-lg border border-border bg-secondary/50 px-2 text-xs text-foreground outline-none cursor-pointer"
            >
              <option value="aiRisk">{t("filters.sortRisk")}</option>
              <option value="createdAt">{t("filters.sortCreated")}</option>
            </select>
            <select
              value={order}
              onChange={(e) => { setOrder(e.target.value as any); setPage(1) }}
              className="h-8 rounded-lg border border-border bg-secondary/50 px-2 text-xs text-foreground outline-none cursor-pointer"
            >
              <option value="desc">{t("filters.desc")}</option>
              <option value="asc">{t("filters.asc")}</option>
            </select>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2 h-8">
              <span className="text-xs text-muted-foreground shrink-0">{t("filters.minRisk")}</span>
              <input
                type="number" min={0} max={100} value={minRisk}
                onChange={(e) => { setMinRisk(e.target.value); setPage(1) }}
                className="w-10 bg-transparent text-xs text-foreground outline-none"
              />
            </div>
            <button
              onClick={() => { setPage(1); load(1) }}
              className="h-8 px-3 rounded-lg border border-border bg-secondary/50 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
            >
              {t("actions.apply")}
            </button>
            <button
              onClick={() => load()}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title={t("actions.refresh")}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Active agents strip */}
        {activeAgents.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-4 pb-3 pt-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">
              {t("agents.title")}
            </span>
            {activeAgents.map((a) => (
              <span key={a.agentId} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[11px] text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="font-medium">{a.detectorName}</span>
                <span className="text-muted-foreground hidden sm:inline">@{a.nodeName} · {formatAgentAge(a.ageMs, t)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t("summary.total"),        value: total,                icon: Shield,      valueClass: "" },
          { label: t("summary.highRisk"),      value: summary.high,         icon: ShieldAlert, valueClass: "text-red-400" },
          { label: t("summary.suspended"),     value: summary.suspended,    icon: Ban,         valueClass: "text-orange-400" },
          { label: t("summary.activeAgents"),  value: activeAgents.length,  icon: Zap,         valueClass: "text-emerald-400" },
        ].map(({ label, value, icon: Icon, valueClass }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground truncate">{label}</p>
              <p className={`text-lg font-bold leading-none ${valueClass || "text-foreground"}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Bulk actions bar (only when selection active) ── */}
      {selectedIds.length > 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground shrink-0">
            {selectedIds.length} {t("bulk.selected")}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            {(["resolve", "dismiss", "archive"] as const).map((action) => (
              <button
                key={action}
                onClick={() => bulkUpdate(action)}
                disabled={updatingId !== null}
                className="h-7 px-3 rounded-lg border border-border bg-secondary/50 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
              >
                {t(`actions.bulk${action.charAt(0).toUpperCase() + action.slice(1)}`)}
              </button>
            ))}
            <button
              onClick={bulkDelete}
              disabled={updatingId !== null}
              className="h-7 px-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              {t("actions.bulkDelete", { count: selectedIds.length })}
            </button>
          </div>
          <button
            onClick={() => setSelectedIds([])}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Desktop table ── */}
      <div className="rounded-xl border border-border bg-card hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">{t("table.server")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.detection")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.risk")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.status")}</th>
                <th className="px-4 py-3 text-left font-medium">{t("table.time")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                /* Skeleton rows */
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-4 rounded bg-secondary" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-32 rounded bg-secondary" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-secondary" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 rounded bg-secondary" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 rounded-full bg-secondary" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-secondary" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 rounded bg-secondary ml-auto" /></td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <ShieldCheck className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">{t("states.empty")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const level = getRiskLevel(item.aiRiskScore)
                  const riskCfg = RISK_CONFIG[level]
                  const statusCfg = getStatusBadge(item.status)
                  const isUpdating = updatingId === item.id
                  const isExpanded = expandedIds.has(item.id)

                  return (
                    <>
                      <tr
                        key={item.id}
                        className="border-b border-border/50 hover:bg-secondary/20 transition-colors group"
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleOne(item.id)}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                        </td>

                        {/* Server */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
                              {item.serverName || item.serverId || t("common.unknownServer")}
                            </span>
                            {item.nodeName && (
                              <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                                {item.nodeName}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Detection */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-foreground">{item.detectionType || t("common.na")}</span>
                            <span className="text-[11px] text-muted-foreground">{item.enforcementAction || t("common.na")}</span>
                          </div>
                        </td>

                        {/* Risk */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1.5">
                            <RiskBar score={item.aiRiskScore} naLabel={t("common.na")} />
                            <Badge variant="outline" className={`text-[10px] w-fit ${riskCfg.badge}`}>
                              {t(`riskLevels.${level}`)}
                            </Badge>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className={`text-[10px] w-fit ${statusCfg.badge}`}>
                              {getStatusLabel(item.status)}
                            </Badge>
                            {item.suspendSuccess && (
                              <Badge variant="outline" className="text-[10px] w-fit border-orange-500/30 bg-orange-500/10 text-orange-400">
                                {t("labels.suspended")}
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Time */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{formatDate(item.createdAt, locale, t("common.na"))}</span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => toggleExpand(item.id)}
                              title={t("actions.details")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                            >
                              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                            </button>
                            <button
                              onClick={() => updateStatus(item.id, "resolve")}
                              disabled={isUpdating}
                              title={t("actions.markSolved")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors disabled:opacity-40"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => updateStatus(item.id, "dismiss")}
                              disabled={isUpdating}
                              title={t("actions.dismiss")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteOne(item.id)}
                              disabled={isUpdating}
                              title={t("actions.delete")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr key={`${item.id}-detail`} className="border-b border-border/50 bg-secondary/10">
                          <td />
                          <td colSpan={6} className="px-4 py-3">
                            <div className="flex flex-col gap-3">
                              {/* IPs + meta */}
                              <div className="grid grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-1 text-xs">
                                {[
                                  { label: t("labels.source"),   value: item.sourceIp  },
                                  { label: t("labels.target"),   value: item.targetIp ? `${item.targetIp}${item.targetPort ? `:${item.targetPort}` : ""}` : null },
                                  { label: t("labels.strikes"),  value: item.strikeCount != null ? String(item.strikeCount) : null },
                                  { label: t("labels.aiAction"), value: item.aiRecommendedAction },
                                ].map(({ label, value }) => (
                                  <div key={label}>
                                    <span className="text-muted-foreground">{label}: </span>
                                    <span className="text-foreground font-medium">{value || t("common.na")}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Reason */}
                              {item.reason && (
                                <p className="text-xs text-foreground/80">{item.reason}</p>
                              )}

                              {/* AI summary */}
                              {item.aiSummary && (
                                <div className="flex gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2">
                                  <Brain className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                                  <p className="text-xs text-foreground/80">{item.aiSummary}</p>
                                </div>
                              )}

                              {/* Suspected servers */}
                              {Array.isArray(item.suspectedServerNames) && item.suspectedServerNames.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {t("labels.attachedCandidates")}:{" "}
                                  <span className="text-foreground">{item.suspectedServerNames.join(", ")}</span>
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile cards ── */}
      <div className="flex flex-col gap-3 lg:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 rounded bg-secondary shrink-0" />
                <div className="h-4 w-36 rounded bg-secondary" />
                <div className="h-5 w-14 rounded-full bg-secondary ml-auto" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary" />
              <div className="h-4 w-48 rounded bg-secondary" />
              <div className="grid grid-cols-3 gap-px">
                {[1, 2, 3].map((j) => <div key={j} className="h-9 rounded bg-secondary" />)}
              </div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12">
            <div className="flex flex-col items-center gap-2">
              <ShieldCheck className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t("states.empty")}</p>
            </div>
          </div>
        ) : (
          items.map((item) => {
            const level     = getRiskLevel(item.aiRiskScore)
            const riskCfg   = RISK_CONFIG[level]
            const statusCfg = getStatusBadge(item.status)
            const isUpdating = updatingId === item.id
            const isExpanded = expandedIds.has(item.id)

            return (
              <div key={item.id} className="rounded-xl border border-border bg-card overflow-hidden">

                {/* Top: checkbox + server + status */}
                <div className="flex items-start gap-3 p-4 pb-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleOne(item.id)}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {item.serverName || item.serverId || t("common.unknownServer")}
                        </p>
                        {item.nodeName && (
                          <p className="text-[11px] text-muted-foreground truncate">{item.nodeName}</p>
                        )}
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${statusCfg.badge}`}>
                        {getStatusLabel(item.status)}
                      </Badge>
                    </div>

                    {/* Risk bar */}
                    <RiskBar score={item.aiRiskScore} naLabel={t("common.na")} />
                  </div>
                </div>

                {/* Mid: detection + tier grid */}
                <div className="grid grid-cols-2 gap-px bg-border/50 border-t border-border">
                  <div className="bg-card px-4 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                      {t("table.detection")}
                    </p>
                    <p className="text-xs font-medium text-foreground truncate">{item.detectionType || t("common.na")}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{item.enforcementAction || t("common.na")}</p>
                  </div>
                  <div className="bg-card px-4 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                      {t("table.risk")}
                    </p>
                    <Badge variant="outline" className={`text-[10px] ${riskCfg.badge}`}>
                      {t(`riskLevels.${level}`)}
                    </Badge>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(item.createdAt, locale, t("common.na"))}</p>
                  </div>
                </div>

                {/* Verification-style chips */}
                <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-t border-border bg-secondary/20">
                  {item.suspendSuccess && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-500/10 text-orange-400">
                      <AlertTriangle className="h-2.5 w-2.5" /> {t("labels.suspended")}
                    </span>
                  )}
                  {item.strikeCount != null && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-secondary text-muted-foreground">
                      {item.strikeCount} {t("labels.strikes")}
                    </span>
                  )}
                  {item.aiRiskScore != null && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${riskCfg.badge}`}>
                      <Brain className="h-2.5 w-2.5" /> {item.aiRiskScore}
                    </span>
                  )}
                </div>

                {/* Expandable details */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-2.5 bg-secondary/10">
                    {item.reason && (
                      <p className="text-xs text-foreground/80 leading-relaxed">{item.reason}</p>
                    )}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                      {[
                        { label: t("labels.source"),   value: item.sourceIp },
                        { label: t("labels.target"),   value: item.targetIp ? `${item.targetIp}${item.targetPort ? `:${item.targetPort}` : ""}` : null },
                        { label: t("labels.aiAction"), value: item.aiRecommendedAction },
                        { label: t("labels.id"),       value: String(item.id) },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <span className="text-muted-foreground">{label}: </span>
                          <span className="text-foreground font-medium break-all">{value || t("common.na")}</span>
                        </div>
                      ))}
                    </div>
                    {item.aiSummary && (
                      <div className="flex gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2">
                        <Brain className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-foreground/80">{item.aiSummary}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Action row — mirrors UsersTab bottom bar */}
                <div className="flex items-center border-t border-border divide-x divide-border">
                  <button
                    onClick={() => updateStatus(item.id, "resolve")}
                    disabled={isUpdating}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition-colors"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>{t("actions.markSolved")}</span>
                  </button>
                  <button
                    onClick={() => updateStatus(item.id, "dismiss")}
                    disabled={isUpdating}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 disabled:opacity-40 transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{t("actions.dismiss")}</span>
                  </button>
                  <button
                    onClick={() => toggleExpand(item.id)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                  <button
                    onClick={() => deleteOne(item.id)}
                    disabled={isUpdating}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Pagination ── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">
            {t("pagination.page")}{" "}
            <span className="font-medium text-foreground">{page}</span>{" "}
            {t("pagination.of")}{" "}
            <span className="font-medium text-foreground">{totalPages}</span>
            {total > 0 && (
              <span className="hidden sm:inline">
                {" "}· {t("pagination.total", { count: total })}
              </span>
            )}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm" variant="outline"
              onClick={() => load(page - 1)}
              disabled={loading || page <= 1}
              className="h-8 px-3 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1 sm:mr-0" />
              <span className="hidden sm:inline ml-1">{t("pagination.previous")}</span>
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => load(page + 1)}
              disabled={loading || page >= totalPages}
              className="h-8 px-3 text-xs"
            >
              <span className="hidden sm:inline mr-1">{t("pagination.next")}</span>
              <ChevronRight className="h-3.5 w-3.5 ml-1 sm:ml-0" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}